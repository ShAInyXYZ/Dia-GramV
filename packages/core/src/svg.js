/**
 * Render a diagram as a standalone SVG — for a README, a docs page, a PR.
 *
 * Self-contained on purpose: no external fonts, no images, no scripts, and it
 * paints its own background so it reads the same on a light or a dark page.
 * The box is cropped to the content, so it drops into a document without a
 * margin of empty canvas around it.
 *
 * It draws from the model rather than scraping the live DOM: the same input
 * gives the same file every time, which is what makes it reviewable in a diff.
 */
import { normalize, estimateHeight, NODE_W } from './model.js';
import { NODE_KINDS, STATUSES } from './catalog.js';
import { shapePath, shapeDetail } from './shapes.js';
import { routeOrthogonal, toBeveledPath, DIR, STUB, BEVEL } from './router.js';

const TONES = { neutral: '#8a8580', amber: '#e8873a', cyan: '#5ec8d8', violet: '#c98cff', green: '#4ec9a5', rose: '#e86a8f' };
const INK = { text: '#efece6', muted: '#a8a29a', dim: '#6f6a62', hair: '#2a2825', surface: '#161412', wire: '#6a655d' };
const SANS = "Manrope, 'Segoe UI', system-ui, -apple-system, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const DASH = { async: '7 5', data: '2 4', deploy: '12 6', control: '8 4 2 4', import: '' };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n2 = (v) => Math.round(v * 100) / 100;

/**
 * @param rawDoc  a DGV document; nodes may carry `master` (a folded frame)
 * @param opts    { padding, background, measured, labels }
 */
export function toSVG(rawDoc, opts = {}) {
  const { padding = 32, background = '#0e0d0b', measured = {}, labels = true } = opts;
  // The canvas draws wires in the style the document records; an export that
  // ignored it would not be a picture of what is on screen.
  const style = opts.edgeStyle ?? rawDoc?.meta?.edgeStyle ?? 'floating';
  const d = normalize(rawDoc);
  const frameById = new Map(d.frames.map((f) => [f.id, f]));

  const size = (n) => (n.master
    ? { w: n.size?.width ?? NODE_W, h: n.size?.height ?? 76 }
    : { w: measured[n.id]?.w ?? NODE_W, h: measured[n.id]?.h ?? estimateHeight(n) });
  const at = (x) => x.position ?? { x: 0, y: 0 };
  const boxes = new Map(d.nodes.map((n) => [n.id, { ...at(n), ...size(n) }]));

  // ---- crop to the content ---------------------------------------------
  const rects = [
    ...d.frames.map((f) => ({ x: at(f).x, y: at(f).y, w: f.size?.width ?? 360, h: f.size?.height ?? 200 })),
    ...[...boxes.values()],
  ];
  const minX = rects.length ? Math.min(...rects.map((r) => r.x)) : 0;
  const minY = rects.length ? Math.min(...rects.map((r) => r.y)) : 0;
  const maxX = rects.length ? Math.max(...rects.map((r) => r.x + r.w)) : 200;
  const maxY = rects.length ? Math.max(...rects.map((r) => r.y + r.h)) : 120;
  const W = Math.round(maxX - minX + padding * 2), H = Math.round(maxY - minY + padding * 2);
  const ox = padding - minX, oy = padding - minY;

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">`);
  out.push(`<title>${esc(d.meta.title ?? 'diagram')}</title>`);
  out.push(`<rect class="bg" fill="${background}" width="${W}" height="${H}"/>`);

  // ---- frames, deepest last so a child sits on its parent ---------------
  const depth = (f) => { let n = 0, p = f.parent, seen = new Set([f.id]); while (p && frameById.has(p) && !seen.has(p)) { seen.add(p); p = frameById.get(p).parent; n++; } return n; };
  for (const f of [...d.frames].sort((a, b) => depth(a) - depth(b))) {
    const p = at(f), w = f.size?.width ?? 360, h = f.size?.height ?? 200;
    const tone = TONES[f.tone] ?? TONES.neutral;
    out.push(`<g data-frame="${esc(f.id)}">`);
    out.push(`<rect x="${n2(p.x + ox)}" y="${n2(p.y + oy)}" width="${n2(w)}" height="${n2(h)}" rx="12" fill="${tone}" fill-opacity="0.03" stroke="${INK.hair}" stroke-width="1" stroke-dasharray="6 5"/>`);
    // the label sits astride the top edge, punched out of the boundary line
    const lx = p.x + ox + 14, ly = p.y + oy;
    out.push(`<rect x="${n2(lx - 4)}" y="${n2(ly - 9)}" width="${n2(label(f.label) * 6.6 + 12)}" height="17" fill="${background}"/>`);
    out.push(`<text x="${n2(lx + 2)}" y="${n2(ly + 3.5)}" font-family="${MONO}" font-size="11" font-weight="600" letter-spacing="1.1" fill="${tone}">${esc(String(f.label ?? '').toUpperCase())}</text>`);
    out.push('</g>');
  }

  // ---- wires, under the cards -------------------------------------------
  // routed wires steer around the cards, exactly as on the canvas
  const walls = style === 'routed' ? [...boxes.values()].map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })) : [];
  for (const e of d.edges) {
    const s0 = boxes.get(e.source), t0 = boxes.get(e.target);
    if (!s0 || !t0) continue;
    const kind = e.kind ?? 'sync';
    const stroke = kind === 'import' ? '#4a4640' : INK.wire;
    const width = kind === 'data' ? 2 : kind === 'import' ? 1 : 1.5;
    const dash = DASH[kind] ? ` stroke-dasharray="${DASH[kind]}"` : '';

    const w = wire(s0, t0, style, walls, ox, oy);
    out.push(`<g data-edge="${esc(e.id)}">`);
    out.push(`<path d="${w.d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"${dash}/>`);
    out.push(arrow(w.tip, w.ang, stroke));
    const text = [e.label, e.protocol].filter(Boolean).join(' · ');
    if (labels && text) {
      const tw = text.length * 5.4 + 10;
      out.push(`<rect x="${n2(w.mid.x - tw / 2)}" y="${n2(w.mid.y - 8)}" width="${n2(tw)}" height="15" rx="3" fill="${background}" fill-opacity="0.92"/>`);
      out.push(`<text x="${n2(w.mid.x)}" y="${n2(w.mid.y + 3)}" text-anchor="middle" font-family="${MONO}" font-size="9.5" fill="${INK.dim}">${esc(text)}</text>`);
    }
    out.push('</g>');
  }

  // ---- cards -------------------------------------------------------------
  for (const n of d.nodes) {
    const b = boxes.get(n.id);
    out.push(`<g data-node="${esc(n.id)}" transform="translate(${n2(b.x + ox)} ${n2(b.y + oy)})">`);
    out.push(n.master ? masterCard(n, b, background) : nodeCard(n, b));
    out.push('</g>');
  }

  out.push('</svg>');
  return out.join('\n');
}

