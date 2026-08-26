<script lang="ts" module>
  import { Position } from '@xyflow/svelte';
  // Floating attach point: where the centre-to-centre line leaves each box.
  function center(node: any) {
    const w = node.measured?.width ?? node.width ?? 260, h = node.measured?.height ?? node.height ?? 80;
    return { x: node.internals.positionAbsolute.x + w / 2, y: node.internals.positionAbsolute.y + h / 2, w, h };
  }
  function borderPoint(node: any, tx: number, ty: number) {
    const { x: cx, y: cy, w, h } = center(node);
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy, pos: Position.Top };
    const sx = w / 2, sy = h / 2;
    const scale = 1 / Math.max(Math.abs(dx) / sx, Math.abs(dy) / sy);
    const pos = Math.abs(dx) / sx > Math.abs(dy) / sy ? (dx > 0 ? Position.Right : Position.Left) : (dy > 0 ? Position.Bottom : Position.Top);
    return { x: cx + dx * scale, y: cy + dy * scale, pos };
  }
  // Routed attach point: the midpoint of the side facing the other node.
  function sidePoint(node: any, tx: number, ty: number) {
    const { x: cx, y: cy, w, h } = center(node);
    const dx = tx - cx, dy = ty - cy;
    const horizontal = Math.abs(dx) / (w / 2) > Math.abs(dy) / (h / 2);
    if (horizontal) return dx > 0 ? { x: cx + w / 2, y: cy, pos: Position.Right } : { x: cx - w / 2, y: cy, pos: Position.Left };
    return dy > 0 ? { x: cx, y: cy + h / 2, pos: Position.Bottom } : { x: cx, y: cy - h / 2, pos: Position.Top };
  }
  const ARROW_ANGLE = { [Position.Left]: 0, [Position.Right]: 180, [Position.Top]: 90, [Position.Bottom]: -90 };
  // midpoint of a polyline by length — label anchor for routed wires
  function midOf(pts: { x: number; y: number }[]) {
    let total = 0; const seg: number[] = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(l); total += l; }
    let acc = 0;
    for (let i = 0; i < seg.length; i++) {
      if (acc + seg[i] >= total / 2) { const t = (total / 2 - acc) / (seg[i] || 1); return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
      acc += seg[i];
    }
    return pts[Math.floor(pts.length / 2)];
  }
</script>

<script lang="ts">
  import { getBezierPath, getStraightPath, useInternalNode, useNodes, BaseEdge, EdgeLabel, type EdgeProps } from '@xyflow/svelte';
  import { hl } from '../stores/hl.svelte';
  import { dg } from '../stores/diagram.svelte';
  import { routeOrthogonal, toBeveledPath, DIR, STUB, BEVEL, type Rect, type Dir } from './edgeRouter';
  import type { EdgeData, NodeData } from '../model/flow';
  import EdgeKindPicker from './EdgeKindPicker.svelte';
  import { PROTOCOLS } from '@dgv/core';

  let { id, source, target, data, selected }: EdgeProps & { data?: EdgeData } = $props();
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const nodes = useNodes();

  const kind = $derived(data?.kind ?? 'sync');
  const connected = $derived(!!hl.activeId && (source === hl.activeId || target === hl.activeId));
  const problem = $derived(dg.problemIds.get(id));
  const filtered = $derived((!!hl.edgeFilter && kind !== hl.edgeFilter) || (!!hl.kindFilter && (dg.node(source)?.data as any)?.kind !== hl.kindFilter && (dg.node(target)?.data as any)?.kind !== hl.kindFilter));
  const stroke = $derived(selected ? 'var(--accent)' : problem === 'error' ? 'var(--err)' : connected ? hl.color : (hl.activeId || filtered) ? '#3a3733' : kind === 'import' ? '#4a4640' : '#6a655d');
  const width = $derived(selected || connected ? 2.4 : kind === 'import' ? 1 : kind === 'data' ? 2 : 1.5);
  const dash = $derived(({ async: '7 5', data: '2 4', deploy: '12 6', control: '8 4 2 4', import: '' } as Record<string, string>)[kind] ?? '');
  const text = $derived([data?.label, data?.protocol].filter(Boolean).join(' · '));
  const portsOf = (nid: string) => ((dg.node(nid)?.data as NodeData | undefined)?.ports ?? []);
  const up = (patch: Partial<EdgeData>) => dg.updateEdge(id, patch);

  // obstacles for the routed style: every component card (frames are containers, not blockers)
  const obstacles = $derived.by((): Rect[] => {
    if (hl.edgeStyle !== 'routed') return [];
    const all = nodes.current ?? [];
    const byId = new Map(all.map((n) => [n.id, n]));
    const out: Rect[] = [];
    for (const n of all) {
      if (n.type === 'frame') continue;
      const w = n.measured?.width ?? n.width ?? 0, h = n.measured?.height ?? n.height ?? 0;
      if (!w || !h) continue;
      let ax = n.position.x, ay = n.position.y;
      for (let p = n.parentId; p;) { const pn = byId.get(p); if (!pn) break; ax += pn.position.x; ay += pn.position.y; p = pn.parentId; }
      out.push({ x: ax, y: ay, w, h });
    }
    return out;
  });

  const exitDir = (p: Position): Dir => p === Position.Left ? DIR.W : p === Position.Top ? DIR.N : p === Position.Bottom ? DIR.S : DIR.E;
  const arriveDir = (p: Position): Dir => p === Position.Right ? DIR.W : p === Position.Bottom ? DIR.N : p === Position.Top ? DIR.S : DIR.E;
  const off = (d: Dir) => d === DIR.E ? { x: STUB, y: 0 } : d === DIR.W ? { x: -STUB, y: 0 } : d === DIR.S ? { x: 0, y: STUB } : { x: 0, y: -STUB };

  const geo = $derived.by(() => {
    const a = s.current, b = t.current;
    if (!a || !b) return null;
    const ac = center(a), bc = center(b);
    const style = hl.edgeStyle;

    if (style === 'routed') {
      const p = sidePoint(a, bc.x, bc.y), q = sidePoint(b, ac.x, ac.y);
      const eDir = exitDir(p.pos), aDir = arriveDir(q.pos);
      const eo = off(eDir), ao = off(aDir);
      const pts = routeOrthogonal({ x: p.x + eo.x, y: p.y + eo.y }, { x: q.x - ao.x, y: q.y - ao.y }, obstacles, eDir, aDir);
      const full = [{ x: p.x, y: p.y }, ...pts, { x: q.x, y: q.y }];
      const m = midOf(full);
      return { d: toBeveledPath(full, BEVEL), lx: m.x, ly: m.y, tx: q.x, ty: q.y, ang: ARROW_ANGLE[q.pos] };
    }
    const p = borderPoint(a, bc.x, bc.y), q = borderPoint(b, ac.x, ac.y);
    if (style === 'straight') {
      const [d, lx, ly] = getStraightPath({ sourceX: p.x, sourceY: p.y, targetX: q.x, targetY: q.y });
      return { d, lx, ly, tx: q.x, ty: q.y, ang: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 180 };
    }
    const [d, lx, ly] = getBezierPath({ sourceX: p.x, sourceY: p.y, sourcePosition: p.pos, targetX: q.x, targetY: q.y, targetPosition: q.pos });
    return { d, lx, ly, tx: q.x, ty: q.y, ang: ARROW_ANGLE[q.pos] };
  });
