// Generates ../banner.svg. Run: node assets/banner.mjs
// The cards are the real catalog shapes (core/shapes.js) in the catalog's own colours;
// the red wire is a real diagnostic (kind/store-initiates). Fonts are embedded as
// subsets so GitHub renders them — an <img> SVG cannot fetch web fonts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODE_KINDS } from '@dgv/core';
import { shapePath, shapeDetail } from '../packages/core/src/shapes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const b64 = (f) => fs.readFileSync(path.join(here, 'fonts', f)).toString('base64');

const W = 1280, H = 300;
const BG = '#0e0d0b', S2 = '#1e1c19', TEXT = '#e6e3de', MUTED = '#a49e95', DIM = '#7d766c', HAIR = '#3a3733';
const ACCENT = '#22a06b';          // deep green — the one accent in the whole banner
const RED = '#f93c31';
const MONO = "'JB', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const SANS = "'Manrope', Inter, ui-sans-serif, -apple-system, 'Segoe UI', sans-serif";

// ---- geometry: one row of three cards, centred in the band between the corner captions
const CW = 150, CH = 64, GAP = 56, ROW_Y = 84;
const cards = [
  { kind: 'ui', label: 'Panel' },
  { kind: 'api', label: 'HTTP API' },
  { kind: 'db', label: 'Postgres' },
];
const DIAG_W = CW * 3 + GAP * 2;                      // 558
const TITLE_W = 500, COL_GAP = 84;
const LEFT = Math.round((W - (DIAG_W + COL_GAP + TITLE_W)) / 2);   // equal margins either side of the whole composition
const TX = LEFT + DIAG_W + COL_GAP;                   // title column x

function card(i) {
  const c = cards[i], k = NODE_KINDS[c.kind];
  const x = LEFT + i * (CW + GAP), y = ROW_Y;
  const detail = shapeDetail?.(k.shape, CW, CH) ?? '';
  const padTop = k.shape === 'window' ? 33 : k.shape === 'cylinder' ? 25 : 19;
  return `
  <g transform="translate(${x},${y})">
    <path d="${shapePath(k.shape, CW, CH)}" fill="${S2}" stroke="${k.color}" stroke-width="1.5"/>
    ${k.shape === 'window' ? `<line x1="0" y1="18" x2="${CW}" y2="18" stroke="${k.color}" stroke-width="1" opacity=".55"/><circle cx="11" cy="9" r="2.4" fill="${k.color}" opacity=".8"/><circle cx="20" cy="9" r="2.4" fill="${k.color}" opacity=".5"/>` : detail ? `<g fill="none" stroke="${k.color}" stroke-width="1.5">${detail}</g>` : ''}
    <text x="16" y="${padTop}" font-family="${MONO}" font-size="10" letter-spacing="1.4" fill="${k.color}">${k.label.toUpperCase()}</text>
    <text x="16" y="${padTop + 19}" font-family="${SANS}" font-weight="700" font-size="15" fill="${TEXT}">${c.label}</text>
  </g>`;
}
const mid = ROW_Y + CH / 2;
const wire = (i, label) => {
  const x1 = LEFT + i * (CW + GAP) + CW, x2 = x1 + GAP;
  return `
  <line x1="${x1 + 2}" y1="${mid}" x2="${x2 - 10}" y2="${mid}" stroke="${HAIR}" stroke-width="1.5"/>
  <polygon points="${x2 - 2},${mid} ${x2 - 11},${mid - 4} ${x2 - 11},${mid + 4}" fill="${HAIR}"/>
  <text x="${(x1 + x2) / 2}" y="${mid - 9}" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${DIM}">${label}</text>`;
};
// the caught wire: the database calling back into the API — routed below the row, orthogonal, red
const apiX = LEFT + (CW + GAP), dbX = LEFT + 2 * (CW + GAP);
const ax = apiX + CW / 2, dx = dbX + CW / 2, by = ROW_Y + CH + 40;
const caught = `
  <path d="M${dx},${ROW_Y + CH + 1} V${by - 10} Q${dx},${by} ${dx - 10},${by} H${ax + 10} Q${ax},${by} ${ax},${by - 10} V${ROW_Y + CH + 12}" fill="none" stroke="${RED}" stroke-width="1.8" stroke-linejoin="round"/>
  <polygon points="${ax},${ROW_Y + CH + 2} ${ax - 4.5},${ROW_Y + CH + 12} ${ax + 4.5},${ROW_Y + CH + 12}" fill="${RED}"/>
  <circle cx="${(ax + dx) / 2}" cy="${by}" r="10" fill="${BG}" stroke="${RED}" stroke-width="1.6"/>
  <text x="${(ax + dx) / 2}" y="${by + 4.5}" text-anchor="middle" font-family="${MONO}" font-weight="500" font-size="13" fill="${RED}">!</text>
  <text x="${(ax + dx) / 2}" y="${by + 30}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${RED}">kind/store-initiates</text>`;

