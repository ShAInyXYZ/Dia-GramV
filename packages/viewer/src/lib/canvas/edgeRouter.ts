// Ported from OtiaFlow (src/lib/flow/edgeRouter.ts) — same author, unchanged geometry.
// ── Orthogonal edge router — direction-aware A* around node obstacles ────────
// Produces an orthogonal (right-angle) path from a source point to a target
// point that AVOIDS node rectangles, so wires don't slice behind nodes. Pure
// geometry, no Svelte/xyflow imports.
//
// Approach: an "interesting-lines" lattice (padded obstacle edges + endpoint
// lines + a few helper lines — not a pixel grid, so it stays fast) searched with
// a DIRECTION-AWARE A*: the state is (x, y, heading). Turns carry a real cost so
// paths prefer long straight runs, and 180° reversals are forbidden outright —
// that's what eliminates the "curl" hooks at sockets. The exit heading at the
// source and the required arrival heading at the target come from the actual
// handle sides (right-side output exits EAST, left-side input is entered moving
// EAST, a bottom control socket exits SOUTH…), so the wire leaves and lands
// perpendicular to the socket like a real routed wire should.

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
export interface RoutePoint {
	x: number;
	y: number;
}

/** headings: E(+x) W(−x) S(+y) N(−y) */
export type Dir = 0 | 1 | 2 | 3;
export const DIR = { E: 0 as Dir, W: 1 as Dir, S: 2 as Dir, N: 3 as Dir };
const OPP: readonly Dir[] = [1, 0, 3, 2] as const;

/** clearance kept between a routed wire and the nodes it passes (slightly
 *  roomier than the old 14 — more breathing space along node edges) */
export const PAD = 20;
/** straight run off each socket before the first turn — MUST exceed PAD so the
 *  routing endpoints sit outside every node's padded box (incl. their own) */
export const STUB = PAD + 4;
/** corner bevel = the base card bevel (14) + the clearance padding, so a wire
 *  sweeping around a node curves with the spacing, not inside it */
export const BEVEL = 14 + PAD;
const TURN_COST = 32; // px-equivalent penalty per corner → prefer straight runs
const MAX_OBSTACLE_LINES = 48; // cap per axis (perf guard on huge graphs)

/** does the axis-aligned segment a→b pass through rect r's PADDED interior?
 *  Running exactly ALONG the padded border is allowed (that's how paths hug). */
function segmentHitsRect(a: RoutePoint, b: RoutePoint, r: Rect): boolean {
	const rx0 = r.x - PAD, ry0 = r.y - PAD, rx1 = r.x + r.w + PAD, ry1 = r.y + r.h + PAD;
	if (a.y === b.y) {
		const y = a.y;
		if (y <= ry0 || y >= ry1) return false;
		const xmin = Math.min(a.x, b.x), xmax = Math.max(a.x, b.x);
		return xmax > rx0 && xmin < rx1;
	} else {
		const x = a.x;
		if (x <= rx0 || x >= rx1) return false;
		const ymin = Math.min(a.y, b.y), ymax = Math.max(a.y, b.y);
		return ymax > ry0 && ymin < ry1;
	}
}

function blocked(a: RoutePoint, b: RoutePoint, obstacles: Rect[]): boolean {
	for (const r of obstacles) if (segmentHitsRect(a, b, r)) return true;
	return false;
}

function isInsideAny(p: RoutePoint, obstacles: Rect[]): boolean {
	for (const r of obstacles)
		if (p.x > r.x - PAD && p.x < r.x + r.w + PAD && p.y > r.y - PAD && p.y < r.y + r.h + PAD)
			return true;
	return false;
}

/** sorted unique axis: obstacle lines (thinned if too many) + must-keep lines
 *  (endpoints etc. — never thinned, so start/goal always resolve exactly). */
function buildAxis(obstacleVals: number[], keepVals: number[]): number[] {
	let s = [...new Set(obstacleVals.map((v) => Math.round(v)))].sort((a, b) => a - b);
	if (s.length > MAX_OBSTACLE_LINES) {
		const step = Math.ceil(s.length / MAX_OBSTACLE_LINES);
		s = s.filter((_, i) => i % step === 0 || i === s.length - 1);
	}
	return [...new Set([...s, ...keepVals.map((v) => Math.round(v))])].sort((a, b) => a - b);
}

