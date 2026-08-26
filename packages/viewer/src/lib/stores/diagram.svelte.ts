/**
 * The one store. Holds the open diagram as Svelte Flow nodes/edges, tracks
 * dirtiness explicitly (Svelte Flow rewrites the arrays on select/drag, so
 * "array changed" ≠ "content changed"), lints continuously, saves to disk.
 */
import { lint, layout, NODE_KINDS, kindColor, STATUSES, applyPatch, emptyDiagram } from '@dgv/core';
import { api, type DiagramInfo } from '../api';
import { toFlow, fromFlow, absPos, nodeW, nodeH, isFrame, type FNode, type FEdge, type NodeData, type FrameData, type EdgeData } from '../model/flow';
import { hl, EDGE_STYLES } from './hl.svelte';

export type Sel = { type: 'node' | 'frame' | 'edge'; id: string } | null;
type Snap = { nodes: FNode[]; edges: FEdge[]; meta: any };
export type Diag = { code: string; severity: 'error' | 'warning' | 'info'; message: string; subject: any; fixes: string[] };

const PAD = 40, TOP = 52;

class DiagramStore {
  list = $state<DiagramInfo[]>([]);
  name = $state<string | null>(null);
  meta = $state<any>({ title: '' });
  nodes = $state.raw<FNode[]>([]);
  edges = $state.raw<FEdge[]>([]);
  dirty = $state(false);
  saveState = $state<'saved' | 'saving' | 'error'>('saved');
  selected = $state<Sel>(null);
  externalChange = $state(false);
  error = $state<string | null>(null);
  dir = $state<string>('');
  private lastSave = 0;
  // undo: `committed` is the state as of the last touch(); touch() pushes it
  // before adopting the new state, so order of mutate/touch never matters.
  private past: Snap[] = []; private future: Snap[] = []; private committed: Snap | null = null; private lastTouch = 0;
  canUndo = $state(false); canRedo = $state(false);

  doc = $derived.by(() => fromFlow(this.nodes, this.edges, this.meta));
  diagnostics = $derived.by<Diag[]>(() => {
    if (!this.name) return [];
    const measured: Record<string, { w: number; h: number }> = {};
    for (const n of this.nodes) if (n.measured?.height) measured[n.id] = { w: n.measured.width!, h: n.measured.height };
    try { return lint(this.doc, { measured }) as Diag[]; } catch (e) { return [{ code: 'internal', severity: 'error', message: String(e), subject: {}, fixes: [] }]; }
  });
  problemIds = $derived.by(() => {
    const m = new Map<string, 'error' | 'warning'>();
    for (const d of this.diagnostics) if (d.severity !== 'info' && d.subject?.id) { const cur = m.get(d.subject.id); if (cur !== 'error') m.set(d.subject.id, d.severity); }
    return m;
  });

  // ---- loading -------------------------------------------------------
  async refreshList() { this.list = await api.list(); }

  async open(name: string) {
    try {
      const doc = await api.read(name);
      const f = toFlow(doc);
      this.name = name; this.meta = doc.meta; this.nodes = f.nodes; this.edges = f.edges;
      this.dirty = false; this.saveState = 'saved'; this.externalChange = false; this.selected = null; this.error = null;
      this.past = []; this.future = []; this.committed = this.snap(); this.canUndo = this.canRedo = false;
      hl.activeId = null; hl.neighbors = null; hl.colorBy = doc.meta.colorBy ?? 'kind';
      hl.edgeStyle = EDGE_STYLES.includes(doc.meta.edgeStyle) ? doc.meta.edgeStyle : 'floating';
      location.hash = '#/' + name;
    } catch (e: any) { this.error = e.message; }
  }

  async create(name: string, title: string) {
    await api.write(name, emptyDiagram(title));
    await this.refreshList();
    await this.open(name);
  }

  onDiskChange(name: string) {
    this.refreshList();
    if (name !== this.name) return;
    if (Date.now() - this.lastSave < 1500) return;   // our own save echoing back
    if (this.dirty) this.externalChange = true;
    else this.open(name);
  }

