/**
 * Pure helpers over a DGV document. No IO, no DOM — shared by MCP + viewer.
 */
import { NODE_KINDS } from './catalog.js';

export const NODE_W = 260;          // card width the viewer renders
export const NODE_H_MIN = 64;       // card with only a label

export function emptyDiagram(title, description = '') {
  return {
    dgv: 1,
    meta: { title, description, updated: today(), colorBy: 'kind' },
    frames: [],
    nodes: [],
    edges: [],
  };
}

export function today() { return new Date().toISOString().slice(0, 10); }

/** Fill defaults so every consumer can rely on arrays + kinds existing. */
export function normalize(doc) {
  const d = { dgv: 1, meta: { title: 'Untitled', ...(doc.meta ?? {}) }, frames: [], nodes: [], edges: [], ...doc };
  d.frames = (d.frames ?? []).map((f) => ({ tone: 'neutral', ...f }));
  d.nodes = (d.nodes ?? []).map((n) => ({ ports: [], tags: [], ...n }));
  d.edges = (d.edges ?? []).map((e) => ({ kind: e.kind ?? defaultEdgeKind(e), ...e }));
  return d;
}

function defaultEdgeKind(e) {
  const p = (e.protocol ?? '').toLowerCase();
  if (['sql', 'redis', 's3', 'fs', 'smb'].includes(p)) return 'data';
  if (['kafka', 'nats', 'amqp', 'mqtt', 'sse', 'ws'].includes(p)) return 'async';
  if (p === 'import') return 'import';
  return 'sync';
}

/** Rough card height before the viewer has measured it. */
export function estimateHeight(n) {
  let h = 58;                                   // kind tag + label
  if (n.sublabel) h += 18;
  if (n.note) h += 12 + Math.ceil(String(n.note).length / 40) * 15;
  if (n.ports?.length) h += 10 + n.ports.length * 16;
  if (n.tech || n.status) h += 18;
  return Math.max(NODE_H_MIN, h);
}

export function indexes(doc) {
  return {
    node: new Map(doc.nodes.map((n) => [n.id, n])),
    frame: new Map(doc.frames.map((f) => [f.id, f])),
    edge: new Map(doc.edges.map((e) => [e.id, e])),
  };
}

/** Adjacency: id → { in: edges[], out: edges[] } */
export function adjacency(doc) {
  const adj = new Map();
  const get = (id) => { if (!adj.has(id)) adj.set(id, { in: [], out: [] }); return adj.get(id); };
  for (const n of doc.nodes) get(n.id);
  for (const e of doc.edges) { get(e.source).out.push(e); get(e.target).in.push(e); }
  return adj;
}

/** Depth of a frame in the parent chain (0 = root). Cycle-safe. */
export function frameDepth(doc, fid) {
  const byId = new Map(doc.frames.map((f) => [f.id, f]));
  let d = 0, cur = byId.get(fid); const seen = new Set();
  while (cur?.parent && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parent); d++; }
  return d;
}

/**
 * Upsert by id: merge partial objects into existing ones, append new ones.
 * `remove` deletes by id and drops edges whose endpoints vanish and nodes
 * whose frame vanishes (they become frameless, not deleted).
 */
export function applyPatch(doc, patch = {}) {
  const d = normalize(structuredClone(doc));
  const changed = { frames: 0, nodes: 0, edges: 0, removed: 0 };
  const merge = (list, items, key) => {
    for (const it of items ?? []) {
      if (!it?.id) continue;
      const i = list.findIndex((x) => x.id === it.id);
      if (i >= 0) list[i] = { ...list[i], ...it };
      else list.push(it);
      changed[key]++;
    }
  };
  if (patch.meta) d.meta = { ...d.meta, ...patch.meta };
  merge(d.frames, patch.frames, 'frames');
  merge(d.nodes, patch.nodes, 'nodes');
  merge(d.edges, patch.edges, 'edges');

  const rm = patch.remove ?? {};
  const rmSet = (a) => new Set(a ?? []);
  const rmF = rmSet(rm.frames), rmN = rmSet(rm.nodes), rmE = rmSet(rm.edges);
  if (rmF.size) {
    d.frames = d.frames.filter((f) => !rmF.has(f.id));
    for (const f of d.frames) if (f.parent && rmF.has(f.parent)) delete f.parent;
    for (const n of d.nodes) if (n.frame && rmF.has(n.frame)) delete n.frame;
  }
  if (rmN.size) d.nodes = d.nodes.filter((n) => !rmN.has(n.id));
  const nodeIds = new Set(d.nodes.map((n) => n.id));
  d.edges = d.edges.filter((e) => !rmE.has(e.id) && nodeIds.has(e.source) && nodeIds.has(e.target));
  changed.removed = rmF.size + rmN.size + rmE.size;

  d.meta.updated = today();
  return { doc: d, changed };
}

/**
 * Give a position to every node/frame that lacks one, without moving anything
 * that already has one. New nodes stack under the last member of their frame
 * (or under the diagram's bottom edge when frameless). Frames get a size that
 * wraps their members.
 */