const label = (s) => String(s ?? '').length;

/** One wire, in the style the canvas would draw it. */
function wire(s, t, style, walls, ox, oy) {
  const shift = (p) => ({ x: p.x + ox, y: p.y + oy });
  if (style === 'routed') {
    const p = sidePoint(s, t), q = sidePoint(t, s);
    const eo = STEP[p.dir], ao = STEP[q.dir === DIR.E ? DIR.W : q.dir === DIR.W ? DIR.E : q.dir === DIR.S ? DIR.N : DIR.S];
    const pts = routeOrthogonal({ x: p.x + eo.x, y: p.y + eo.y }, { x: q.x + ao.x, y: q.y + ao.y }, walls, p.dir, arriveOf(q.dir));
    const full = [{ x: p.x, y: p.y }, ...pts, { x: q.x, y: q.y }].map(shift);
    return { d: toBeveledPath(full, BEVEL), tip: full[full.length - 1], mid: midOf(full), ang: ARROW_ANGLE[q.dir] };
  }
  const a = shift(border(s, t)), b = shift(border(t, s));
  return { d: `M${n2(a.x)},${n2(a.y)} L${n2(b.x)},${n2(b.y)}`, tip: b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
}

const STEP = { [DIR.E]: { x: STUB, y: 0 }, [DIR.W]: { x: -STUB, y: 0 }, [DIR.S]: { x: 0, y: STUB }, [DIR.N]: { x: 0, y: -STUB } };
/** the heading a wire must be travelling in to ENTER a socket facing `d` */
const arriveOf = (d) => (d === DIR.E ? DIR.W : d === DIR.W ? DIR.E : d === DIR.S ? DIR.N : DIR.S);

/** Midpoint of the side facing the other box — the canvas's routed sockets. */
function sidePoint(from, to) {
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  const dx = to.x + to.w / 2 - cx, dy = to.y + to.h / 2 - cy;
  if (Math.abs(dx) / (from.w / 2) > Math.abs(dy) / (from.h / 2)) {
    return dx > 0 ? { x: cx + from.w / 2, y: cy, dir: DIR.E } : { x: cx - from.w / 2, y: cy, dir: DIR.W };
  }
  return dy > 0 ? { x: cx, y: cy + from.h / 2, dir: DIR.S } : { x: cx, y: cy - from.h / 2, dir: DIR.N };
}

/** Midpoint of a polyline by length — where a label sits on a routed wire. */
function midOf(pts) {
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(l); total += l; }
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    if (acc + seg[i] >= total / 2) { const f = (total / 2 - acc) / (seg[i] || 1); return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f }; }
    acc += seg[i];
  }
  return pts[Math.floor(pts.length / 2)];
}

/** Where the centre-to-centre line leaves a box — the canvas's floating wires. */
function border(from, to) {
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  const tx = to.x + to.w / 2, ty = to.y + to.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = from.w / 2, sy = from.h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / sx, Math.abs(dy) / sy);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** The head points INTO the card, along the side the wire lands on — the same
 *  triangle the canvas draws, placed the same way. */