</script>

{#if geo}
  <BaseEdge {id} path={geo.d} class="dgv-path" style="stroke:{stroke};stroke-width:{width};stroke-dasharray:{dash};stroke-linejoin:round" interactionWidth={18} />
  <polygon points="0,0 -9,-4 -9,4" transform="translate({geo.tx},{geo.ty}) rotate({geo.ang})" fill={stroke} style="pointer-events:none" />
  {#if selected}
    <!-- inline contract editor: the wire IS the contract, edit it where it is -->
    <EdgeLabel x={geo.lx} y={geo.ly}>
      <div class="editor nodrag nopan" role="group">
        <div class="ends">{source} → {target}</div>
        <EdgeKindPicker value={kind} onchange={(k) => up({ kind: k })} />
        <div class="row">
          <input class="mono" list="protocols" placeholder="protocol" value={data?.protocol ?? ''} oninput={(e) => up({ protocol: (e.target as HTMLInputElement).value || undefined })} />
          <input placeholder="what happens" value={data?.label ?? ''} oninput={(e) => up({ label: (e.target as HTMLInputElement).value || undefined })} />
        </div>
        {#if portsOf(source).some((p) => p.dir === 'out' || p.dir === 'both') || portsOf(target).some((p) => p.dir !== 'out')}
          <div class="row">
            <select value={data?.sourcePort ?? ''} onchange={(e) => up({ sourcePort: (e.target as HTMLSelectElement).value || undefined })}><option value="">from port —</option>{#each portsOf(source).filter((p) => p.dir === 'out' || p.dir === 'both') as p}<option value={p.id}>↗ {p.id}</option>{/each}</select>
            <select value={data?.targetPort ?? ''} onchange={(e) => up({ targetPort: (e.target as HTMLSelectElement).value || undefined })}><option value="">to port —</option>{#each portsOf(target).filter((p) => p.dir !== 'out') as p}<option value={p.id}>↘ {p.id}{p.protocol ? ` (${p.protocol})` : ''}</option>{/each}</select>
          </div>
        {/if}
        <datalist id="protocols">{#each PROTOCOLS as p}<option value={p}></option>{/each}</datalist>
      </div>
    </EdgeLabel>
  {:else if text}
    <EdgeLabel x={geo.lx} y={geo.ly}>
      <div class="lbl" class:muted={(!!hl.activeId && !connected) || filtered}>{text}</div>
    </EdgeLabel>
  {/if}
{/if}

<style>
  .lbl { font-family: var(--mono); font-size: 9.5px; color: var(--muted); background: var(--bg); border: 1px solid var(--hair); border-radius: 3px; padding: 1px 6px; white-space: nowrap; pointer-events: none; }
  .lbl.muted { opacity: .35; }
  .editor { width: 250px; background: var(--s1); border: 1px solid var(--accent); border-radius: 7px; padding: 7px; display: grid; gap: 6px; pointer-events: auto; font-family: var(--sans); }
  .editor .ends { font-family: var(--mono); font-size: 10px; color: var(--muted); }
  .editor .row { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .editor input, .editor select { font-size: 11px; padding: 3px 6px; }
</style>
