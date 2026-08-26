<script lang="ts">
  // Outline drawn behind a card, sized to the card. One SVG, many shapes,
  // so every kind is recognisable at minimap zoom without reading text.
  let { shape = 'rect', w = 260, h = 80, color = '#8a8580', dim = false }: { shape?: string; w?: number; h?: number; color?: string; dim?: boolean } = $props();

  const r = 7;
  const path = $derived.by(() => {
    const W = w, H = h;
    switch (shape) {
      case 'pill': { const rr = Math.min(H / 2, 22); return `M${rr},0 H${W - rr} A${rr},${rr} 0 0 1 ${W - rr},${H} H${rr} A${rr},${rr} 0 0 1 ${rr},0 Z`; }
      case 'hexagon': { const c = Math.min(18, H / 2); return `M${c},0 H${W - c} L${W},${H / 2} L${W - c},${H} H${c} L0,${H / 2} Z`; }
      case 'skew': { const s = 16; return `M${s},0 H${W} L${W - s},${H} H0 Z`; }
      case 'diamond': { const c = 12; return `M${c},0 H${W - c} L${W},${c} V${H - c} L${W - c},${H} H${c} L0,${H - c} V${c} Z`; }
      case 'chevron': { const c = 18; return `M0,0 H${W - c} L${W},${H / 2} L${W - c},${H} H0 Z`; }
      case 'device': { const rr = 16; return `M${rr},0 H${W - rr} Q${W},0 ${W},${rr} V${H - rr} Q${W},${H} ${W - rr},${H} H${rr} Q0,${H} 0,${H - rr} V${rr} Q0,0 ${rr},0 Z`; }
      case 'tab': { return `M0,${r} Q0,0 ${r},0 H${Math.min(90, W * .4)} l10,9 H${W - r} Q${W},9 ${W},${9 + r} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} Z`; }
      case 'folder': { return `M0,${r + 8} Q0,8 ${r},8 H${Math.min(70, W * .3)} l8,-8 H${W - r} Q${W},0 ${W},${r} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} Z`; }
      case 'cylinder': { const e = 9; return `M0,${e} A${W / 2},${e} 0 0 1 ${W},${e} V${H - e} A${W / 2},${e} 0 0 1 0,${H - e} Z`; }
      default: return `M${r},0 H${W - r} Q${W},0 ${W},${r} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} V${r} Q0,0 ${r},0 Z`;
    }
  });
  const mini = $derived(h < 40);
  const dashed = $derived(shape === 'dashed');
  const thin = $derived(shape === 'thin');
</script>

<svg class="shape" width={w} height={h} viewBox="0 0 {w} {h}" aria-hidden="true">
  <path d={path} fill="var(--s2)" stroke={color} stroke-width={thin ? 1 : 1.5} stroke-dasharray={dashed ? '6 4' : undefined} opacity={dim ? .5 : 1} />
  {#if shape === 'cylinder'}<path d="M0,9 A{w / 2},9 0 0 0 {w},9" fill="none" stroke={color} stroke-width="1.5" opacity={dim ? .5 : 1} />{/if}
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
