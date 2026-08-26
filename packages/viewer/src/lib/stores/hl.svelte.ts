// Highlight state shared by nodes + edges (click a node → its neighbourhood lights up, the rest dims).
export const hl = $state<{ activeId: string | null; neighbors: Set<string> | null; color: string | null; colorBy: 'kind' | 'status' }>({
  activeId: null, neighbors: null, color: null, colorBy: 'kind',
});
