import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateSchema, lint, layout, applyPatch, placeUnpositioned, outline, toMarkdown, toMermaid, toStructurizr, emptyDiagram, catalogSummary, summarizeDiagnostics as diagSummary } from '../src/index.js';
import * as store from '../src/store.js';

const example = JSON.parse(fs.readFileSync(new URL('../../../examples/local-ai-harness.dgv.json', import.meta.url), 'utf8'));

test('example validates and lints with no errors', () => {
  assert.deepEqual(validateSchema(example), []);
  const diags = lint(example);
  const errors = diags.filter((d) => d.severity === 'error');
  assert.deepEqual(errors, [], JSON.stringify(errors, null, 1));
});

test('schema catches bad kind, missing title, bad id', () => {
  const diags = validateSchema({ dgv: 1, meta: {}, nodes: [{ id: '1bad', kind: 'nope', label: '' }] });
  const codes = diags.map((d) => d.message);
  assert.ok(codes.some((m) => m.includes('/meta/title')));
  assert.ok(codes.some((m) => m.includes('unknown kind')));
  assert.ok(codes.some((m) => m.includes('/nodes/0/id')));
});

test('lint: undeclared port, direction, protocol mismatch', () => {
  const doc = emptyDiagram('t');
  doc.nodes.push({ id: 'a', kind: 'service', label: 'A' }, { id: 'b', kind: 'db', label: 'B', ports: [{ id: 'sql', protocol: 'sql', dir: 'in' }, { id: 'ev', protocol: 'sse', dir: 'out' }] });
  doc.edges.push(
    { id: 'e1', source: 'a', target: 'b', kind: 'data', protocol: 'sql', targetPort: 'nope' },
    { id: 'e2', source: 'a', target: 'b', kind: 'data', protocol: 'sql', targetPort: 'ev' },
    { id: 'e3', source: 'a', target: 'b', kind: 'data', protocol: 'http', targetPort: 'sql' },
  );
  const codes = lint(doc).map((d) => d.code);
  assert.ok(codes.includes('port/undeclared'));
  assert.ok(codes.includes('port/direction'));
  assert.ok(codes.includes('port/protocol-mismatch'));
});

test('lint: import cycle, orphan, store initiates, bridge one-sided', () => {
  const doc = emptyDiagram('t');
  doc.nodes.push(
    { id: 'm1', kind: 'module', label: 'M1' }, { id: 'm2', kind: 'module', label: 'M2' },
    { id: 'lonely', kind: 'service', label: 'L' },
    { id: 'db', kind: 'db', label: 'DB' }, { id: 'svc', kind: 'service', label: 'S' },
    { id: 'br', kind: 'bridge', label: 'Br' },
  );
  doc.edges.push(
    { id: 'i1', source: 'm1', target: 'm2', kind: 'import' }, { id: 'i2', source: 'm2', target: 'm1', kind: 'import' },
    { id: 'x', source: 'db', target: 'svc', kind: 'sync', protocol: 'http' },
    { id: 'y', source: 'svc', target: 'br', kind: 'sync', protocol: 'ipc' },
  );
  const codes = lint(doc).map((d) => d.code);
  for (const c of ['graph/import-cycle', 'graph/orphan', 'kind/store-initiates', 'kind/bridge-one-sided']) assert.ok(codes.includes(c), c);
  assert.equal(diagSummary(lint(doc)).ok, false);
});

test('lint: ack turns a warning into info, never an error', () => {
  const doc = emptyDiagram('t');
  doc.nodes.push({ id: 'db', kind: 'db', label: 'DB' }, { id: 'svc', kind: 'sidecar', label: 'S', ports: [{ id: 'e', protocol: 'http', dir: 'in' }] });
  doc.edges.push({ id: 'x', source: 'db', target: 'svc', kind: 'sync', protocol: 'http', targetPort: 'e', ack: 'the db calls the embedder itself' });
  const d = lint(doc).find((x) => x.code === 'kind/store-initiates');
  assert.equal(d.severity, 'info'); assert.match(d.message, /acknowledged/); assert.equal(d.ack, 'the db calls the embedder itself');
  doc.edges.push({ id: 'y', source: 'db', target: 'ghost', ack: 'nope' });
  assert.ok(lint(doc).some((x) => x.code === 'ref/missing-node' && x.severity === 'error'));
});

test('lint: control/deploy/import edges need no port', () => {
  const doc = emptyDiagram('t');
  doc.nodes.push({ id: 'sysd', kind: 'infra', label: 'systemd' }, { id: 'svc', kind: 'model', label: 'llama', ports: [{ id: 'chat', protocol: 'http', dir: 'in' }] }, { id: 'ui', kind: 'ui', label: 'UI' });
  doc.edges.push({ id: 'c', source: 'sysd', target: 'svc', kind: 'control' }, { id: 'call', source: 'ui', target: 'svc', kind: 'sync', protocol: 'http' });
  const unbound = lint(doc).filter((d) => d.code === 'port/unbound').map((d) => d.subject.id);
  assert.deepEqual(unbound, ['call']);
});

