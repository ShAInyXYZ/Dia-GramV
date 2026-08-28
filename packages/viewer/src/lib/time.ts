/** "just now", "4m ago", "3h ago", "2d ago", or the date once it is old. */
export function ago(iso?: string, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso); if (Number.isNaN(t)) return iso;
  const s = Math.max(0, (now - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return iso.slice(0, 10);
}
