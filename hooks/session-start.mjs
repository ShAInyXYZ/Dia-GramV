#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: put the architecture on file into context.
 *
 * The MCP cannot make an agent read the diagram before it starts editing
 * code; the harness can. Whatever this prints on stdout becomes context for
 * the session, so it prints the outline of every diagram in ./dgv and, when
 * the diagram is tethered to code, the drift summary — so the first thing
 * the agent knows is the shape of the system and whether the map is stale.
 *
 * Silent when there is no ./dgv: projects without a diagram see nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { outline, drift, normalize } = await import(path.join(here, '../packages/core/src/index.js'));
const { listFiles } = await import(path.join(here, '../packages/mcp/src/walk.js'));

let input = '';
for await (const chunk of process.stdin) input += chunk;
let cwd = process.cwd();
try { cwd = JSON.parse(input).cwd || cwd; } catch { /* no JSON on stdin: run from a shell */ }

const dir = process.env.DGV_DIR ? path.resolve(process.env.DGV_DIR) : path.join(cwd, 'dgv');
if (!fs.existsSync(dir)) process.exit(0);
const names = fs.readdirSync(dir).filter((f) => f.endsWith('.dgv.json')).sort();
if (!names.length) process.exit(0);

const MAX = 3;
const L = [
  'DGV — this project keeps its architecture as a diagram in ./dgv. Read it before changing structure, keep each node\'s `status` current, and use the dgv MCP tools (dgv_read, dgv_apply, dgv_lint, dgv_drift) rather than editing the JSON by hand.',
  '',
];
let files = null;
for (const f of names.slice(0, MAX)) {
  const doc = normalize(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  L.push(outline(doc).trimEnd());
  const r = drift(doc, (files ??= listFiles(cwd, { exclude: [path.relative(cwd, dir)] })));
  if (r.linked) {
    L.push(`drift: ${r.summary.missing} missing path${r.summary.missing === 1 ? '' : 's'} · ${r.summary.unclaimed} unclaimed dir${r.summary.unclaimed === 1 ? '' : 's'} · ${r.summary.unmapped} node${r.summary.unmapped === 1 ? '' : 's'} without a path${r.ok ? '' : ' — run dgv_drift and fix drift/missing first'}`);
  } else {
    L.push('drift: no node has a `path` yet — set them so dgv_drift can check the diagram against the code');
  }
  L.push('');
}
if (names.length > MAX) L.push(`${names.length - MAX} more diagram${names.length - MAX === 1 ? '' : 's'} not shown: ${names.slice(MAX).map((n) => n.replace(/\.dgv\.json$/, '')).join(', ')} — dgv_read them if relevant.`);
process.stdout.write(L.join('\n') + '\n');
