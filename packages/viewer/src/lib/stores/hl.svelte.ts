// Highlight state shared by nodes + edges (click a node → its neighbourhood lights up, the rest dims).
export type EdgeStyle = 'floating' | 'routed' | 'straight';
export const EDGE_STYLES: EdgeStyle[] = ['floating', 'routed', 'straight'];
export const hl = $state<{ activeId: string | null; neighbors: Set<string> | null; color: string | null; colorBy: 'kind' | 'status'; edgeStyle: EdgeStyle }>({
  activeId: null, neighbors: null, color: null, colorBy: 'kind', edgeStyle: 'floating',
});