/** drop near-duplicate consecutive points, then merge collinear runs. */
function simplify(pts: RoutePoint[]): RoutePoint[] {
	if (pts.length < 2) return pts;
	const dedup: RoutePoint[] = [pts[0]];
	for (let i = 1; i < pts.length; i++) {
		const a = dedup[dedup.length - 1], b = pts[i];
		if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) continue;
		dedup.push(b);
	}
	if (dedup.length < 3) return dedup;
	const out: RoutePoint[] = [dedup[0]];
	for (let i = 1; i < dedup.length - 1; i++) {
		const a = out[out.length - 1], b = dedup[i], c = dedup[i + 1];
		const collinear =
			(Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) ||
			(Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
		if (!collinear) out.push(b);
	}
	out.push(dedup[dedup.length - 1]);
	return out;
}

/**
 * Route an orthogonal path from `source` to `target` around `obstacles`.
 * `exitDir` = heading the wire LEAVES the source socket with; `arriveDir` =
 * heading it must be moving when it ENTERS the target socket. Never returns
 * fewer than 2 points; falls back to a simple mid-split L when no clear route
 * exists (endpoint boxed in by overlapping obstacles).
 */
export function routeOrthogonal(
	source: RoutePoint,
	target: RoutePoint,
	obstacles: Rect[],
	exitDir: Dir = DIR.E,
	arriveDir: Dir = DIR.E
): RoutePoint[] {
	const keepX = [
		source.x, target.x,
		source.x + STUB, source.x - STUB,
		target.x + STUB, target.x - STUB,
		(source.x + target.x) / 2
	];
	const keepY = [
		source.y, target.y,
		source.y + STUB, source.y - STUB,
		target.y + STUB, target.y - STUB,
		(source.y + target.y) / 2
	];
	const ox: number[] = [], oy: number[] = [];
	for (const r of obstacles) {
		ox.push(r.x - PAD, r.x + r.w + PAD);
		oy.push(r.y - PAD, r.y + r.h + PAD);
	}
	const X = buildAxis(ox, keepX);
	const Y = buildAxis(oy, keepY);
	const W = X.length;
	const nearest = (arr: number[], v: number) => {
		let b = 0;
		for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[b] - v)) b = i;
		return b;
	};
	const sx = nearest(X, source.x), sy = nearest(Y, source.y);
	const gx = nearest(X, target.x), gy = nearest(Y, target.y);

	// state = (cell, heading) — heading of the move that ENTERED the cell
	const skey = (ix: number, iy: number, d: Dir) => (((iy * W + ix) << 2) | d) >>> 0;
	const h = (ix: number, iy: number) => Math.abs(X[ix] - X[gx]) + Math.abs(Y[iy] - Y[gy]);

	const g = new Map<number, number>();
	const came = new Map<number, number>();
	const startK = skey(sx, sy, exitDir);
	g.set(startK, 0);
	const open: Array<{ k: number; ix: number; iy: number; d: Dir; f: number }> = [
		{ k: startK, ix: sx, iy: sy, d: exitDir, f: h(sx, sy) }
	];
	const closed = new Set<number>();
	let goalK = -1;
	let anyGoalK = -1; // goal reached with the WRONG heading — last-resort accept
	let guard = 0;

	while (open.length && guard++ < 30000) {
		// pop-min (open stays small — linear scan beats re-sorting every pop)
		let bi = 0;
		for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
		const cur = open.splice(bi, 1)[0];
		if (closed.has(cur.k)) continue;
		closed.add(cur.k);
		if (cur.ix === gx && cur.iy === gy) {
			if (cur.d === arriveDir) {
				goalK = cur.k;
				break;
			}
			if (anyGoalK === -1) anyGoalK = cur.k;
			continue; // don't route THROUGH the socket cell
		}
		const moves: Array<[number, number, Dir]> = [
			[cur.ix + 1, cur.iy, DIR.E],
			[cur.ix - 1, cur.iy, DIR.W],
			[cur.ix, cur.iy + 1, DIR.S],
			[cur.ix, cur.iy - 1, DIR.N]
		];
		for (const [nix, niy, nd] of moves) {
			if (nix < 0 || niy < 0 || nix >= W || niy >= Y.length) continue;
			if (nd === OPP[cur.d]) continue; // NO 180° reversals — kills socket curls
			const nk = skey(nix, niy, nd);
			if (closed.has(nk)) continue;
			const a = { x: X[cur.ix], y: Y[cur.iy] };
			const b = { x: X[nix], y: Y[niy] };
			// the socket cells themselves may sit within another node's padding
			const isEndpointCell = (nix === gx && niy === gy) || (nix === sx && niy === sy);
			if (!isEndpointCell && isInsideAny(b, obstacles)) continue;
			if (blocked(a, b, obstacles)) continue;
			const step = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
			const ng = g.get(cur.k)! + step + (nd !== cur.d ? TURN_COST : 0);
			if (ng < (g.get(nk) ?? Infinity)) {
				g.set(nk, ng);
				came.set(nk, cur.k);
				open.push({ k: nk, ix: nix, iy: niy, d: nd, f: ng + h(nix, niy) });
			}
		}
	}

	const endK = goalK !== -1 ? goalK : anyGoalK;
	if (endK === -1) {
		// boxed in — simple mid-split L, never null
		const midX = (source.x + target.x) / 2;
		return simplify([source, { x: midX, y: source.y }, { x: midX, y: target.y }, target]);
	}
	const pts: RoutePoint[] = [];
	let k: number | undefined = endK;
	while (k !== undefined) {
		const cell = k >> 2;
		pts.push({ x: X[cell % W], y: Y[Math.floor(cell / W)] });
		k = came.get(k);
	}
	pts.reverse();
	// NOTE: endpoints stay on the (integer) lattice — within 0.5px of the real
	// socket, invisible at wire stroke width. Substituting the exact fractional
	// coords here made whole runs sub-pixel DIAGONAL, which silently disabled
	// the corner bevels downstream (Math.sign on a 0.3px drift ≠ 0).
	const clean = simplify(pts);
	return clean.length < 2 ? [source, target] : clean;
}

