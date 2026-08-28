import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diffDocs, withHistory, describeChange, raiseFlag, resolveFlag, lint, outline, validateSchema, countFlags } from '../src/index.js';
import * as store from '../src/store.js';

const base = () => ({ dgv: 1, meta: { title: 'T' }, frames: [{ id: 'f', label: 'F', position: { x: 0, y: 0 }, size: { width: 300, height: 200 } }],
  nodes: [
    { id: 'a', kind: 'service', label: 'A', frame: 'f', status: 'wip', position: { x: 10, y: 10 } },
    { id: 'b', kind: 'db', label: 'B', ports: [{ id: 'sql', protocol: 'sql', dir: 'in' }], position: { x: 10, y: 200 } },
  ],
  edges: [{ id: 'a-b', source: 'a', target: 'b', kind: 'data', protocol: 'sql', targetPort: 'sql' }] });

test('moving a card is not a change; changing its status is', () => {
  const next = base();
  next.nodes[0].position = { x: 500, y: 500 }; next.frames[0].size = { width: 900, height: 900 }; next.meta.updated = '2030-01-01';
  assert.deepEqual(diffDocs(base(), next), []);
  next.nodes[0].status = 'done';
  const d = diffDocs(base(), next);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0], { type: 'node', id: 'a', op: 'change', fields: [{ field: 'status', from: 'wip', to: 'done' }] });
  assert.equal(describeChange(d[0]), 'status: wip → done');
});

test('add, remove, and a port change on the same write', () => {
  const next = base();
  next.nodes.push({ id: 'c', kind: 'ui', label: 'C' });
  next.edges = [];
  next.nodes[1].ports.push({ id: 'events', protocol: 'sse', dir: 'out' });
  const d = diffDocs(base(), next);
  const by = Object.fromEntries(d.map((e) => [`${e.type}:${e.id}:${e.op}`, e]));
  assert.ok(by['node:c:add']); assert.equal(describeChange(by['node:c:add']), 'added ui "C"');
  assert.ok(by['edge:a-b:remove']); assert.equal(by['edge:a-b:remove'].label, 'a → b');
  assert.deepEqual(by['node:b:change'].fields, [{ field: 'ports', from: 'sql:sql/in', to: 'sql:sql/in, events:sse/out' }]);
});

test('renaming a node is one entry, and its edges are not reported as changed', () => {
  const next = base();
  next.nodes[0].id = 'alpha'; next.edges[0].source = 'alpha';
  const d = diffDocs(base(), next);
  assert.deepEqual(d, [{ type: 'node', id: 'a', op: 'rename', to: 'alpha', kind: 'service', label: 'A' }]);
});

test('withHistory keeps the history on disk, not the one the client sent, and caps it', () => {
  const prev = { ...base(), history: [{ at: '2026-01-01T00:00:00.000Z', by: 'agent', type: 'node', id: 'a', op: 'add', kind: 'service', label: 'A' }] };
  const client = base(); client.nodes[0].status = 'done';   // the viewer never sends history
  const { doc, entries } = withHistory(prev, client, { by: 'viewer', at: '2026-01-02T00:00:00.000Z' });
  assert.equal(entries.length, 1);
  assert.equal(doc.history.length, 2);
  assert.equal(doc.history[1].by, 'viewer');
  const { doc: capped } = withHistory({ ...base(), history: Array.from({ length: 5 }, (_, i) => ({ at: `t${i}`, by: 'x', type: 'node', id: 'a', op: 'change', fields: [] })) }, client, { by: 'agent', max: 3 });
  assert.equal(capped.history.length, 3);
  assert.equal(capped.history[2].by, 'agent', 'the newest entry survives the cap');
});

test('flags: raise, lint, outline, resolve — and history records both ends', () => {
  const { doc: flagged, flag } = raiseFlag(base(), 'a', { title: 'dead end for settings', note: 'no stdin port', fix: 'add a RELOAD line on stdin', kind: 'issue' });
  assert.equal(flag.id, 'f1');
  assert.deepEqual(validateSchema(flagged), []);
  assert.equal(countFlags(flagged), 1);
  const diag = lint(flagged).find((d) => d.code === 'flag/issue');
  assert.equal(diag.severity, 'warning');
  assert.equal(diag.subject.id, 'a'); assert.equal(diag.subject.flag, 'f1');
  assert.equal(diag.fixes[0], 'add a RELOAD line on stdin');
  assert.match(outline(flagged), /⚑ issue: dead end for settings → add a RELOAD line on stdin/);
  assert.match(outline(flagged), /flags: 1 open/);

  const raised = diffDocs(base(), flagged);
  assert.deepEqual(raised, [{ type: 'node', id: 'a', op: 'flag', flag: { id: 'f1', kind: 'issue', title: 'dead end for settings' } }]);

  // ack silences lint warnings, never a flag
  const acked = structuredClone(flagged); acked.nodes[0].ack = 'I looked';
  assert.equal(lint(acked).find((d) => d.code === 'flag/issue').severity, 'warning');

  const { doc: idea } = raiseFlag(flagged, 'a-b', { title: 'could be async', kind: 'idea' });
  assert.equal(lint(idea).find((d) => d.code === 'flag/idea').severity, 'info');

  assert.throws(() => resolveFlag(idea, 'zzz'), /no node, edge or frame/);
  assert.throws(() => raiseFlag(idea, 'a', { title: '' }), /needs a title/);
  const { doc: cleared } = resolveFlag(idea, 'a');   // only one flag on a → no id needed
  assert.equal(cleared.nodes[0].flags, undefined);
  const resolved = diffDocs(idea, cleared);
  assert.deepEqual(resolved, [{ type: 'node', id: 'a', op: 'resolve', flag: { id: 'f1', kind: 'issue', title: 'dead end for settings' } }]);
  assert.equal(describeChange(resolved[0]), '✓ resolved: dead end for settings');

  const { doc: two } = raiseFlag(flagged, 'a', { title: 'second' });
  assert.throws(() => resolveFlag(two, 'a'), /has 2 flags — say which: f1 \(dead end for settings\), f2 \(second\)/);
  assert.throws(() => resolveFlag(two, 'a', 'f9'), /has no flag "f9"/);
});

test('store.commit writes history, and a layout-only save adds nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgv-hist-'));
  store.write(dir, 'x', base());
  const next = base(); next.nodes[0].status = 'done';
  const r = store.commit(dir, 'x', next, { by: 'agent' });
  assert.equal(r.entries.length, 1); assert.equal(r.history.length, 1);
  const moved = store.read(dir, 'x'); moved.nodes[1].position = { x: 999, y: 999 };
  const r2 = store.commit(dir, 'x', moved, { by: 'viewer' });
  assert.equal(r2.entries.length, 0); assert.equal(r2.history.length, 1);
  assert.equal(store.read(dir, 'x').nodes[1].position.x, 999);
  // a client that sends no history cannot erase it
  const bare = base(); bare.nodes[0].status = 'done'; bare.nodes[1].position = { x: 999, y: 999 }; bare.meta.description = 'hi';
  const r3 = store.commit(dir, 'x', bare, { by: 'viewer' });
  assert.equal(r3.history.length, 2);
  assert.equal(r3.history[1].type, 'meta');
  assert.match(outline(store.read(dir, 'x')), /## recent changes \(2 on record\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});