const ARROW_ANGLE = { [DIR.W]: 0, [DIR.E]: 180, [DIR.N]: 90, [DIR.S]: -90 };
function arrow(tip, ang, color) {
  return `<polygon points="0,0 -9,-4 -9,4" fill="${color}" transform="translate(${n2(tip.x)} ${n2(tip.y)}) rotate(${n2(ang)})"/>`;
}

function nodeCard(n, b) {
  const k = NODE_KINDS[n.kind] ?? { shape: 'rect', color: TONES.neutral, label: n.kind };
  const color = k.color ?? TONES.neutral;
  const g = [];
  g.push(`<path d="${shapePath(k.shape, b.w, b.h)}" fill="${INK.surface}" stroke="${color}" stroke-width="${k.shape === 'thin' ? 1 : 1.5}"${k.shape === 'dashed' ? ' stroke-dasharray="6 4"' : ''}/>`);
  const detail = shapeDetail(k.shape, b.w, b.h);
  if (detail) g.push(`<path d="${detail}" fill="none" stroke="${color}" stroke-width="1.5"/>`);

  const padTop = k.shape === 'cylinder' || k.shape === 'folder' ? 24 : k.shape === 'window' ? 32 : 16;
  let y = padTop + 9;
  g.push(`<text x="12" y="${y}" font-family="${MONO}" font-size="9.5" letter-spacing="1.15" fill="${color}">${esc(String(k.label ?? n.kind).toUpperCase())}</text>`);
  if (n.tech) g.push(`<text x="${12 + String(k.label ?? n.kind).length * 6.6 + 10}" y="${y}" font-family="${MONO}" font-size="9.5" fill="${INK.dim}">${esc(n.tech)}</text>`);
  if (n.status && STATUSES[n.status]) {
    const sc = STATUSES[n.status].color;
    g.push(`<text x="${b.w - 12}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="9" letter-spacing="0.8" fill="${sc}">${esc(String(n.status).toUpperCase())}</text>`);
  }
  y += 16;
  g.push(`<text x="12" y="${y}" font-size="13.5" font-weight="650" fill="${INK.text}">${esc(n.label)}</text>`);
  if (n.sublabel) { y += 15; g.push(`<text x="12" y="${y}" font-size="11.5" fill="${INK.muted}">${esc(n.sublabel)}</text>`); }
  for (const p of n.ports ?? []) {
    y += 15;
    if (y > b.h - 6) break;
    const t = `${p.dir === 'out' ? '↗' : '↘'} ${p.id}${p.protocol ? ':' + p.protocol : ''}`;
    g.push(`<text x="12" y="${y}" font-family="${MONO}" font-size="9.5" fill="${INK.muted}">${esc(t)}</text>`);
  }
  return g.join('\n');
}

function masterCard(n, b, background) {
  const m = n.master;
  const tone = TONES[m.tone] ?? TONES.neutral;
  const g = [];
  // two plates behind the card: the group has thickness, same as on canvas
  g.push(`<rect x="8" y="8" width="${n2(b.w)}" height="${n2(b.h)}" rx="7" fill="${background}" stroke="${INK.hair}" opacity="0.55"/>`);
  g.push(`<rect x="4" y="4" width="${n2(b.w)}" height="${n2(b.h)}" rx="7" fill="${background}" stroke="${INK.hair}"/>`);
  g.push(`<rect width="${n2(b.w)}" height="${n2(b.h)}" rx="7" fill="${INK.surface}" stroke="${tone}"/>`);
  g.push(`<text x="12" y="22" font-family="${MONO}" font-size="9.5" letter-spacing="1.15" fill="${tone}">GROUP</text>`);
  const inside = [
    m.nodes ? `${m.nodes} node${m.nodes > 1 ? 's' : ''}` : '',
    m.frames ? `${m.frames} frame${m.frames > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ') || 'empty';
  g.push(`<text x="58" y="22" font-family="${MONO}" font-size="9.5" fill="${INK.dim}">${esc(inside)}</text>`);
  g.push(`<text x="12" y="41" font-size="13.5" font-weight="650" fill="${INK.text}">${esc(n.label)}</text>`);
  // the kinds inside, drawn as the shapes themselves — the canvas shows glyphs
  // here, and a row of words in their place is a different card
  let cx = 12;
  for (const k of (m.kinds ?? []).slice(0, 5)) {
    const kd = NODE_KINDS[k.kind] ?? { shape: 'rect', color: TONES.neutral };
    g.push(`<g transform="translate(${n2(cx)} 50)"><path d="${shapePath(kd.shape, 18, 11)}" fill="${INK.surface}" stroke="${kd.color}" stroke-width="1"/></g>`);
    cx += 22;
    if (k.n > 1) { g.push(`<text x="${n2(cx)}" y="59" font-family="${MONO}" font-size="9" fill="${INK.dim}">${k.n}</text>`); cx += 9; }
    cx += 4;
  }
  return g.join('\n');
}
