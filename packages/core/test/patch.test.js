import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparePatch, applyPatch } from '../src/index.js';

const cur = () => ({ dgv: 1, meta: { title: 'T' }, frames: [{ id: 'f', label: 'F' }],
  nodes: [{ id: 'a', kind: 'service', label: 'A', frame: 'f' }, { id: 'b', kind: 'db', label: 'B', ports: [{ id: 'sql', protocol: 'sql' }] }],
  edges: [{ id: 'a-b', source: 'a', target: 'b', kind: 'data', protocol: 'sql' }] });

test('an existing edge can be patched by id alone', () => {
  const p = preparePatch(cur(), { edges: [{ id: 'a-b', targetPort: 'sql' }] });
  const { doc } = applyPatch(cur(), p);
  assert.deepEqual(doc.edges[0], { id: 'a-b', source: 'a', target: 'b', kind: 'data', protocol: 'sql', targetPort: 'sql' });
});

test('an existing node can be patched with one field', () => {
  const { doc } = applyPatch(cur(), preparePatch(cur(), { nodes: [{ id: 'a', status: 'done' }] }));
  assert.equal(doc.nodes[0].kind, 'service', 'kind survives');
  assert.equal(doc.nodes[0].status, 'done');
});

test('a new node without a kind is refused, naming the node', () => {
  assert.throws(() => preparePatch(cur(), { nodes: [{ id: 'c', label: 'C' }] }), /node "c" is new: kind is required/);
});

test('a new edge without both ends is refused', () => {
  assert.throws(() => preparePatch(cur(), { edges: [{ id: 'x', source: 'a' }] }), /edge "x" is new: source and target are required/);
  assert.throws(() => preparePatch(cur(), { edges: [{ target: 'b' }] }), /source and target/);
});

test('a new edge gets its id from its ends, as before', () => {
  const p = preparePatch(cur(), { edges: [{ source: 'b', target: 'a' }] });
  assert.equal(p.edges[0].id, 'b-a');
});

test('a new frame without a label is labelled by its id, as before', () => {
  const p = preparePatch(cur(), { frames: [{ id: 'g' }] });
  assert.equal(p.frames[0].label, 'g');
  const q = preparePatch(cur(), { frames: [{ id: 'f', tone: 'amber' }] });
  assert.equal(q.frames[0].label, undefined, 'an existing frame keeps its label');
});

test('the input patch is not mutated', () => {
  const patch = { edges: [{ source: 'b', target: 'a' }] };
  preparePatch(cur(), patch);
  assert.equal(patch.edges[0].id, undefined);
});
