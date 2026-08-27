import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drift } from '../src/index.js';

// A project tree as the caller walked it: files only, relative, forward slashes.
const tree = [
  'cmd/app/main.go',
  'internal/api/api.go',
  'internal/api/auth.go',
  'internal/loop/loop.go',
  'internal/memory/client.go',
  'panel/src/App.svelte',
  'panel/package.json',
  'scripts/deploy.sh',
  'README.md',
];

const doc = (nodes) => ({ dgv: 1, meta: { title: 'T' }, frames: [], nodes, edges: [] });

const codes = (r) => r.findings.map((f) => f.code + ':' + f.subject.id).sort();

test('a node whose path matches nothing is missing — the diagram claims code that is not there', () => {
  const r = drift(doc([{ id: 'api', kind: 'api', label: 'API', path: 'internal/api' }, { id: 'ghost', kind: 'module', label: 'Ghost', path: 'internal/ghost' }]), tree);
  assert.deepEqual(codes(r).filter((c) => c.startsWith('drift/missing')), ['drift/missing:ghost']);
  const f = r.findings.find((x) => x.code === 'drift/missing');
  assert.equal(f.severity, 'error');
  assert.ok(f.fixes.length, 'says what to do');
});

test('a directory path claims everything under it', () => {
  const r = drift(doc([{ id: 'api', kind: 'api', label: 'API', path: 'internal/api' }]), tree);
  assert.equal(r.findings.some((f) => f.code === 'drift/missing'), false);
  assert.deepEqual(r.claimed.api.sort(), ['internal/api/api.go', 'internal/api/auth.go']);
});

test('a path may be a list, and may use globs', () => {
  const r = drift(doc([{ id: 'ui', kind: 'ui', label: 'Panel', path: ['panel/src/**/*.svelte', 'panel/package.json'] }]), tree);
  assert.deepEqual(r.claimed.ui.sort(), ['panel/package.json', 'panel/src/App.svelte']);
});

test('code nobody claims is reported by directory, not file by file', () => {
  const r = drift(doc([{ id: 'api', kind: 'api', label: 'API', path: 'internal/api' }]), tree);
  const unclaimed = r.findings.filter((f) => f.code === 'drift/unclaimed').map((f) => f.subject.path).sort();
  // internal/api is claimed; its siblings and the other top-level dirs are not
  assert.deepEqual(unclaimed, ['cmd/app', 'internal/loop', 'internal/memory', 'panel', 'scripts']);
  assert.equal(r.findings.find((f) => f.code === 'drift/unclaimed').severity, 'warning');
});

test('unclaimed stops at the depth asked for', () => {
  const r = drift(doc([{ id: 'x', kind: 'module', label: 'X', path: 'README.md' }]), tree, { depth: 1 });
  const unclaimed = r.findings.filter((f) => f.code === 'drift/unclaimed').map((f) => f.subject.path).sort();
  assert.deepEqual(unclaimed, ['cmd', 'internal', 'panel', 'scripts']);
});

test('loose files at the root are not noise', () => {
  const r = drift(doc([{ id: 'api', kind: 'api', label: 'API', path: 'internal/api' }]), tree);
  assert.equal(r.findings.some((f) => f.subject?.path === 'README.md'), false);
});

test('meta.driftIgnore silences directories on purpose, and says so', () => {
  const d = doc([{ id: 'api', kind: 'api', label: 'API', path: 'internal/api' }]);
  d.meta.driftIgnore = ['scripts', 'panel/**'];
  const r = drift(d, tree);
  const unclaimed = r.findings.filter((f) => f.code === 'drift/unclaimed').map((f) => f.subject.path).sort();
  assert.deepEqual(unclaimed, ['cmd/app', 'internal/loop', 'internal/memory']);
  assert.equal(r.summary.ignored, 3, 'scripts/deploy.sh and the two panel files');
});

test('nodes with no path are counted, so you can see how much of the diagram is tethered', () => {
  const r = drift(doc([{ id: 'api', kind: 'api', label: 'API', path: 'internal/api' }, { id: 'pg', kind: 'db', label: 'Postgres' }, { id: 'ext', kind: 'external', label: 'Stripe' }]), tree);
  assert.equal(r.summary.unmapped, 2);
  const f = r.findings.find((x) => x.code === 'drift/unmapped');
  assert.equal(f.severity, 'info');
});

test('a diagram with no paths at all is not linked to code, and drift says so instead of listing the whole tree', () => {
  const r = drift(doc([{ id: 'pg', kind: 'db', label: 'Postgres' }]), tree);
  assert.equal(r.linked, false);
  assert.equal(r.findings.some((f) => f.code === 'drift/unclaimed'), false);
});

test('two nodes claiming the same file is reported — one of them is wrong', () => {
  const r = drift(doc([{ id: 'a', kind: 'module', label: 'A', path: 'internal/api' }, { id: 'b', kind: 'module', label: 'B', path: 'internal/api/auth.go' }]), tree);
  const f = r.findings.find((x) => x.code === 'drift/shared');
  assert.ok(f);
  assert.deepEqual([f.subject.id, f.subject.other].sort(), ['a', 'b']);
});

test('ok is true only when nothing is missing and nothing is unclaimed', () => {
  const full = drift(doc([
    { id: 'cmd', kind: 'program', label: 'app', path: 'cmd/app' },
    { id: 'api', kind: 'api', label: 'API', path: 'internal/api' },
    { id: 'loop', kind: 'module', label: 'Loop', path: 'internal/loop' },
    { id: 'mem', kind: 'module', label: 'Memory', path: 'internal/memory' },
    { id: 'ui', kind: 'ui', label: 'Panel', path: 'panel' },
    { id: 'ops', kind: 'program', label: 'Deploy', path: 'scripts' },
  ]), tree);
  assert.equal(full.ok, true);
  assert.equal(full.summary.missing, 0);
  assert.equal(full.summary.unclaimed, 0);
});

test('the summary is what an agent reads first', () => {
  const r = drift(doc([{ id: 'api', kind: 'api', label: 'API', path: 'internal/api' }, { id: 'ghost', kind: 'module', label: 'G', path: 'nope' }, { id: 'pg', kind: 'db', label: 'PG' }]), tree);
  assert.deepEqual(Object.keys(r.summary).sort(), ['files', 'ignored', 'mapped', 'missing', 'unclaimed', 'unmapped']);
  assert.equal(r.summary.files, tree.length);
  assert.equal(r.summary.mapped, 1);
  assert.equal(r.summary.missing, 1);
  assert.equal(r.summary.unmapped, 1);
});
