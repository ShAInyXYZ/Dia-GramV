<script lang="ts" module>
  import { Position } from '@xyflow/svelte';
  // Floating edges: attach where the straight line between centres leaves each box.
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
</script>

<script lang="ts">
  import { getBezierPath, useInternalNode, BaseEdge, EdgeLabel, type EdgeProps } from '@xyflow/svelte';
  import { hl } from '../stores/hl.svelte';
  import { dg } from '../stores/diagram.svelte';
  import type { EdgeData } from '../model/flow';

  let { id, source, target, data, selected }: EdgeProps & { data?: EdgeData } = $props();
  const s = useInternalNode(source);
  const t = useInternalNode(target);

  const kind = $derived(data?.kind ?? 'sync');
  const connected = $derived(!!hl.activeId && (source === hl.activeId || target === hl.activeId));
  const problem = $derived(dg.problemIds.get(id));
  const stroke = $derived(selected ? 'var(--accent)' : problem === 'error' ? 'var(--err)' : connected ? hl.color : hl.activeId ? '#3a3733' : kind === 'import' ? '#4a4640' : '#6a655d');
  const width = $derived(selected || connected ? 2.4 : kind === 'import' ? 1 : kind === 'data' ? 2 : 1.5);
  const dash = $derived(({ async: '7 5', data: '2 4', deploy: '12 6', control: '8 4 2 4', import: '' } as Record<string, string>)[kind] ?? '');
  const text = $derived([data?.label, data?.protocol].filter(Boolean).join(' · '));

  const geo = $derived.by(() => {
    const a = s.current, b = t.current;
    if (!a || !b) return null;
    const bc = center(b), ac = center(a);
    const p = borderPoint(a, bc.x, bc.y), q = borderPoint(b, ac.x, ac.y);
    const [d, lx, ly] = getBezierPath({ sourceX: p.x, sourceY: p.y, sourcePosition: p.pos, targetX: q.x, targetY: q.y, targetPosition: q.pos });
    const ang = { [Position.Left]: 0, [Position.Right]: 180, [Position.Top]: 90, [Position.Bottom]: -90 }[q.pos];
    return { d, lx, ly, tx: q.x, ty: q.y, ang };
  });
</script>

{#if geo}
  <BaseEdge {id} path={geo.d} class="dgv-path" style="stroke:{stroke};stroke-width:{width};stroke-dasharray:{dash}" interactionWidth={18} />
  <polygon points="0,0 -9,-4 -9,4" transform="translate({geo.tx},{geo.ty}) rotate({geo.ang})" fill={stroke} style="pointer-events:none" />
  {#if text}
    <EdgeLabel x={geo.lx} y={geo.ly}>
      <div class="lbl" class:muted={!!hl.activeId && !connected && !selected} style="border-color:{selected ? 'var(--accent)' : 'var(--hair)'}">{text}</div>
    </EdgeLabel>
  {/if}
{/if}

<style>
  .lbl { font-family: var(--mono); font-size: 9.5px; color: var(--muted); background: var(--bg); border: 1px solid var(--hair); border-radius: 3px; padding: 1px 6px; white-space: nowrap; pointer-events: none; }
  .lbl.muted { opacity: .35; }
</style>
