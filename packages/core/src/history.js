/**
 * Change history: what changed in the architecture, on which element, by whom.
 *
 * Computed on every write by diffing the document on disk against the one
 * being saved — nobody has to remember to log anything, and the viewer's
 * saves and the agent's dgv_apply calls land in the same list. Kept in the
 * document itself (`history`, newest last, capped) so it travels with the
 * file and an agent sees it in dgv_read.
 *
 * Only ARCHITECTURE counts. Positions, sizes, colour mode and wire style are
 * layout, not design: dragging a card around does not make an entry.
 *
 * entry = { at, by, type: node|edge|frame|meta, id, op, ...detail }
 *   op add/remove:  { kind?, label }
 *   op rename:      { to }
 *   op change:      { fields: [{ field, from, to }] }   (values already brief)
 *   op flag/resolve:{ flag: { id, kind, title } }
 */
import { normalize } from './model.js';

export const HISTORY_MAX = 300;

const NODE_FIELDS = ['kind', 'label', 'sublabel', 'note', 'frame', 'tech', 'status', 'path', 'tags', 'ports', 'ack'];
const EDGE_FIELDS = ['source', 'target', 'kind', 'protocol', 'label', 'sourcePort', 'targetPort', 'payload', 'note', 'ack'];
const FRAME_FIELDS = ['label', 'parent', 'tone', 'note', 'ack'];
const META_FIELDS = ['title', 'description', 'driftIgnore'];

/** A value as one short line, for an entry and for a human reading it. */
export function brief(v) {
  if (v == null || v === '') return undefined;
  if (Array.isArray(v)) {
    if (!v.length) return undefined;
    if (v.every((x) => typeof x === 'string')) return v.join(', ');
    // ports
    return v.map((p) => (p && typeof p === 'object' && p.id ? `${p.id}${p.protocol ? ':' + p.protocol : ''}${p.dir ? '/' + p.dir : ''}` : JSON.stringify(p))).join(', ');
  }
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

const same = (a, b) => brief(a) === brief(b);

function fieldDiff(a, b, fields) {
  const out = [];
  for (const f of fields) if (!same(a[f], b[f])) out.push({ field: f, from: brief(a[f]), to: brief(b[f]) });
  return out;
}

function flagDiff(a, b) {
  const before = new Map((a.flags ?? []).map((f) => [f.id, f]));
  const after = new Map((b.flags ?? []).map((f) => [f.id, f]));
  const out = [];
  for (const [id, f] of after) if (!before.has(id)) out.push({ op: 'flag', flag: { id, kind: f.kind ?? 'issue', title: f.title } });
  for (const [id, f] of before) if (!after.has(id)) out.push({ op: 'resolve', flag: { id, kind: f.kind ?? 'issue', title: f.title } });
  return out;
}

/** Entries describing how `next` differs from `prev`. No timestamps, no author. */
export function diffDocs(prevDoc, nextDoc) {
  const prev = normalize(prevDoc ?? { meta: { title: '' } }), next = normalize(nextDoc);
  const out = [];
  const renames = new Map();   // old node id → new node id

  const section = (type, fields, before, after, labelOf) => {
    const A = new Map(before.map((x) => [x.id, x])), B = new Map(after.map((x) => [x.id, x]));
    const removed = before.filter((x) => !B.has(x.id)), added = after.filter((x) => !A.has(x.id));
    // A node that vanished while an identical one appeared under a new id was
    // renamed, not replaced — the viewer's id field does exactly this.
    if (type === 'node') {
      for (const r of removed) {
        const twin = added.find((a) => !renames.has(a.id) && ![...renames.values()].includes(a.id) && !fieldDiff(r, a, fields).length);
        if (twin) renames.set(r.id, twin.id);
      }
    }
    for (const r of removed) {
      if (renames.has(r.id)) out.push({ type, id: r.id, op: 'rename', to: renames.get(r.id), kind: r.kind, label: labelOf(r) });
      else out.push({ type, id: r.id, op: 'remove', kind: r.kind, label: labelOf(r) });
    }
    const renamedTo = new Set(renames.values());
    for (const a of added) if (!renamedTo.has(a.id)) out.push({ type, id: a.id, op: 'add', kind: a.kind, label: labelOf(a) });
    for (const b of after) {
      const a = A.get(b.id); if (!a) continue;
      let fields_ = fieldDiff(a, b, fields);
      // an edge whose end was renamed did not change; the node did
      if (type === 'edge') fields_ = fields_.filter((f) => !(['source', 'target'].includes(f.field) && renames.get(f.from) === f.to));
      if (fields_.length) out.push({ type, id: b.id, op: 'change', fields: fields_ });
      for (const fl of flagDiff(a, b)) out.push({ type, id: b.id, ...fl });
    }
    // flags on brand-new elements are raised in the same breath
    for (const a of added) for (const fl of (a.flags ?? [])) out.push({ type, id: a.id, op: 'flag', flag: { id: fl.id, kind: fl.kind ?? 'issue', title: fl.title } });
  };

  section('frame', FRAME_FIELDS, prev.frames, next.frames, (f) => f.label);
  section('node', NODE_FIELDS, prev.nodes, next.nodes, (n) => n.label);
  section('edge', EDGE_FIELDS, prev.edges, next.edges, (e) => `${e.source} → ${e.target}`);
  const meta = fieldDiff(prev.meta, next.meta, META_FIELDS);
  if (meta.length && prevDoc) out.push({ type: 'meta', id: 'meta', op: 'change', fields: meta });
  return out;
}

/**
 * `next` with its history carried over from `prev` and extended by the diff.
 * History always comes from the document on disk: a client that never saw it
 * (the viewer sends the diagram without it) cannot truncate it by saving.
 */
export function withHistory(prevDoc, nextDoc, { by = 'agent', at = new Date().toISOString(), max = HISTORY_MAX } = {}) {
  const entries = diffDocs(prevDoc, nextDoc).map((e) => ({ at, by, ...e }));
  const base = prevDoc?.history ?? nextDoc.history ?? [];
  const history = [...base, ...entries].slice(-max);
  const { history: _drop, ...rest } = nextDoc;
  return { doc: { ...rest, ...(history.length ? { history } : {}) }, entries };
}

/** One line for an entry — the outline, the hook and the viewer all use it. */
export function describeChange(e) {
  const v = (x) => (x == null ? '∅' : x);
  switch (e.op) {
    case 'add': return `added ${e.kind ?? e.type} "${e.label ?? e.id}"`;
    case 'remove': return `removed ${e.kind ?? e.type} "${e.label ?? e.id}"`;
    case 'rename': return `renamed → ${e.to}`;
    case 'change': return (e.fields ?? []).map((f) => `${f.field}: ${v(f.from)} → ${v(f.to)}`).join(' · ');
    case 'flag': return `⚑ ${e.flag?.kind ?? 'issue'}: ${e.flag?.title ?? ''}`;
    case 'resolve': return `✓ resolved: ${e.flag?.title ?? e.flag?.id ?? ''}`;
    default: return e.op;
  }
}
