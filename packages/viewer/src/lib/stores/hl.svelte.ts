// Highlight + transient canvas UI state shared by nodes, edges, frames.
export type EdgeStyle = 'floating' | 'routed' | 'straight';
export const EDGE_STYLES: EdgeStyle[] = ['floating', 'routed', 'straight'];
export const hl = $state<{
  activeId: string | null; neighbors: Set<string> | null; color: string | null;
  colorBy: 'kind' | 'status'; edgeStyle: EdgeStyle;
  flash: string | null;       // node/edge id pulsed once after "go to problem"
  dropFrame: string | null;   // frame that would adopt the node being dragged
  kindFilter: string | null;  // legend spotlight: only this node kind stays lit
  edgeFilter: string | null;  // legend spotlight: only this edge kind stays lit
  // the flag bubble that is open: which element, and where on screen it was opened from
  flagOpen: { on: string; x: number; y: number } | null;
}>({ activeId: null, neighbors: null, color: null, colorBy: 'kind', edgeStyle: 'floating', flash: null, dropFrame: null, kindFilter: null, edgeFilter: null, flagOpen: null });

export function flash(id: string) { hl.flash = id; setTimeout(() => { if (hl.flash === id) hl.flash = null; }, 900); }
