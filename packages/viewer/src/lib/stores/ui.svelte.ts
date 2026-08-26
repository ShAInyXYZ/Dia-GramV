// Shell UI state: sidebar, quick-add popover, last pointer position.
export const ui = $state<{
  sideOpen: boolean; tab: 'inspect' | 'problems';
  quickAdd: { x: number; y: number } | null;   // screen coords
  mouse: { x: number; y: number };
  legendOpen: boolean;
}>({ sideOpen: false, tab: 'inspect', quickAdd: null, mouse: { x: 400, y: 300 }, legendOpen: true });

/** true when the keyboard focus is in a text field (shortcuts must stay out of the way) */
export function typing(e: Event) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
