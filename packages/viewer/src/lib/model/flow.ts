/**
 * .dgv.json  ⇄  Svelte Flow nodes/edges.
 * Doc positions are absolute; flow positions are relative to parentId.
 * Frames become nodes of type 'frame' (width/height explicit); components
 * become type 'dgv'; edges become type 'dgv' with the contract in `data`.
 */
import type { Node, Edge } from '@xyflow/svelte';
import { frameDepth, normalize, NODE_W, estimateHeight } from '@dgv/core';

export type Master = { tone: string; nodes: number; frames: number; members: string[]; kinds: { kind: string; n: number }[] };
export type NodeData = { kind: string; label: string; sublabel?: string; note?: string; tech?: string; status?: string; tags?: string[]; ports?: Port[]; ack?: string; master?: Master };
export type Port = { id: string; protocol?: string; dir?: 'in' | 'out' | 'both'; shape?: string };
export type FrameData = { label: string; tone?: string; note?: string; ack?: string; isFrame: true };
export type EdgeData = { kind?: string; protocol?: string; label?: string; sourcePort?: string; targetPort?: string; payload?: string; note?: string; ack?: string };
export type FNode = Node<NodeData | FrameData>;
export type FEdge = Edge<EdgeData>;

export const isFrame = (n: FNode) => n.type === 'frame';
export const isMaster = (n: FNode) => n.type === 'master';

export function toFlow(rawDoc: any): { nodes: FNode[]; edges: FEdge[] } {
  const doc = normalize(rawDoc);
  const frameById = new Map<string, any>(doc.frames.map((f: any) => [f.id, f]));
  const validParent = (id?: string | null) => (id && frameById.has(id) ? id : undefined);
  const abs = (f: any) => f.position ?? { x: 0, y: 0 };

  const frames: FNode[] = [...doc.frames]
    .sort((a: any, b: any) => frameDepth(doc, a.id) - frameDepth(doc, b.id))     // parents before children
    .map((f: any) => {
      const pid = validParent(f.parent);
      const p = pid ? frameById.get(pid) : null;
      const a = abs(f);
      return {
        id: f.id, type: 'frame',
        position: p ? { x: a.x - abs(p).x, y: a.y - abs(p).y } : { ...a },
        width: f.size?.width ?? 360, height: f.size?.height ?? 200,
        zIndex: -40 + frameDepth(doc, f.id) * 5,
        data: { label: f.label, tone: f.tone ?? 'neutral', note: f.note, ack: f.ack, isFrame: true },
        ...(pid ? { parentId: pid } : {}),
      };
    });

  const nodes: FNode[] = doc.nodes.map((n: any) => {
    const pid = validParent(n.frame);
    const p = pid ? frameById.get(pid) : null;
    const a = n.position ?? { x: 0, y: 0 };
    return {
      // A collapsed frame arrives as a node carrying `master` — same shape, own card.
      id: n.id, type: n.master ? 'master' : 'dgv',
      position: p ? { x: a.x - abs(p).x, y: a.y - abs(p).y } : { ...a },
      zIndex: 10,
      data: { kind: n.kind, label: n.label, sublabel: n.sublabel, note: n.note, tech: n.tech, status: n.status, tags: n.tags ?? [], ports: n.ports ?? [], ack: n.ack, master: n.master },
      ...(pid ? { parentId: pid } : {}),
    };
  });

  const edges: FEdge[] = doc.edges.map((e: any) => ({
    id: e.id, source: e.source, target: e.target, type: 'dgv', zIndex: 0,
    data: { kind: e.kind, protocol: e.protocol, label: e.label, sourcePort: e.sourcePort, targetPort: e.targetPort, payload: e.payload, note: e.note, ack: e.ack },
  }));
  return { nodes: [...frames, ...nodes], edges };
}

/** absolute position of a flow node by walking parentId */
export function absPos(nodes: FNode[], n: FNode): { x: number; y: number } {
  let x = n.position.x, y = n.position.y, pid = n.parentId;
  const byId = new Map(nodes.map((k) => [k.id, k]));
  const seen = new Set([n.id]);
  while (pid) {
    const p = byId.get(pid); if (!p || seen.has(p.id)) break;
    seen.add(p.id); x += p.position.x; y += p.position.y; pid = p.parentId;
  }
  return { x, y };
}

export const nodeW = (n: FNode) => n.measured?.width ?? n.width ?? (isFrame(n) ? 360 : NODE_W);
export const nodeH = (n: FNode) => n.measured?.height ?? n.height ?? (isFrame(n) ? 200 : estimateHeight({ ...(n.data as any) }));

const clean = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));

export function fromFlow(nodes: FNode[], edges: FEdge[], meta: any) {
  const r = (v: number) => Math.round(v);
  const frames = nodes.filter(isFrame).map((n) => {
    const a = absPos(nodes, n); const d = n.data as FrameData;
    return clean({ id: n.id, label: d.label, parent: n.parentId, tone: d.tone === 'neutral' ? undefined : d.tone, note: d.note, ack: d.ack,
      position: { x: r(a.x), y: r(a.y) }, size: { width: r(nodeW(n)), height: r(nodeH(n)) } });
  });
  const comps = nodes.filter((n) => !isFrame(n)).map((n) => {
    const a = absPos(nodes, n); const d = n.data as NodeData;
    return clean({ id: n.id, kind: d.kind, label: d.label, sublabel: d.sublabel, note: d.note, frame: n.parentId, tech: d.tech, status: d.status,
      tags: d.tags, ports: d.ports?.map((p) => clean({ ...p })), ack: d.ack, position: { x: r(a.x), y: r(a.y) } });
  });
  const es = edges.map((e) => clean({ id: e.id, source: e.source, target: e.target, ...(e.data ?? {}) }));
  return { dgv: 1, meta, frames, nodes: comps, edges: es };
}
