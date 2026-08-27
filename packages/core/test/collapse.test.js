import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapseView, NODE_W } from '../src/index.js';

/**
 * outer ────────────────────────────────┐        a (loose, right of everything)
 * │  inner ──────────┐                  │
 * │  │  b            │                  │
 * │  │  c            │                  │
 * │  └───────────────┘        d         │
 * └─────────────────────────────────────┘
 *
 * a→b, a→c  (two wires into the same nested frame)
 * b→c       (wholly inside inner)
 * d→a       (out of outer)
 */
const doc = () => ({
  dgv: 1,
  meta: { title: 'T' },
  frames: [
    { id: 'outer', label: 'Outer', position: { x: 0, y: 0 }, size: { width: 600, height: 400 } },
    { id: 'inner', label: 'Inner', parent: 'outer', position: { x: 40, y: 60 }, size: { width: 300, height: 200 } },
  ],
  nodes: [
    { id: 'a', kind: 'service', label: 'A', position: { x: 800, y: 0 } },
    { id: 'b', kind: 'service', label: 'B', frame: 'inner', position: { x: 60, y: 100 } },
    { id: 'c', kind: 'db', label: 'C', frame: 'inner', position: { x: 60, y: 200 } },
    { id: 'd', kind: 'service', label: 'D', frame: 'outer', position: { x: 400, y: 300 } },
  ],
  edges: [
    { id: 'a-b', source: 'a', target: 'b', kind: 'sync' },
    { id: 'a-c', source: 'a', target: 'c', kind: 'sync' },
    { id: 'b-c', source: 'b', target: 'c', kind: 'data' },
    { id: 'd-a', source: 'd', target: 'a', kind: 'sync' },
  ],
});

const byId = (list) => new Map(list.map((x) => [x.id, x]));
const masters = (v) => v.nodes.filter((n) => n.master);

test('no collapsed frames leaves the document as it is', () => {
  const v = collapseView(doc(), []);
  assert.equal(v.nodes.length, 4);
  assert.equal(v.frames.length, 2);
  assert.equal(v.edges.length, 4);
  assert.equal(masters(v).length, 0);
});

test('a collapsed frame becomes one master node and its members go away', () => {
  const v = collapseView(doc(), ['inner']);
  assert.deepEqual(v.nodes.map((n) => n.id).sort(), ['a', 'd', 'inner']);
  assert.deepEqual(v.frames.map((f) => f.id), ['outer']);

  const m = byId(v.nodes).get('inner');
  assert.ok(m.master, 'the master carries its own marker');
  assert.equal(m.label, 'Inner');
  assert.equal(m.master.nodes, 2, 'it counts the members it swallowed');
  assert.equal(m.master.frames, 0);
  assert.deepEqual(m.master.members.sort(), ['b', 'c']);
});

test('the master keeps the frame\'s place and takes a card\'s width', () => {
  const v = collapseView(doc(), ['inner']);
  const m = byId(v.nodes).get('inner');
  assert.deepEqual(m.position, { x: 40, y: 60 });
  assert.equal(m.frame, 'outer', 'it stays nested where the frame was');
  assert.equal(m.size.width, NODE_W);
  assert.ok(m.size.height > 0);
});

test('wires into members are redrawn to the master', () => {
  const v = collapseView(doc(), ['inner']);
  const ids = v.edges.map((e) => `${e.source}>${e.target}`).sort();
  assert.deepEqual(ids, ['a>inner', 'd>a']);
});

test('two wires into the same master merge into one, counted', () => {
  const v = collapseView(doc(), ['inner']);
  const merged = v.edges.find((e) => e.target === 'inner');
  assert.equal(merged.agg, 2);
  assert.deepEqual(merged.aggIds.sort(), ['a-b', 'a-c']);
});

test('a single remapped wire keeps its own contract, not a count', () => {
  const v = collapseView(doc(), ['inner']);
  const out = v.edges.find((e) => e.source === 'd');
  assert.equal(out.agg, undefined);
  assert.equal(out.id, 'd-a');
  assert.equal(out.kind, 'sync');
});

test('wires wholly inside a collapsed frame are dropped', () => {
  const v = collapseView(doc(), ['inner']);
  assert.equal(v.edges.some((e) => e.id === 'b-c'), false);
});

test('collapsing a frame swallows the frames nested in it', () => {
  const v = collapseView(doc(), ['outer']);
  assert.deepEqual(v.nodes.map((n) => n.id).sort(), ['a', 'outer']);
  assert.equal(v.frames.length, 0);

  const m = byId(v.nodes).get('outer');
  assert.equal(m.master.nodes, 3, 'b, c and d');
  assert.equal(m.master.frames, 1, 'inner');
  assert.equal(m.frame, undefined, 'nothing left to nest inside');
});

test('the outermost collapse wins — an inner one inside it changes nothing', () => {
  const a = collapseView(doc(), ['outer']);
  const b = collapseView(doc(), ['outer', 'inner']);
  assert.deepEqual(b.nodes.map((n) => n.id).sort(), a.nodes.map((n) => n.id).sort());
  assert.deepEqual(b.edges.map((e) => e.id).sort(), a.edges.map((e) => e.id).sort());
});

test('the master reports what kinds it holds, commonest first', () => {
  const v = collapseView(doc(), ['outer']);
  const m = byId(v.nodes).get('outer');
  assert.deepEqual(m.master.kinds, [{ kind: 'service', n: 2 }, { kind: 'db', n: 1 }]);
});

test('a frame left standing refits around what is still visible', () => {
  const v = collapseView(doc(), ['inner']);
  const outer = v.frames[0];
  for (const child of [...v.nodes, ...v.frames].filter((x) => (x.frame ?? x.parent) === 'outer')) {
    const w = child.size?.width ?? NODE_W, h = child.size?.height ?? 64;
    assert.ok(child.position.x >= outer.position.x, `${child.id} starts inside`);
    assert.ok(child.position.y >= outer.position.y, `${child.id} starts inside`);
    assert.ok(child.position.x + w <= outer.position.x + outer.size.width, `${child.id} ends inside`);
    assert.ok(child.position.y + h <= outer.position.y + outer.size.height, `${child.id} ends inside`);
  }
});

test('the view is a copy — collapsing never touches the document', () => {
  const d = doc();
  const before = JSON.stringify(d);
  collapseView(d, ['inner']);
  assert.equal(JSON.stringify(d), before);
});

test('an unknown id is ignored rather than throwing', () => {
  const v = collapseView(doc(), ['nope']);
  assert.equal(v.nodes.length, 4);
  assert.equal(masters(v).length, 0);
});

test('an empty frame still collapses, reporting nothing inside', () => {
  const d = doc();
  d.frames.push({ id: 'empty', label: 'Empty', position: { x: 900, y: 400 }, size: { width: 200, height: 120 } });
  const m = byId(collapseView(d, ['empty']).nodes).get('empty');
  assert.equal(m.master.nodes, 0);
  assert.deepEqual(m.master.kinds, []);
});
