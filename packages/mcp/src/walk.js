/**
 * Every file in a project, relative to its root — the input to drift().
 *
 * Prefers `git ls-files`: it respects .gitignore, includes untracked files,
 * and is fast on big trees. Falls back to a walk with a fixed skip list when
 * there is no git or no repository. Either way the caller can exclude paths,
 * which is how the diagram directory keeps itself out of its own report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.next', '.svelte-kit', '__pycache__', '.venv', 'venv', 'vendor', '.cache', 'coverage', '.idea', '.vscode']);
const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

export function listFiles(root, opts = {}) {
  const exclude = (opts.exclude ?? []).map(norm).filter((x) => x && x !== '.');
  let files;
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
    // --cached keeps files that were deleted but not yet committed; drift is about the disk
    files = out.toString('utf8').split('\0').filter(Boolean).filter((f) => fs.existsSync(path.join(root, f)));
  } catch {
    files = walk(root, '');
  }
  return files.map(norm).filter((f) => !exclude.some((x) => f === x || f.startsWith(x + '/')));
}

function walk(root, rel, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(root, r, acc);
    else if (e.isFile()) acc.push(r);
  }
  return acc;
}