export function placeUnpositioned(doc) {
  const d = normalize(doc);
  const byFrame = new Map();
  for (const n of d.nodes) {
    const k = n.frame ?? '';
    if (!byFrame.has(k)) byFrame.set(k, []);
    byFrame.get(k).push(n);
  }
  const GAP = 40, PAD = 48, TOP = 56;
  let placed = 0;
  for (const [fid, members] of byFrame) {
    const have = members.filter((n) => n.position);
    const need = members.filter((n) => !n.position);
    if (!need.length) continue;
    const frame = d.frames.find((f) => f.id === fid);
    let x, y;
    if (have.length) {
      x = Math.min(...have.map((n) => n.position.x));
      y = Math.max(...have.map((n) => n.position.y + estimateHeight(n))) + GAP;
    } else if (frame?.position) {
      x = frame.position.x + PAD; y = frame.position.y + TOP;
    } else {
      // brand new frame or loose nodes: to the right of everything placed so far
      const all = [...d.nodes.filter((n) => n.position), ...d.frames.filter((f) => f.position && f.size)];
      x = all.length ? Math.max(...all.map((o) => o.position.x + (o.size?.width ?? NODE_W))) + 120 : 0;
      y = 0;
      if (frame) { frame.position = { x: x - PAD, y: y - TOP }; x = frame.position.x + PAD; y = frame.position.y + TOP; }
    }
    for (const n of need) { n.position = { x, y }; y += estimateHeight(n) + GAP; placed++; }
  }
  // frames: position + size wrap members (grow only)
  for (const f of d.frames) {
    const members = d.nodes.filter((n) => n.frame === f.id && n.position);
    const kids = d.frames.filter((k) => k.parent === f.id && k.position && k.size);
    const boxes = [
      ...members.map((n) => ({ x: n.position.x, y: n.position.y, w: NODE_W, h: estimateHeight(n) })),
      ...kids.map((k) => ({ x: k.position.x, y: k.position.y, w: k.size.width, h: k.size.height })),
    ];
    if (!boxes.length) { if (!f.position) f.position = { x: 0, y: 0 }; if (!f.size) f.size = { width: 360, height: 200 }; continue; }
    const minX = Math.min(...boxes.map((b) => b.x)) - PAD, minY = Math.min(...boxes.map((b) => b.y)) - TOP;
    const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + PAD, maxY = Math.max(...boxes.map((b) => b.y + b.h)) + PAD;
    if (!f.position) f.position = { x: minX, y: minY };
    else f.position = { x: Math.min(f.position.x, minX), y: Math.min(f.position.y, minY) };
    const w = maxX - f.position.x, h = maxY - f.position.y;
    f.size = { width: Math.max(f.size?.width ?? 0, w), height: Math.max(f.size?.height ?? 0, h) };
  }
  return { doc: d, placed };
}

/** Human-readable summary (what an agent reads instead of the raw JSON). */
export function outline(doc) {
  const d = normalize(doc);
  const lines = [`# ${d.meta.title}`];
  if (d.meta.description) lines.push(d.meta.description);
  lines.push(`frames ${d.frames.length} · nodes ${d.nodes.length} · edges ${d.edges.length} · updated ${d.meta.updated ?? '?'}`, '');
  const nodeLine = (n) => {
    const bits = [`- ${n.id} [${n.kind}] ${n.label}`];
    if (n.sublabel) bits.push(`— ${n.sublabel}`);
    if (n.tech) bits.push(`(${n.tech})`);
    if (n.status) bits.push(`{${n.status}}`);
    if (n.ports?.length) bits.push('ports: ' + n.ports.map((p) => `${p.id}${p.protocol ? ':' + p.protocol : ''}${p.dir ? '/' + p.dir : ''}`).join(', '));
    return bits.join(' ');
  };
  const roots = d.frames.filter((f) => !f.parent);
  const walk = (f, depth) => {
    lines.push(`${'#'.repeat(Math.min(6, depth + 2))} frame ${f.id}: ${f.label}`);
    for (const n of d.nodes.filter((n) => n.frame === f.id)) lines.push(nodeLine(n));
    for (const k of d.frames.filter((k) => k.parent === f.id)) walk(k, depth + 1);
  };
  for (const f of roots) walk(f, 0);
  const loose = d.nodes.filter((n) => !n.frame || !d.frames.some((f) => f.id === n.frame));
  if (loose.length) { lines.push('## (no frame)'); for (const n of loose) lines.push(nodeLine(n)); }
  lines.push('', '## edges');
  for (const e of d.edges) {
    const parts = [`- ${e.id}: ${e.source} → ${e.target}`, `[${e.kind}${e.protocol ? ' ' + e.protocol : ''}]`];
    if (e.label) parts.push(e.label);
    if (e.targetPort || e.sourcePort) parts.push(`ports ${e.sourcePort ?? '·'}→${e.targetPort ?? '·'}`);
    if (e.payload) parts.push(`payload: ${e.payload}`);
    lines.push(parts.join(' '));
  }
  return lines.join('\n');
}

export function kindColor(kind) { return NODE_KINDS[kind]?.color ?? '#8a8580'; }