  // ---- saving --------------------------------------------------------
  async save() {
    if (!this.name) return;
    this.saveState = 'saving';
    try {
      this.meta = { ...this.meta, colorBy: hl.colorBy, edgeStyle: hl.edgeStyle, updated: new Date().toISOString().slice(0, 10) };
      await api.write(this.name, this.doc);
      this.lastSave = Date.now();
      this.dirty = false; this.saveState = 'saved'; this.externalChange = false;
      this.refreshList();
    } catch (e: any) { this.saveState = 'error'; this.error = e.message; }
  }
  touch() {
    this.dirty = true;
    const now = Date.now();
    if (this.committed && now - this.lastTouch > 400) { this.past.push(this.committed); if (this.past.length > 60) this.past.shift(); this.future = []; }
    this.lastTouch = now; this.committed = this.snap(); this.canUndo = this.past.length > 0; this.canRedo = this.future.length > 0;
  }
  private snap(): Snap { const raw: any = { nodes: $state.snapshot(this.nodes), edges: $state.snapshot(this.edges), meta: $state.snapshot(this.meta) }; return structuredClone(raw) as Snap; }
  private restore(sn: Snap) { this.nodes = sn.nodes; this.edges = sn.edges; this.meta = sn.meta; this.committed = structuredClone(sn); this.dirty = true; this.selected = null; this.canUndo = this.past.length > 0; this.canRedo = this.future.length > 0; }
  undo() { const sn = this.past.pop(); if (!sn) return; this.future.push(this.snap()); this.restore(sn); }
  redo() { const sn = this.future.pop(); if (!sn) return; this.past.push(this.snap()); this.restore(sn); }

  /** while dragging: which frame would adopt the node (frame highlights) */
  onDrag(dragged: FNode[]) {
    const d = dragged[0]; const n = d && this.nodes.find((k) => k.id === d.id); if (!n) { hl.dropFrame = null; return; }
    const a = absPos(this.nodes, { ...n, position: d.position, parentId: n.parentId });
    const exclude = new Set<string>([n.id]);
    if (isFrame(n)) for (const k of this.nodes) if (this.isDescendant(k.id, n.id)) exclude.add(k.id);
    hl.dropFrame = this.frameAt(a, nodeW(n), nodeH(n), exclude)?.id ?? null;
  }

  /** align / distribute the selected component cards (absolute coords, written back relative) */
  align(mode: 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter' | 'hspread' | 'vspread') {
    const sel = this.nodes.filter((n) => n.selected && !isFrame(n)); if (sel.length < 2) return;
    const boxes = sel.map((n) => ({ n, ...absPos(this.nodes, n), w: nodeW(n), h: nodeH(n) }));
    const minX = Math.min(...boxes.map((b) => b.x)), maxR = Math.max(...boxes.map((b) => b.x + b.w));
    const minY = Math.min(...boxes.map((b) => b.y)), maxB = Math.max(...boxes.map((b) => b.y + b.h));
    const target = new Map<string, { x: number; y: number }>();
    if (mode === 'hspread' || mode === 'vspread') {
      const horiz = mode === 'hspread';
      const sorted = [...boxes].sort((a, b) => horiz ? a.x - b.x : a.y - b.y);
      const total = horiz ? maxR - minX : maxB - minY, used = sorted.reduce((a, b) => a + (horiz ? b.w : b.h), 0);
      const gap = (total - used) / (sorted.length - 1); let cur = horiz ? minX : minY;
      for (const b of sorted) { target.set(b.n.id, horiz ? { x: cur, y: b.y } : { x: b.x, y: cur }); cur += (horiz ? b.w : b.h) + gap; }
    } else for (const b of boxes) target.set(b.n.id, {
      x: mode === 'left' ? minX : mode === 'right' ? maxR - b.w : mode === 'hcenter' ? (minX + maxR) / 2 - b.w / 2 : b.x,
      y: mode === 'top' ? minY : mode === 'bottom' ? maxB - b.h : mode === 'vcenter' ? (minY + maxB) / 2 - b.h / 2 : b.y,
    });
    this.nodes = this.nodes.map((n) => {
      const t = target.get(n.id); if (!t) return n;
      const p = n.parentId ? this.nodes.find((k) => k.id === n.parentId) : null;
      const base = p ? absPos(this.nodes, p) : { x: 0, y: 0 };
      return { ...n, position: { x: Math.round(t.x - base.x), y: Math.round(t.y - base.y) } };
    });
    this.refit(); this.touch();
  }