// ---- mark + wordmark, vertically centred on the same band as the diagram
const CY = 154;                                        // band centre
const mark = (x, y, s) => `
  <g transform="translate(${x},${y})">
    <path d="M${s / 2},0 L${s},${s / 2} L${s / 2},${s} L0,${s / 2} Z" fill="none" stroke="${ACCENT}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M${s / 2},${s * .28} L${s * .72},${s / 2} L${s / 2},${s * .72} L${s * .28},${s / 2} Z" fill="${ACCENT}"/>
  </g>`;
const MS = 46;
const title = `
  ${mark(TX, CY - 26 - 26 - MS / 2, MS)}   /* centred on the cap height of the wordmark (baseline CY-26, cap ≈ 52) */
  <text x="${TX + MS + 18}" y="${CY - 26}" font-family="${SANS}" font-weight="800" font-size="72" letter-spacing="-2" fill="${TEXT}">Dia<tspan fill="${ACCENT}">-</tspan>GramV</text>
  <text x="${TX}" y="${CY + 22}" font-family="${SANS}" font-weight="500" font-size="21" fill="${MUTED}">Plan the architecture before you write the code.</text>
  <text x="${TX}" y="${CY + 52}" font-family="${MONO}" font-size="13" letter-spacing=".6" fill="${DIM}">typed nodes · ports on edges · lint that tells you the fix</text>`;

const corners = `
  <text x="34" y="46" font-family="${MONO}" font-size="13" letter-spacing="1.2" fill="${DIM}">MCP · Svelte Flow · dagre</text>
  <text x="${W - 34}" y="46" text-anchor="end" font-family="${MONO}" font-weight="500" font-size="13" letter-spacing="1.4" fill="${ACCENT}">dgv/&lt;name&gt;.dgv.json</text>
  <text x="34" y="274" font-family="${MONO}" font-size="13" letter-spacing="1.2" fill="${DIM}">MIT · Node 20.19+ · local only</text>
  <text x="${W - 34}" y="274" text-anchor="end" font-family="${MONO}" font-size="13" letter-spacing="1.2" fill="${DIM}">No accounts · No cloud · No telemetry</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- generated by assets/banner.mjs — do not edit by hand -->
  <style>
    @font-face { font-family: 'Manrope'; src: url(data:font/woff2;base64,${b64('manrope-sub.woff2')}) format('woff2'); font-weight: 200 800; }
    @font-face { font-family: 'JB'; src: url(data:font/woff2;base64,${b64('jbmono-sub.woff2')}) format('woff2'); font-weight: 400; }
    @font-face { font-family: 'JB'; src: url(data:font/woff2;base64,${b64('jbmono-med-sub.woff2')}) format('woff2'); font-weight: 500; }
  </style>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${corners}
  ${cards.map((_, i) => card(i)).join('')}
  ${wire(0, 'http')}${wire(1, 'sql')}
  ${caught}
  ${title}
</svg>
`;
fs.writeFileSync(path.join(here, '..', 'banner.svg'), svg);
console.log(`banner.svg ${(svg.length / 1024).toFixed(0)} kB`);
