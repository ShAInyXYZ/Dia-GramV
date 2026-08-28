/**
 * Local viewer server. Loopback only. Serves the built viewer and a tiny
 * JSON API over the same diagram directory the MCP server writes to, and
 * pushes "file changed" events over SSE so the viewer stays in sync with
 * whatever the agent just did.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, catalogSummary, summarizeDiagnostics as diagSummary, normalize, placeUnpositioned } from '@dgv/core';
import * as store from '@dgv/core/store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DIST = path.resolve(__dirname, '../../viewer/dist');
export const DEFAULT_PORT = 7710;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };

export function startHttp({ dir, port = DEFAULT_PORT, host = '127.0.0.1', log = () => {} } = {}) {
  dir = store.resolveDir(dir);
  store.ensureDir(dir);
  const clients = new Set();
  const stopWatch = store.watch(dir, (name) => {
    for (const res of clients) res.write(`event: change\ndata: ${JSON.stringify({ name })}\n\n`);
  });

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((ok, no) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); req.on('error', no); });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${host}`);
    const p = url.pathname;
    try {
      if (p === '/api/health') return json(res, 200, { ok: true, dir, port });
      if (p === '/api/catalog') return json(res, 200, catalogSummary());
      if (p === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`event: hello\ndata: ${JSON.stringify({ dir })}\n\n`);
        clients.add(res); req.on('close', () => clients.delete(res));
        return;
      }
      if (p === '/api/diagrams' && req.method === 'GET') return json(res, 200, store.list(dir));
      const m = p.match(/^\/api\/diagrams\/([a-zA-Z0-9_-]+)(\/lint)?$/);
      if (m) {
        const name = m[1];
        if (m[2]) {   // POST /lint with body → diagnostics for an unsaved doc
          const body = req.method === 'POST' ? JSON.parse(await readBody(req) || '{}') : null;
          const doc = body?.doc ?? store.read(dir, name);
          const diags = lint(doc, { measured: body?.measured });
          return json(res, 200, { diagnostics: diags, summary: diagSummary(diags) });
        }
        if (req.method === 'GET') {
          if (!store.exists(dir, name)) return json(res, 404, { error: 'not found' });
          return json(res, 200, store.read(dir, name));
        }
        if (req.method === 'PUT') {
          const doc = normalize(JSON.parse(await readBody(req)));
          // the viewer is a person at the keyboard: its saves are recorded as such
          const { file, history } = store.commit(dir, name, placeUnpositioned(doc).doc, { by: 'viewer' });
          log(`saved ${file}`);
          return json(res, 200, { ok: true, file, history });
        }
        if (req.method === 'DELETE') { store.remove(dir, name); return json(res, 200, { ok: true }); }
      }
      if (p.startsWith('/api/')) return json(res, 404, { error: 'unknown endpoint' });

      // static viewer
      if (!fs.existsSync(DIST)) { res.writeHead(503, { 'content-type': 'text/plain' }); return res.end('viewer not built — run: npm run build (in Dia-GramV)'); }
      let file = path.join(DIST, p === '/' ? 'index.html' : p);
      if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      json(res, 400, { error: String(e.message ?? e) });
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => resolve({ server, port, dir, url: `http://${host}:${port}`, close: () => { stopWatch(); server.close(); } }));
  });
}

/** Is a DGV server already up on this port for this dir? */
export async function probe(port = DEFAULT_PORT) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
