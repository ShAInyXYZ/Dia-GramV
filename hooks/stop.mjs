#!/usr/bin/env node
/**
 * Claude Code Stop hook: if the code moved and the diagram did not, say so.
 *
 * Runs when the agent finishes a turn. It never blocks — it prints a system
 * message, and only when there is something to say:
 *
 *   - drift/missing: a node's path no longer exists
 *   - drift/unclaimed: code that belongs to no node
 *   - uncommitted source changes while no diagram changed — the usual way a
 *     status or a path goes stale
 *
 * Cheap enough to run every turn: one git ls-files, one git status.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const { drift, normalize } = await import(path.join(here, '../packages/core/src/index.js'));
const { listFiles } = await import(path.join(here, '../packages/mcp/src/walk.js'));

let input = '';
for await (const chunk of process.stdin) input += chunk;
let cwd = process.cwd();
try { cwd = JSON.parse(input).cwd || cwd; } catch { /* run from a shell */ }

const dir = process.env.DGV_DIR ? path.resolve(process.env.DGV_DIR) : path.join(cwd, 'dgv');
if (!fs.existsSync(dir)) process.exit(0);
const names = fs.readdirSync(dir).filter((f) => f.endsWith('.dgv.json')).sort();
if (!names.length) process.exit(0);

const notes = [];
const rel = path.relative(cwd, dir);
let files = null;
for (const f of names) {
  const name = f.replace(/\.dgv\.json$/, '');
  const doc = normalize(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const r = drift(doc, (files ??= listFiles(cwd, { exclude: [rel] })));
  if (!r.linked) continue;
  if (r.summary.missing) notes.push(`${name}: ${r.summary.missing} node path${r.summary.missing === 1 ? '' : 's'} no longer exist${r.summary.missing === 1 ? 's' : ''} (${r.findings.filter((x) => x.code === 'drift/missing').map((x) => x.subject.id).join(', ')})`);
  if (r.summary.unclaimed) notes.push(`${name}: ${r.summary.unclaimed} director${r.summary.unclaimed === 1 ? 'y' : 'ies'} of code belong to no node`);
}

// Code changed, diagram did not. A heuristic, and an honest one: it looks at
// what is uncommitted, not at what this session touched.
try {
  const out = execFileSync('git', ['status', '--porcelain', '-z'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').split('\0').filter(Boolean);
  const changed = out.map((l) => l.slice(3));
  const code = changed.filter((p) => !(p === rel || p.startsWith(rel + '/')));
  const diag = changed.filter((p) => p === rel || p.startsWith(rel + '/'));
  if (code.length && !diag.length) notes.push(`${code.length} uncommitted source change${code.length === 1 ? '' : 's'} and no diagram change — if structure or progress moved, update node status / path with dgv_apply`);
} catch { /* not a git repo: nothing to compare */ }

if (!notes.length) process.exit(0);
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'Stop', systemMessage: 'DGV · ' + notes.join(' · ') },
}));
