/**
 * DGV MCP server (stdio). Tools are the whole authoring API — an agent can
 * plan a system without ever touching the JSON by hand:
 *
 *   dgv_catalog → dgv_create → dgv_apply (repeat) → dgv_lint → dgv_layout → dgv_open → dgv_export
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  catalogSummary, emptyDiagram, applyPatch, placeUnpositioned, lint, layout,
  summarizeDiagnostics as diagSummary, outline as textSummary, toMarkdown, toMermaid, toSVG, NODE_KIND_IDS, EDGE_KIND_IDS, STATUS_IDS, FRAME_TONES,
} from '@dgv/core';
import * as store from '@dgv/core/store';
import { probe, DEFAULT_PORT } from './http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const Pos = z.object({ x: z.number(), y: z.number() });
const Port = z.object({
  id: z.string().describe('port id, e.g. "rest", "grpc", "events"'),
  protocol: z.string().optional().describe('http | grpc | ws | sql | ipc | … (see catalog)'),
  dir: z.enum(['in', 'out', 'both']).optional().describe('in = others call it (default), out = it emits'),
  shape: z.string().optional().describe('what crosses it: "JSON /api/v1", "text[] → float[][]"'),
});
const Frame = z.object({
  id: z.string(), label: z.string().optional(),
  parent: z.string().nullable().optional().describe('legacy: frames do not nest — setting this is a lint error (frame/nested)'),
  tone: z.enum(FRAME_TONES).optional(), note: z.string().optional(), ack: z.string().optional().describe('acknowledge this element\'s lint warnings with a one-line reason (they become info)'),
  position: Pos.optional(), size: z.object({ width: z.number(), height: z.number() }).optional(),
});
const Node = z.object({
  id: z.string().describe('stable id: letters, digits, - _ . :'),
  kind: z.enum(NODE_KIND_IDS).optional().describe('required when creating'),
  label: z.string().optional(), sublabel: z.string().optional(), note: z.string().optional(),
  frame: z.string().nullable().optional().describe('frame id this node lives in'),
  tech: z.string().optional().describe('language / runtime / product: "Go", "Svelte 5", "Postgres 16"'),
  status: z.enum(STATUS_IDS).optional(),
  tags: z.array(z.string()).optional(),
  ports: z.array(Port).optional().describe('interfaces this node exposes; edges bind to them'),
  ack: z.string().optional().describe('acknowledge this element\'s lint warnings with a one-line reason (they become info)'),
  position: Pos.optional().describe('omit — DGV places new nodes; use dgv_layout for a full relayout'),
});
const Edge = z.object({
  id: z.string().optional().describe('defaults to "<source>-<target>"'),
  source: z.string(), target: z.string(),
  kind: z.enum(EDGE_KIND_IDS).optional().describe('sync (default) | async | data | import | deploy | control'),
  protocol: z.string().optional(), label: z.string().optional(),
  sourcePort: z.string().optional(), targetPort: z.string().optional().describe('must be a port declared on the target'),
  payload: z.string().optional().describe('what is exchanged: "messages[], tools[]"'),
  note: z.string().optional(),
  ack: z.string().optional().describe('acknowledge this element\'s lint warnings with a one-line reason (they become info)'),
});

const text = (s) => ({ content: [{ type: 'text', text: typeof s === 'string' ? s : JSON.stringify(s, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

export function createServer({ dir } = {}) {
  dir = store.resolveDir(dir);
  const server = new McpServer({ name: 'dgv', version: '0.1.0' }, {
    instructions: `Dia-GramV: plan a system's architecture as a typed, linted diagram BEFORE writing code. Diagrams are files in ${dir} (<name>.dgv.json). Flow: dgv_catalog → dgv_create → dgv_apply (nodes/frames/edges, ports on nodes, protocols on edges) → dgv_lint → fix → dgv_layout → dgv_open. Read dgv_catalog once per session for the allowed kinds.`,
  });

  const lintReport = (doc) => { const d = lint(doc); return { summary: diagSummary(d), diagnostics: d }; };

  server.registerTool('dgv_catalog', {
    title: 'DGV catalog', description: 'Node kinds (with shape + meaning), edge kinds, protocols, statuses. Read once before authoring.',
    inputSchema: {},
  }, async () => text(catalogSummary()));

  server.registerTool('dgv_list', {
    title: 'List diagrams', description: `List diagrams in ${dir} with counts.`, inputSchema: {},
  }, async () => text(store.list(dir)));

  server.registerTool('dgv_read', {
    title: 'Read diagram', description: 'Read a diagram. mode=summary (default) is a compact outline; mode=json is the full document.',
    inputSchema: { name: z.string(), mode: z.enum(['summary', 'json']).optional() },
  }, async ({ name, mode }) => {
    try { const doc = store.read(dir, name); return text(mode === 'json' ? doc : textSummary(doc)); }
    catch (e) { return fail(e.message); }
  });

  server.registerTool('dgv_create', {
    title: 'Create diagram', description: 'Create a new empty diagram file. Fails if it exists (use dgv_apply to change one).',
    inputSchema: { name: z.string().describe('file name, e.g. "my-app"'), title: z.string(), description: z.string().optional() },
  }, async ({ name, title, description }) => {
    try {
      if (store.exists(dir, name)) return fail(`diagram "${name}" already exists`);
      const file = store.write(dir, name, emptyDiagram(title, description ?? ''));
      return text({ ok: true, file, next: 'dgv_apply with frames, nodes (kind + ports), edges (kind + protocol + targetPort)' });
    } catch (e) { return fail(e.message); }
  });

  server.registerTool('dgv_apply', {
    title: 'Apply changes', description: 'Upsert frames/nodes/edges by id (partial objects merge into existing ones) and/or remove by id. New nodes are auto-placed. Returns the lint report — fix errors before moving on.',
    inputSchema: {
      name: z.string(),
      meta: z.object({ title: z.string().optional(), description: z.string().optional(), colorBy: z.enum(['kind', 'status']).optional(), edgeStyle: z.enum(['floating', 'routed', 'straight']).optional().describe('link drawing: floating bezier | routed orthogonally around nodes | straight') }).optional(),
      frames: z.array(Frame).optional(), nodes: z.array(Node).optional(), edges: z.array(Edge).optional(),
      remove: z.object({ frames: z.array(z.string()).optional(), nodes: z.array(z.string()).optional(), edges: z.array(z.string()).optional() }).optional(),
    },
  }, async ({ name, ...patch }) => {
    try {
      const cur = store.read(dir, name);
      for (const e of patch.edges ?? []) if (!e.id) e.id = `${e.source}-${e.target}`;
      for (const f of patch.frames ?? []) if (!f.label && !cur.frames.some((x) => x.id === f.id)) f.label = f.id;
      const { doc, changed } = applyPatch(cur, patch);
      const placed = placeUnpositioned(doc).doc;
      const report = lintReport(placed);
      store.write(dir, name, placed);
      return text({ ok: report.summary.ok, changed, lint: report.summary, diagnostics: report.diagnostics.filter((d) => d.severity !== 'info'), info: report.diagnostics.filter((d) => d.severity === 'info').length });
    } catch (e) { return fail(e.message); }
  });

  server.registerTool('dgv_lint', {
    title: 'Lint diagram', description: 'Validate structure + architecture rules. Each diagnostic has a stable code, the exact subject and supported fixes.',
    inputSchema: { name: z.string(), severity: z.enum(['error', 'warning', 'info']).optional().describe('minimum severity to include (default warning)') },
  }, async ({ name, severity = 'warning' }) => {
    try {
      const rank = { error: 3, warning: 2, info: 1 };
      const r = lintReport(store.read(dir, name));
      return text({ summary: r.summary, diagnostics: r.diagnostics.filter((d) => rank[d.severity] >= rank[severity]) });
    } catch (e) { return fail(e.message); }
  });

  server.registerTool('dgv_layout', {
    title: 'Auto layout', description: 'Re-place every node and frame with dagre (members stay inside their frame). Overwrites positions; use after bulk changes.',
    inputSchema: { name: z.string(), direction: z.enum(['TB', 'LR']).optional() },
  }, async ({ name, direction }) => {
    try {
      const doc = layout(store.read(dir, name), {}, { direction });
      store.write(dir, name, doc);
      return text({ ok: true, nodes: doc.nodes.length, frames: doc.frames.length });
    } catch (e) { return fail(e.message); }
  });

  server.registerTool('dgv_open', {
    title: 'Open viewer', description: 'Start the local viewer (if not running) and open the diagram in the browser. Returns the URL.',
    inputSchema: { name: z.string().optional(), open: z.boolean().optional().describe('launch the OS browser (default true)') },
  }, async ({ name, open = true }) => {
    try {
      let up = await probe(DEFAULT_PORT);
      if (!up) {
        const child = spawn(process.execPath, [path.join(__dirname, '../bin/dgv.mjs'), 'serve', '--dir', dir, '--no-open'], { detached: true, stdio: 'ignore', env: { ...process.env, DGV_DIR: dir } });
        child.unref();
        for (let i = 0; i < 30 && !up; i++) { await new Promise((r) => setTimeout(r, 150)); up = await probe(DEFAULT_PORT); }
        if (!up) return fail('viewer did not start (is the viewer built? run `npm run build` in Dia-GramV)');
      }
      const url = `http://127.0.0.1:${DEFAULT_PORT}/${name ? '#/' + name : ''}`;
      if (open) openBrowser(url);
      return text({ url, dir: up.dir, note: up.dir !== dir ? `viewer is serving ${up.dir}, not ${dir} — stop it or use one dir` : undefined });
    } catch (e) { return fail(e.message); }
  });

  server.registerTool('dgv_export', {
    title: 'Export', description: 'Render the diagram as markdown tables (for docs / CLAUDE.md), mermaid (for READMEs), or a standalone SVG (self-contained, cropped to the content).',
    inputSchema: { name: z.string(), format: z.enum(['markdown', 'mermaid', 'summary', 'svg']).optional() },
  }, async ({ name, format = 'markdown' }) => {
    try {
      const doc = store.read(dir, name);
      // svg uses the saved layout; the viewer's snapshot button exports what is
      // on screen instead, folds and hand-placed cards included
      return text(format === 'svg' ? toSVG(doc) : format === 'mermaid' ? toMermaid(doc) : format === 'summary' ? textSummary(doc) : toMarkdown(doc));
    } catch (e) { return fail(e.message); }
  });

  return server;
}

export function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); } catch { /* headless: caller prints the URL */ }
}

export async function serveStdio(opts) {
  const server = createServer(opts);
  await server.connect(new StdioServerTransport());
}