test('lint: missing refs are errors and stop deeper rules', () => {
  const doc = emptyDiagram('t');
  doc.nodes.push({ id: 'a', kind: 'service', label: 'A', frame: 'ghost' });
  doc.edges.push({ id: 'e', source: 'a', target: 'zzz' });
  const codes = lint(doc).map((d) => d.code);
  assert.ok(codes.includes('ref/missing-frame'));
  assert.ok(codes.includes('ref/missing-node'));
  assert.ok(!codes.includes('graph/orphan'));
});

test('applyPatch merges by id, removes cascade', () => {
  const { doc, changed } = applyPatch(example, {
    nodes: [{ id: 'panel', status: 'wip' }, { id: 'new', kind: 'worker', label: 'New', frame: 'core' }],
    edges: [{ id: 'new-e', source: 'new', target: 'typesense', kind: 'data', protocol: 'http', targetPort: 'search' }],
    remove: { nodes: ['ntfy'] },
  });
  assert.equal(changed.nodes, 2); assert.equal(changed.edges, 1); assert.equal(changed.removed, 1);
  assert.equal(doc.nodes.find((n) => n.id === 'panel').status, 'wip');
  assert.equal(doc.nodes.find((n) => n.id === 'panel').label, 'Panel');   // untouched field kept
  assert.ok(!doc.nodes.some((n) => n.id === 'ntfy'));
  assert.ok(!doc.edges.some((e) => e.id === 'loop-ntfy'));                  // dangling edge dropped
  assert.ok(doc.edges.some((e) => e.id === 'new-e'));
});

test('placeUnpositioned gives every node a position and wraps frames', () => {
  const { doc, placed } = placeUnpositioned(example);
  assert.equal(placed, example.nodes.length);
  assert.ok(doc.nodes.every((n) => n.position));
  assert.ok(doc.frames.every((f) => f.position && f.size));
  // second call is a no-op
  assert.equal(placeUnpositioned(doc).placed, 0);
});

test('layout nests frames and keeps members inside', () => {
  const doc = layout(example);
  for (const n of doc.nodes) assert.ok(n.position && Number.isFinite(n.position.x));
  const fr = Object.fromEntries(doc.frames.map((f) => [f.id, f]));
  for (const n of doc.nodes.filter((n) => n.frame)) {
    const f = fr[n.frame];
    assert.ok(n.position.x >= f.position.x && n.position.y >= f.position.y, `${n.id} inside ${f.id}`);
    assert.ok(n.position.x + 260 <= f.position.x + f.size.width + 1, `${n.id} right edge inside ${f.id}`);
  }
  // child frames inside parent
  for (const f of doc.frames.filter((f) => f.parent)) {
    const p = fr[f.parent];
    assert.ok(f.position.x >= p.position.x && f.position.x + f.size.width <= p.position.x + p.size.width + 1, `${f.id} in ${p.id}`);
    assert.ok(f.position.y >= p.position.y && f.position.y + f.size.height <= p.position.y + p.size.height + 1, `${f.id} in ${p.id} (y)`);
  }
  // layout output lints clean of layout/* warnings
  const codes = lint(doc).map((d) => d.code).filter((c) => c.startsWith('layout/'));
  assert.deepEqual(codes, []);
});

