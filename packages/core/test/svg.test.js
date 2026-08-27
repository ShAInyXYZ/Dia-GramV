import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSVG, NODE_W } from '../src/index.js';

const doc = () => ({
  dgv: 1,
  meta: { title: 'Snap' },
  frames: [{ id: 'box', label: 'Boundary', position: { x: 0, y: 0 }, size: { width: 700, height: 400 } }],
  nodes: [
    { id: 'a', kind: 'service', label: 'Alpha', sublabel: 'the first', frame: 'box', position: { x: 40, y: 60 } },
    { id: 'b', kind: 'db', label: 'Beta', frame: 'box', position: { x: 380, y: 60 } },
    { id: 'c', kind: 'external', label: 'Outside', position: { x: 900, y: 200 } },
  ],
  edges: [
    { id: 'a-b', source: 'a', target: 'b', kind: 'data', protocol: 'sql' },
    { id: 'a-c', source: 'a', target: 'c', kind: 'sync' },
  ],
});

const viewBox = (svg) => svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);

test('it is a standalone svg document', () => {
  const svg = toSVG(doc());
  assert.match(svg, /^<svg /);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
});

test('nothing is fetched from anywhere — it has to work pasted into a README', () => {
  const svg = toSVG(doc());
  assert.equal(/<image\b/.test(svg), false);
  assert.equal(/href\s*=/.test(svg), false);
  assert.equal(/url\(\s*['"]?https?:/.test(svg), false);
  assert.equal(/@import|<script/.test(svg), false);
});

test('the box is the content plus padding, nothing more', () => {
  const svg = toSVG(doc(), { padding: 20 });
  const [x, y, w, h] = viewBox(svg);
  assert.equal(x, 0);
  assert.equal(y, 0);
  // content spans x 0..(900+260) and y 0..400
  assert.equal(w, 900 + NODE_W + 40);
  assert.equal(h, 400 + 40);
  assert.match(svg, new RegExp(`width="${w}"`));
});

test('a diagram that does not start at the origin is still cropped tight', () => {
  const d = doc();
  d.frames[0].position = { x: 500, y: 300 };
  for (const n of d.nodes) { n.position.x += 500; n.position.y += 300; }
  const [, , w, h] = viewBox(toSVG(d, { padding: 20 }));
  assert.equal(w, 900 + NODE_W + 40);
  assert.equal(h, 400 + 40);
});

test('every node and frame is drawn', () => {
  const svg = toSVG(doc());
  for (const label of ['Alpha', 'the first', 'Beta', 'Outside']) assert.ok(svg.includes(label), label);
  // frame labels and kind tags are uppercased on the canvas (text-transform),
  // and a snapshot that spelled them differently would not be a snapshot
  assert.ok(svg.includes('BOUNDARY'), 'frame label, as the canvas draws it');
  assert.equal((svg.match(/data-node="/g) ?? []).length, 3);
  assert.equal((svg.match(/data-frame="/g) ?? []).length, 1);
  assert.equal((svg.match(/data-edge="/g) ?? []).length, 2);
});

test('markup in a label cannot break the document', () => {
  const d = doc();
  d.nodes[0].label = 'a < b & "c"';
  const svg = toSVG(d);
  assert.ok(svg.includes('a &lt; b &amp; &quot;c&quot;'));
  assert.equal(svg.includes('a < b &'), false);
});

test('it paints its own background, so it reads on a light or dark page', () => {
  const svg = toSVG(doc());
  assert.match(svg, /<rect[^>]+class="bg"/);
  assert.ok(toSVG(doc(), { background: 'transparent' }).includes('class="bg" fill="transparent"'));
});

test('a folded view exports its master cards', () => {
  const d = doc();
  d.nodes = [{ id: 'box', kind: 'master', label: 'Boundary', position: { x: 0, y: 0 }, size: { width: NODE_W, height: 76 },
    master: { tone: 'cyan', nodes: 2, frames: 0, members: ['a', 'b'], kinds: [{ kind: 'service', n: 1 }, { kind: 'db', n: 1 }] } }];
  d.frames = [];
  d.edges = [];
  const svg = toSVG(d);
  assert.ok(svg.includes('Boundary'));
  assert.ok(svg.includes('2 nodes'), 'says what it stands for');
  assert.equal((svg.match(/data-node="/g) ?? []).length, 1);
});

test('measured heights from the canvas are used when given', () => {
  const tall = toSVG(doc(), { measured: { a: { w: NODE_W, h: 500 } }, padding: 0 });   // clears the 400px frame
  const plain = toSVG(doc(), { padding: 0 });
  assert.ok(viewBox(tall)[3] > viewBox(plain)[3]);
});

test('an empty diagram produces a valid, tiny svg rather than throwing', () => {
  const svg = toSVG({ dgv: 1, meta: { title: 'Nothing' }, frames: [], nodes: [], edges: [] });
  assert.match(svg, /^<svg /);
  const [, , w, h] = viewBox(svg);
  assert.ok(w > 0 && h > 0);
});
