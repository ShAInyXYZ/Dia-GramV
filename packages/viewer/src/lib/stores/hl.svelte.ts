// Highlight + transient canvas UI state shared by nodes, edges, frames.
export type EdgeStyle = 'floating' | 'routed' | 'straight';
export const EDGE_STYLES: EdgeStyle[] = ['floating', 'routed', 'straight'];
export const hl = $state<{
  activeId: string | null; neighbors: Set<string> | null; color: string | null;
  colorBy: 'kind' | 'status'; edgeStyle: EdgeStyle;
  flash: string | null;       // node/edge id pulsed once after "go to problem"
  dropFrame: string | null;   // frame that would adopt the node being dragged
}>({ activeId: null, neighbors: null, color: null, colorBy: 'kind', edgeStyle: 'floating', flash: null, dropFrame: null });

export function flash(id: string) { hl.flash = id; setTimeout(() => { if (hl.flash === id) hl.flash = null; }, 900); }