  // ---- editing -------------------------------------------------------
  private uid(prefix: string) {
    let i = 1; while (this.nodes.some((n) => n.id === `${prefix}-${i}`) || this.edges.some((e) => e.id === `${prefix}-${i}`)) i++;
    return `${prefix}-${i}`;
  }

  addNode(kind: string, at: { x: number; y: number }) {
    const id = this.uid(kind);
    const parent = this.frameAt(at, 260, 80);
    const pos = parent ? rel(at, absPos(this.nodes, parent)) : at;
    const n: FNode = { id, type: 'dgv', position: pos, zIndex: 10, data: { kind, label: NODE_KINDS[kind]?.label ?? kind, ports: [], tags: [] }, ...(parent ? { parentId: parent.id } : {}) };
    this.nodes = [...this.nodes, n];
    this.touch(); this.select({ type: 'node', id });
    return id;
  }

  addFrame(at: { x: number; y: number }, adoptSelected = true) {
    const id = this.uid('frame');
    const sel = adoptSelected ? this.nodes.filter((n) => n.selected) : [];
    let x = at.x, y = at.y, w = 360, h = 200;
    if (sel.length) {
      const boxes = sel.map((n) => ({ ...absPos(this.nodes, n), w: nodeW(n), h: nodeH(n) }));
      x = Math.min(...boxes.map((b) => b.x)) - PAD; y = Math.min(...boxes.map((b) => b.y)) - TOP;
      w = Math.max(...boxes.map((b) => b.x + b.w)) + PAD - x; h = Math.max(...boxes.map((b) => b.y + b.h)) + PAD - y;
    }
    // the frame nests where its top-left lands (only among frames not being adopted)
    const parent = this.frameAt({ x, y }, w, h, new Set(sel.map((n) => n.id)));
    const frame: FNode = { id, type: 'frame', position: parent ? rel({ x, y }, absPos(this.nodes, parent)) : { x, y }, width: w, height: h,
      zIndex: parent ? (parent.zIndex ?? -40) + 5 : -40, data: { label: 'Frame', tone: 'neutral', isFrame: true }, ...(parent ? { parentId: parent.id } : {}) };
    const selIds = new Set(sel.map((n) => n.id));
    // frames must precede their children in the array
    this.nodes = [frame, ...this.nodes.map((n) => selIds.has(n.id) ? { ...n, parentId: id, position: rel(absPos(this.nodes, n), { x, y }), selected: false } : n)];
    this.nodes = orderFramesFirst(this.nodes);
    this.touch(); this.select({ type: 'frame', id });
    return id;
  }

