/**
 * One diagnostic shape everywhere (validator, lint, layout, MCP, viewer).
 * Modelled on archify's repair receipts: a stable code, the exact subject,
 * and only fixes that are actually supported — so an agent can repair the
 * named thing instead of rewriting the diagram.
 */
export function diag(code, severity, message, subject = {}, fixes = []) {
  return { code, severity, message, subject, fixes };
}
export const error = (code, message, subject, fixes) => diag(code, 'error', message, subject, fixes);
export const warn  = (code, message, subject, fixes) => diag(code, 'warning', message, subject, fixes);
export const info  = (code, message, subject, fixes) => diag(code, 'info', message, subject, fixes);

export function summarizeDiagnostics(diagnostics) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const d of diagnostics) counts[d.severity] = (counts[d.severity] ?? 0) + 1;
  return { ok: counts.error === 0, ...counts, total: diagnostics.length };
}
