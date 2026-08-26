/**
 * Hierarchy-aware auto layout (descended from Cerveau's nestedlayout.js).
 *
 * Membership is EXPLICIT (node.frame / frame.parent) — never inferred from
 * geometry, which is what made the old arch-viewer swallow neighbours.
 *
 *   1. leaf frames: dagre ranks the frame's own nodes top-to-bottom using
 *      only the edges inside the frame (cross-frame edges would drag
 *      unrelated frames into one rank); no internal edges → one column
 *   2. parent frames: children side by side, own loose nodes first
 *   3. roots + frameless nodes: packed into wrapped rows
 *
 * `measured` = { nodeId: {w,h} } from the viewer; falls back to estimates.
 * Returns a NEW doc — the caller decides whether to save.
 */
import dagre from '@dagrejs/dagre';
import { normalize, estimateHeight, NODE_W } from './model.js';

const GAP = 48, PAD = 44, HEADER = 60, GROUP_PAD = 52, GROUP_GAP = 72, COL_GAP = 140;

export function layout(rawDoc, measured = {}, opts = {}) {
  const doc = normalize(structuredClone(rawDoc));
  const dir = opts.direction ?? 'TB';
  const sizeOf = (n) => ({ w: measured[n.id]?.w ?? NODE_W, h: measured[n.id]?.h ?? estimateHeight(n) });
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const frames = doc.frames;
  const frameById = new Map(frames.map((f) => [f.id, f]));
  const validFrame = (id) => id && frameById.has(id);
  const own = (fid) => doc.nodes.filter((n) => (validFrame(n.frame) ? n.frame : null) === fid);
  const kids = (fid) => frames.filter((f) => (validFrame(f.parent) ? f.parent : null) === fid);

  function layoutNodes(nodes) {
    const ids = new Set(nodes.map((n) => n.id));
    const inner = doc.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
    const pos = new Map();
    if (!inner.length) {
      let y = 0, w = 0;
      for (const n of nodes) { const s = sizeOf(n); pos.set(n.id, { x: 0, y }); y += s.h + GAP; w = Math.max(w, s.w); }
      return { pos, width: w, height: Math.max(0, y - GAP) };
    }
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: dir, nodesep: GAP, ranksep: GAP + 16, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of nodes) { const s = sizeOf(n); g.setNode(n.id, { width: s.w, height: s.h }); }
    for (const e of inner) g.setEdge(e.source, e.target);
    dagre.layout(g);
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const n of nodes) {
      const d = g.node(n.id), s = sizeOf(n);
      const x = d.x - s.w / 2, y = d.y - s.h / 2;
      pos.set(n.id, { x, y });
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + s.w); maxY = Math.max(maxY, y + s.h);
    }
    for (const [k, p] of pos) pos.set(k, { x: p.x - minX, y: p.y - minY });
    return { pos, width: maxX - minX, height: maxY - minY };
  }

  // laid: frame id → { w, h, place(ox, oy) }
  const laid = new Map();
  const depth = (f) => { let d = 0, cur = f, seen = new Set(); while (validFrame(cur.parent) && !seen.has(cur.id)) { seen.add(cur.id); cur = frameById.get(cur.parent); d++; } return d; };
  const ordered = [...frames].sort((a, b) => depth(b) - depth(a));   // deepest first

  for (const f of ordered) {
    const children = kids(f.id).filter((k) => laid.has(k.id));
    const loose = own(f.id);
    const looseLaid = loose.length ? layoutNodes(loose) : null;
    if (!children.length) {
      const L = looseLaid ?? { pos: new Map(), width: 280, height: 80 };
      laid.set(f.id, {
        w: L.width + PAD * 2, h: L.height + HEADER + PAD,
        place(ox, oy) {
          f.position = { x: ox, y: oy }; f.size = { width: this.w, height: this.h };
          for (const n of loose) { const p = L.pos.get(n.id); n.position = { x: ox + PAD + p.x, y: oy + HEADER + p.y }; }
        },
      });
      continue;
    }
    // parent frame: loose column first, then children in a row (wrap when wide)
    const items = [];
    if (looseLaid) items.push({ kind: 'nodes', w: looseLaid.width, h: looseLaid.height, L: looseLaid });
    for (const k of children) items.push({ kind: 'frame', id: k.id, w: laid.get(k.id).w, h: laid.get(k.id).h });
    const totalW = items.reduce((a, it) => a + it.w + GROUP_GAP, 0);
    const rowMax = Math.max(...items.map((it) => it.w), Math.sqrt(totalW * 2000));
    let x = GROUP_PAD, rowY = 0, rowH = 0, maxW = 0;
    for (const it of items) {
      if (x > GROUP_PAD && x + it.w - GROUP_PAD > rowMax) { x = GROUP_PAD; rowY += rowH + GROUP_GAP; rowH = 0; }
      it.x = x; it.y = rowY; x += it.w + GROUP_GAP; rowH = Math.max(rowH, it.h); maxW = Math.max(maxW, x - GROUP_GAP);
    }
    const innerH = rowY + rowH;
    laid.set(f.id, {
      w: maxW + GROUP_PAD, h: innerH + HEADER + GROUP_PAD,
      place(ox, oy) {
        f.position = { x: ox, y: oy }; f.size = { width: this.w, height: this.h };
        for (const it of items) {
          if (it.kind === 'frame') laid.get(it.id).place(ox + it.x, oy + HEADER + it.y);
          else for (const n of loose) { const p = it.L.pos.get(n.id); n.position = { x: ox + it.x + p.x, y: oy + HEADER + it.y + p.y }; }
        }
      },
    });
  }

  // roots: frames without parent + frameless nodes (as one pseudo-column)
  const roots = frames.filter((f) => !validFrame(f.parent)).map((f) => ({ kind: 'frame', id: f.id, ...laid.get(f.id) }));
  const looseNodes = doc.nodes.filter((n) => !validFrame(n.frame));
  if (looseNodes.length) { const L = layoutNodes(looseNodes); roots.unshift({ kind: 'nodes', w: L.width, h: L.height, L, nodes: looseNodes }); }
  const totalW = roots.reduce((a, r) => a + r.w + COL_GAP, 0);
  const rowMax = Math.max(...roots.map((r) => r.w), Math.sqrt(totalW * 2400));
  let cx = 0, rowY = 0, rowH = 0;
  for (const r of roots) {
    if (cx > 0 && cx + r.w > rowMax) { cx = 0; rowY += rowH + COL_GAP; rowH = 0; }
    if (r.kind === 'frame') laid.get(r.id).place(cx, rowY);
    else for (const n of r.nodes) { const p = r.L.pos.get(n.id); n.position = { x: cx + p.x, y: rowY + p.y }; }
    cx += r.w + COL_GAP; rowH = Math.max(rowH, r.h);
  }
  for (const n of doc.nodes) n.position = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
  for (const f of doc.frames) { f.position = { x: Math.round(f.position.x), y: Math.round(f.position.y) }; f.size = { width: Math.round(f.size.width), height: Math.round(f.size.height) }; }
  return doc;
}
