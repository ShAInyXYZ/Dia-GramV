/**
 * The outline for each node kind, as one SVG path.
 *
 * Lives in core because two things draw it now: the canvas card and the SVG
 * snapshot. If they each kept their own copy the exported picture would drift
 * from the one on screen, which is the whole point of exporting it.
 *
 * Every constant is tuned for a 260px card; `k` scales them down for swatches,
 * or a 9px dome on a 16px-high cylinder reads as an hourglass.
 */
export function shapePath(shape, w, h) {
  const k = Math.min(1, Math.min(w / 120, h / 48));
  const r = 7 * k, W = w, H = h;
  switch (shape) {
    case 'pill': { const rr = Math.min(H / 2, 22); return `M${rr},0 H${W - rr} A${rr},${rr} 0 0 1 ${W - rr},${H} H${rr} A${rr},${rr} 0 0 1 ${rr},0 Z`; }
    case 'hexagon': { const c = Math.min(18 * k, H / 2); return `M${c},0 H${W - c} L${W},${H / 2} L${W - c},${H} H${c} L0,${H / 2} Z`; }
    case 'skew': { const s = 16 * k; return `M${s},0 H${W} L${W - s},${H} H0 Z`; }
    case 'diamond': { const c = 12 * k; return `M${c},0 H${W - c} L${W},${c} V${H - c} L${W - c},${H} H${c} L0,${H - c} V${c} Z`; }
    case 'chevron': { const c = 18 * k; return `M0,0 H${W - c} L${W},${H / 2} L${W - c},${H} H0 Z`; }
    case 'device': { const rr = 16 * k; return `M${rr},0 H${W - rr} Q${W},0 ${W},${rr} V${H - rr} Q${W},${H} ${W - rr},${H} H${rr} Q0,${H} 0,${H - rr} V${rr} Q0,0 ${rr},0 Z`; }
    case 'tab': { const t = 9 * k, tw = Math.min(90 * k, W * 0.4); return `M0,${r} Q0,0 ${r},0 H${tw} l${10 * k},${t} H${W - r} Q${W},${t} ${W},${t + r} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} Z`; }
    case 'folder': { const t = 8 * k, tw = Math.min(70 * k, W * 0.3); return `M0,${r + t} Q0,${t} ${r},${t} H${tw} l${t},-${t} H${W - r} Q${W},0 ${W},${r} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} Z`; }
    case 'cylinder': { const e = 9 * k; return `M0,${e} A${W / 2},${e} 0 0 1 ${W},${e} V${H - e} A${W / 2},${e} 0 0 1 0,${H - e} Z`; }
    default: return `M${r},0 H${W - r} Q${W},0 ${W},${r} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} V${r} Q0,0 ${r},0 Z`;
  }
}

/** The dome line drawn across the top of a cylinder, or null for other shapes. */
export function shapeDetail(shape, w, h) {
  const k = Math.min(1, Math.min(w / 120, h / 48));
  if (shape === 'cylinder') return `M0,${9 * k} A${w / 2},${9 * k} 0 0 0 ${w},${9 * k}`;
  return null;
}

export const DASHED_SHAPES = new Set(['dashed']);
export const THIN_SHAPES = new Set(['thin']);
