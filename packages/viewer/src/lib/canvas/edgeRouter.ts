// The router itself lives in @dgv/core (packages/core/src/router.js): the SVG
// snapshot has to route wires exactly the way the canvas does, and two copies
// of this geometry would drift the moment one was touched.
//
// This file is the typed face of it — core is plain JS, so the headings come
// back as `number` without the narrowing the canvas annotates against.
import { routeOrthogonal as route, toBeveledPath, DIR as RAW, PAD, STUB, BEVEL } from '@dgv/core';

export interface Rect { x: number; y: number; w: number; h: number }
export interface RoutePoint { x: number; y: number }
/** headings: E(+x) W(-x) S(+y) N(-y) */
export type Dir = 0 | 1 | 2 | 3;

export const DIR = RAW as { E: Dir; W: Dir; S: Dir; N: Dir };
export const routeOrthogonal = route as (s: RoutePoint, t: RoutePoint, obstacles: Rect[], exitDir?: Dir, arriveDir?: Dir) => RoutePoint[];
export { toBeveledPath, PAD, STUB, BEVEL };
