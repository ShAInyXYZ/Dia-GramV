<script lang="ts">
  // Outline drawn behind a card, sized to the card. The paths live in core so
  // the SVG snapshot draws exactly the same shapes as the canvas does.
  import { shapePath, shapeDetail } from '@dgv/core';
  let { shape = 'rect', w = 260, h = 80, color = '#8a8580', dim = false }: { shape?: string; w?: number; h?: number; color?: string; dim?: boolean } = $props();

  const k = $derived(Math.min(1, Math.min(w / 120, h / 48)));
  const path = $derived(shapePath(shape, w, h));
  const detail = $derived(shapeDetail(shape, w, h));
  const mini = $derived(h < 40);
  const dashed = $derived(shape === 'dashed');
  const thin = $derived(shape === 'thin');
</script>

<svg class="shape" width={w} height={h} viewBox="0 0 {w} {h}" aria-hidden="true">
  <path d={path} fill="var(--s2)" stroke={color} stroke-width={thin ? 1 : 1.5} stroke-dasharray={dashed ? '6 4' : undefined} opacity={dim ? .5 : 1} />
  {#if detail}<path d={detail} fill="none" stroke={color} stroke-width="1.5" opacity={dim ? .5 : 1} />{/if}
  {#if shape === 'window'}
    {#if mini}<line x1="0" y1={h * .42} x2={w} y2={h * .42} stroke={color} stroke-width="1" opacity=".55" /><circle cx="6" cy={h * .21} r="1.6" fill={color} opacity=".8" /><circle cx="11" cy={h * .21} r="1.6" fill={color} opacity=".5" />
    {:else}<line x1="0" y1="20" x2={w} y2="20" stroke={color} stroke-width="1" opacity=".55" /><circle cx="11" cy="10" r="2.5" fill={color} opacity=".8" /><circle cx="20" cy="10" r="2.5" fill={color} opacity=".5" />{/if}
  {/if}
  {#if shape === 'device'}
    {#if mini}<rect x={w / 2 - w * .18} y="3" width={w * .36} height="2" rx="1" fill={color} opacity=".7" /><rect x={w / 2 - w * .12} y={h - 5} width={w * .24} height="2" rx="1" fill={color} opacity=".6" />
    {:else}<rect x={w / 2 - 22} y="6" width="44" height="4" rx="2" fill={color} opacity=".7" /><rect x={w / 2 - 16} y={h - 8} width="32" height="3" rx="1.5" fill={color} opacity=".6" />{/if}
  {/if}
</svg>

<style>
  .shape { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
</style>
