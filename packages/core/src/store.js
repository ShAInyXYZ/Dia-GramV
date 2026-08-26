/**
 * File store (Node only). Diagrams live as `<dir>/<name>.dgv.json`.
 * `dir` resolves in this order: explicit arg → $DGV_DIR → ./dgv under cwd.
 * Writes are atomic (tmp + rename) so a watcher never reads a half file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalize } from './model.js';

export const EXT = '.dgv.json';
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function resolveDir(dir) {
  const d = dir ?? process.env.DGV_DIR ?? path.join(process.cwd(), 'dgv');
  return path.resolve(d);
}

export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }

export function checkName(name) {
  if (!NAME_RE.test(name)) throw new Error(`invalid diagram name "${name}" — use letters, digits, - and _`);
  return name;
}

export function fileOf(dir, name) { return path.join(dir, checkName(name) + EXT); }

export function list(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(EXT)).sort().map((f) => {
    const name = f.slice(0, -EXT.length);
    let meta = {}, counts = {};
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      meta = d.meta ?? {}; counts = { frames: d.frames?.length ?? 0, nodes: d.nodes?.length ?? 0, edges: d.edges?.length ?? 0 };
    } catch { meta = { title: '(unreadable)' }; }
    return { name, title: meta.title, description: meta.description, updated: meta.updated, ...counts };
  });
}

export function exists(dir, name) { return fs.existsSync(fileOf(dir, name)); }

export function read(dir, name) {
  const file = fileOf(dir, name);
  if (!fs.existsSync(file)) throw new Error(`diagram "${name}" not found in ${dir}`);
  return normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function write(dir, name, doc) {
  ensureDir(dir);
  const file = fileOf(dir, name);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return file;
}

export function remove(dir, name) { const f = fileOf(dir, name); if (fs.existsSync(f)) fs.unlinkSync(f); }

/** Watch the dir; cb(name) on any change to a diagram file (debounced). */
export function watch(dir, cb) {
  ensureDir(dir);
  const timers = new Map();
  const w = fs.watch(dir, (_ev, file) => {
    if (!file || !file.endsWith(EXT)) return;
    const name = file.slice(0, -EXT.length);
    clearTimeout(timers.get(name));
    timers.set(name, setTimeout(() => cb(name), 120));
  });
  return () => w.close();
}