/** SVG path with BEVELED corners (quadratic arcs) matching the node/button
 *  radius. Guards: straight-through, reversal, or diagonal joints render as
 *  plain lines — a bevel is only drawn on a genuine 90° corner. */
export function toBeveledPath(pts: RoutePoint[], radius = 14): string {
	if (pts.length < 2) return '';
	// epsilon-tolerant direction sign: the composed path mixes exact fractional
	// socket points with integer lattice points, so a nominally-horizontal
	// segment can carry ~0.5px of drift — a raw Math.sign would call it diagonal
	// and skip the bevel. Anything under 1.5px reads as zero.
	const sgn = (v: number) => (Math.abs(v) < 1.5 ? 0 : Math.sign(v));
	let d = `M ${pts[0].x},${pts[0].y}`;
	for (let i = 1; i < pts.length - 1; i++) {
		const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
		const inDx = sgn(cur.x - prev.x), inDy = sgn(cur.y - prev.y);
		const outDx = sgn(next.x - cur.x), outDy = sgn(next.y - cur.y);
		const diagonal = (inDx !== 0 && inDy !== 0) || (outDx !== 0 && outDy !== 0);
		const reversal = inDx === -outDx && inDy === -outDy;
		const straight = inDx === outDx && inDy === outDy;
		if (diagonal || reversal || straight) {
			d += ` L ${cur.x},${cur.y}`;
			continue;
		}
		const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
		const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
		const r = Math.max(0, Math.min(radius, inLen / 2, outLen / 2));
		d += ` L ${cur.x - inDx * r},${cur.y - inDy * r} Q ${cur.x},${cur.y} ${cur.x + outDx * r},${cur.y + outDy * r}`;
	}
	const last = pts[pts.length - 1];
	d += ` L ${last.x},${last.y}`;
	return d;
}