test('exports', () => {
  assert.match(outline(example), /## frame core/);
  assert.match(toMarkdown(example), /\| `loop` \| service \|/);
  const mm = toMermaid(example);
  assert.match(mm, /^flowchart LR/);
  assert.match(mm, /typesense\[\("Typesense"\)\]/);
  assert.match(mm, /subgraph core\["Go Core · crv"\]/);
});

// Mermaid has no backslash escape and chokes on an unquoted parenthesis, so
// every label — node, frame and edge alike — is quoted with " and any quote
// inside it written as #quot;. Regression for #1, which fixed the edge labels.
test('mermaid quotes every label and escapes quotes as #quot;', () => {
  const doc = emptyDiagram('t');
  doc.frames.push({ id: 'f', label: 'Edge ("DMZ")' });
  doc.nodes.push(
    { id: 'gw', kind: 'api', label: 'Gateway (public)', frame: 'f' },
    { id: 'db', kind: 'db', label: 'Store "primary"' },
  );
  doc.edges.push({ id: 'gw-db', source: 'gw', target: 'db', kind: 'data', label: 'read "hot" rows', protocol: 'sql (TLS)' });
  const mm = toMermaid(doc);
  assert.match(mm, /subgraph f\["Edge \(#quot;DMZ#quot;\)"\]/);
  assert.match(mm, /gw\(\["Gateway \(public\)"\]\)/);
  assert.match(mm, /db\[\("Store #quot;primary#quot;"\)\]/);
  assert.match(mm, /gw --> \|"read #quot;hot#quot; rows \/ sql \(TLS\)"\| db|gw -->\|"read #quot;hot#quot; rows \/ sql \(TLS\)"\| db/);
  assert.ok(!/\\"/.test(mm), 'never emits a backslash escape — mermaid does not support it');
});

// The C4 mapping: nodes are containers, frames are groups, a module is a
// component of the one container that imports it (or of a synthetic one),
// externals sit outside the system. Validated against the Structurizr CLI
// (structurizr.sh validate) on every example and on this document.
test('structurizr export: containment, keyword ids, escaping, no parent→child relationship', () => {
  const h = emptyDiagram('Shop "v2"', 'line one\nline two');
  h.frames.push({ id: 'edge', label: 'Edge ("DMZ")' }, { id: 'empty', label: 'Nothing here' });
  h.nodes.push(
    { id: 'gw', kind: 'api', label: 'Gateway (public)', frame: 'edge', tech: 'Go', ports: [{ id: 'rest', protocol: 'https', dir: 'in' }], status: 'wip', flags: [{ id: 'f1', kind: 'issue', title: 'no rate limit' }] },
    { id: 'auth', kind: 'module', label: 'Auth lib', frame: 'edge' },
    { id: 'util', kind: 'module', label: 'Utils' },
    { id: 'views', kind: 'module', label: 'Keyword id', frame: 'edge' },
    { id: 'db', kind: 'db', label: 'Store "primary"' },
    { id: 'stripe', kind: 'external', label: 'Stripe' },
    { id: 'wk', kind: 'worker', label: 'Worker' },
  );
  h.edges.push(
    { id: 'gw-auth', source: 'gw', target: 'auth', kind: 'import' },
    { id: 'gw-util', source: 'gw', target: 'util', kind: 'import' },
    { id: 'wk-util', source: 'wk', target: 'util', kind: 'import' },
    { id: 'gw-views', source: 'gw', target: 'views', kind: 'import' },
    { id: 'gw-db', source: 'gw', target: 'db', kind: 'data', label: 'read "hot"', protocol: 'sql', targetPort: 'sql' },
    { id: 'gw-db2', source: 'gw', target: 'db', kind: 'data', label: 'read "hot"', protocol: 'sql' },
    { id: 'gw-stripe', source: 'gw', target: 'stripe', kind: 'sync', label: 'charge', protocol: 'https' },
  );
  const out = toStructurizr(h);
  assert.match(out, /^workspace "Shop \\"v2\\"" "line one line two" \{/m, 'quotes escaped, newline flattened');
  assert.match(out, /stripe = softwareSystem "Stripe" "" \{\n\s+tags "External"/, 'external is its own system');
  assert.match(out, /group "Edge \(\\"DMZ\\"\)" \{/); assert.doesNotMatch(out, /Nothing here/, 'an empty frame is not emitted');
  // auth has one importer → component inside gw; util has two → synthetic container; views collides with a keyword
  assert.match(out, /gw = container "Gateway \(public\)"[\s\S]*?auth = component "Auth lib"[\s\S]*?\n {8}\}/);
  assert.match(out, /modules = container "Modules"[\s\S]*?util = component "Utils"/);
  assert.match(out, /views_ = component "Keyword id"/);
  assert.match(out, /"dgv\.ports" "rest:https\/in"/); assert.match(out, /"dgv\.status" "wip"/); assert.match(out, /"dgv\.flags" "issue: no rate limit"/);
  assert.doesNotMatch(out, /gw -> auth/, 'containment already says it; Structurizr refuses parent→child');
  assert.match(out, /gw -> util "" "" "import"/);
  assert.equal((out.match(/gw -> db "read \\"hot\\"" "sql" "data"/g) ?? []).length, 1, 'duplicate relationship deduped');
  assert.match(out, /"dgv\.targetPort" "sql"/);
  assert.match(out, /systemContext sys "Context" \{\n\s+include \*\n\s+autoLayout tb 550 500\n\s+\}/);
  assert.match(out, /component gw "Components-gw"/);
  // and the example still exports
  assert.match(toStructurizr(example), /sys = softwareSystem "Local AI Harness"/);
});

test('catalog summary is compact', () => {
  const c = catalogSummary();
  assert.ok(Object.keys(c.nodeKinds).length >= 14);
  assert.ok(c.protocols.includes('grpc'));
});

test('store round-trips atomically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgv-'));
  assert.deepEqual(store.list(dir), []);
  store.write(dir, 'x', example);
  assert.equal(store.list(dir)[0].nodes, example.nodes.length);
  assert.equal(store.read(dir, 'x').meta.title, example.meta.title);
  assert.throws(() => store.fileOf(dir, '../evil'));
  store.remove(dir, 'x');
  assert.equal(store.exists(dir, 'x'), false);
});