  updateData(id: string, patch: Partial<NodeData & FrameData>) {
    this.nodes = this.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n);
    this.touch();
  }
  updateEdge(id: string, patch: Partial<EdgeData>) {
    this.edges = this.edges.map((e) => e.id === id ? { ...e, data: { ...(e.data ?? {}), ...patch } } : e);
    this.touch();
  }
  renameId(id: string, next: string) {
    next = next.trim();
    if (!next || next === id || this.nodes.some((n) => n.id === next)) return false;
    this.nodes = this.nodes.map((n) => ({ ...(n.id === id ? { ...n, id: next } : n), ...(n.parentId === id ? { parentId: next } : {}) }));
    this.edges = this.edges.map((e) => ({ ...e, source: e.source === id ? next : e.source, target: e.target === id ? next : e.target }));
    if (this.selected?.id === id) this.selected = { ...this.selected, id: next };
    this.touch(); return true;
  }

  /** Move a node/frame into another frame (or none), keeping its absolute position. */
  setParent(id: string, frameId: string | null) {
    const n = this.nodes.find((k) => k.id === id); if (!n || frameId === id) return;
    const a = absPos(this.nodes, n);
    const p = frameId ? this.nodes.find((k) => k.id === frameId) : null;
    if (frameId && (!p || this.isDescendant(frameId, id))) return;
    const next: FNode = { ...n, position: p ? rel(a, absPos(this.nodes, p)) : a, zIndex: isFrame(n) ? (p ? (p.zIndex ?? -40) + 5 : -40) : 10 };
    if (p) next.parentId = p.id; else delete next.parentId;
    this.nodes = orderFramesFirst(this.nodes.map((k) => k.id === id ? next : k));
    this.refit(); this.touch();
  }
  private isDescendant(frameId: string, ancestor: string) {
    let cur = this.nodes.find((k) => k.id === frameId); const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) { if (cur.parentId === ancestor) return true; seen.add(cur.id); cur = this.nodes.find((k) => k.id === cur!.parentId); }
    return false;
  }

  /** innermost frame whose absolute rect contains the given box (by centre) */
  frameAt(at: { x: number; y: number }, w = 0, h = 0, exclude = new Set<string>()): FNode | null {
    const cx = at.x + w / 2, cy = at.y + h / 2;
    let best: FNode | null = null, bestArea = Infinity;
    for (const f of this.nodes.filter(isFrame)) {
      if (exclude.has(f.id)) continue;
      const a = absPos(this.nodes, f), fw = nodeW(f), fh = nodeH(f);
      if (cx >= a.x && cy >= a.y && cx <= a.x + fw && cy <= a.y + fh && fw * fh < bestArea) { best = f; bestArea = fw * fh; }
    }
    return best;
  }

  /** after a drag: re-nest by geometry, then grow frames around their members */
  afterDrag(dragged: FNode[]) {
    hl.dropFrame = null;
    for (const d of dragged) {
      const n = this.nodes.find((k) => k.id === d.id); if (!n) continue;
      const a = absPos(this.nodes, n);
      const exclude = new Set<string>([n.id]);
      if (isFrame(n)) for (const k of this.nodes) if (this.isDescendant(k.id, n.id)) exclude.add(k.id);
      const target = this.frameAt(a, nodeW(n), nodeH(n), exclude);
      if ((target?.id ?? null) !== (n.parentId ?? null)) this.setParent(n.id, target?.id ?? null);
    }
    this.refit(); this.touch();
  }

  /** frames grow (never shrink) to contain their children; deepest first */
  refit() {
    const nodes = this.nodes.map((n) => ({ ...n }));
    const depth = (n: FNode) => { let d = 0, p = n.parentId; const seen = new Set<string>(); while (p && !seen.has(p)) { seen.add(p); p = nodes.find((k) => k.id === p)?.parentId; d++; } return d; };
    for (const f of nodes.filter(isFrame).sort((a, b) => depth(b) - depth(a))) {
      const kids = nodes.filter((k) => k.parentId === f.id); if (!kids.length) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const k of kids) { minX = Math.min(minX, k.position.x); minY = Math.min(minY, k.position.y); maxX = Math.max(maxX, k.position.x + nodeW(k)); maxY = Math.max(maxY, k.position.y + nodeH(k)); }
      const dx = Math.min(0, minX - PAD), dy = Math.min(0, minY - TOP);
      if (dx || dy) { f.position = { x: f.position.x + dx, y: f.position.y + dy }; for (const k of kids) k.position = { x: k.position.x - dx, y: k.position.y - dy }; }
      f.width = Math.max(nodeW(f), maxX - dx + PAD); f.height = Math.max(nodeH(f), maxY - dy + PAD);
      if (f.measured) f.measured = { width: f.width, height: f.height };
    }
    this.nodes = nodes;
  }

  /** delete by ids; frames release their children to the frame's parent */
  remove(ids: string[]) {
    const set = new Set(ids);
    let nodes = this.nodes;
    for (const f of nodes.filter((n) => set.has(n.id) && isFrame(n))) {
      const fa = absPos(nodes, f), gp = f.parentId && !set.has(f.parentId) ? nodes.find((k) => k.id === f.parentId) : undefined;
      const ga = gp ? absPos(nodes, gp) : { x: 0, y: 0 };
      nodes = nodes.map((k) => k.parentId === f.id ? { ...k, parentId: gp?.id, position: { x: fa.x + k.position.x - ga.x, y: fa.y + k.position.y - ga.y } } : k);
    }
    this.nodes = nodes.filter((n) => !set.has(n.id)).map((n) => { const c = { ...n }; if (!c.parentId) delete c.parentId; return c; });
    this.edges = this.edges.filter((e) => !set.has(e.id) && !set.has(e.source) && !set.has(e.target));
    if (this.selected && set.has(this.selected.id)) this.selected = null;
    this.touch();
  }

  connect(source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null): FEdge | null {
    if (source === target) return null;
    const s = this.nodes.find((n) => n.id === source), t = this.nodes.find((n) => n.id === target);
    if (!s || !t || isFrame(s) || isFrame(t)) return null;
    const id = this.uid(`${source}-${target}`).replace(/-1$/, '');
    // a handle named after a declared port binds the edge to it; 'in'/'out' are the generic handles
    const portOf = (n: FNode, h?: string | null) => (h && (n.data as NodeData).ports?.some((p) => p.id === h) ? h : undefined);
    const sp = portOf(s, sourceHandle), tp = portOf(t, targetHandle);
    const tport = tp ? (t.data as NodeData).ports!.find((p) => p.id === tp) : undefined;
    const edge: FEdge = { id: this.edges.some((e) => e.id === id) ? this.uid(id) : id, source, target, type: 'dgv', zIndex: 0,
      data: { kind: tport?.protocol && ['sql', 'redis', 's3', 'fs'].includes(tport.protocol) ? 'data' : 'sync', protocol: tport?.protocol, sourcePort: sp, targetPort: tp } };
    this.touch();
    queueMicrotask(() => this.select({ type: 'edge', id: edge.id }));
    return edge;
  }

  relayout(direction: 'TB' | 'LR' = 'TB') {
    const measured: Record<string, { w: number; h: number }> = {};
    for (const n of this.nodes) if (!isFrame(n) && n.measured?.height) measured[n.id] = { w: n.measured.width!, h: n.measured.height };
    const f = toFlow(layout(this.doc, measured, { direction }));
    this.nodes = f.nodes; this.edges = f.edges; this.touch();
  }

  // ---- selection -----------------------------------------------------
  select(sel: Sel) {
    this.selected = sel;
    this.nodes = this.nodes.map((n) => ({ ...n, selected: sel?.type !== 'edge' && n.id === sel?.id }));
    this.edges = this.edges.map((e) => ({ ...e, selected: sel?.type === 'edge' && e.id === sel?.id }));
  }
  onSelectionChange(nodes: FNode[], edges: FEdge[]) {
    if (edges.length) this.selected = { type: 'edge', id: edges[0].id };
    else if (nodes.length) this.selected = { type: isFrame(nodes[0]) ? 'frame' : 'node', id: nodes[0].id };
    else this.selected = null;
  }
  setActive(id: string | null) {
    hl.activeId = id;
    if (!id) { hl.neighbors = null; hl.color = null; return; }
    const set = new Set([id]);
    for (const e of this.edges) { if (e.source === id) set.add(e.target); if (e.target === id) set.add(e.source); }
    hl.neighbors = set;
    const n = this.nodes.find((k) => k.id === id);
    hl.color = n ? accentOf(n.data as NodeData) : null;
  }

  frames() { return this.nodes.filter(isFrame); }
  node(id: string) { return this.nodes.find((n) => n.id === id); }
  edge(id: string) { return this.edges.find((e) => e.id === id); }
}

export function accentOf(d: NodeData): string {
  if (hl.colorBy === 'status') return STATUSES[d.status ?? '']?.color ?? '#5a564f';
  return kindColor(d.kind);
}
const rel = (a: { x: number; y: number }, p: { x: number; y: number }) => ({ x: a.x - p.x, y: a.y - p.y });
function orderFramesFirst(nodes: FNode[]) {
  const depth = (n: FNode) => { let d = 0, p = n.parentId; const seen = new Set<string>(); while (p && !seen.has(p)) { seen.add(p); p = nodes.find((k) => k.id === p)?.parentId; d++; } return d; };
  return [...nodes].sort((a, b) => (isFrame(a) ? 0 : 1) - (isFrame(b) ? 0 : 1) || depth(a) - depth(b));
}

export const dg = new DiagramStore();
export { applyPatch };
