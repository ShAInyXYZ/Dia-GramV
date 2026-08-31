/** Export a diagram as Markdown (for docs/CLAUDE.md) or Mermaid (for READMEs). */
import { normalize } from './model.js';
import { NODE_KINDS } from './catalog.js';

export function toMarkdown(rawDoc) {
  const d = normalize(rawDoc);
  const L = [`# ${d.meta.title}`, ''];
  if (d.meta.description) L.push(d.meta.description, '');
  L.push('## Components', '', '| id | kind | name | tech | ports | notes |', '|---|---|---|---|---|---|');
  for (const n of d.nodes) {
    const ports = (n.ports ?? []).map((p) => `\`${p.id}\`${p.protocol ? ` (${p.protocol})` : ''}`).join(', ');
    L.push(`| \`${n.id}\` | ${n.kind} | ${n.label}${n.sublabel ? ` — ${n.sublabel}` : ''} | ${n.tech ?? ''} | ${ports} | ${(n.note ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
  }
  L.push('', '## Connections', '', '| from | to | kind | protocol | what |', '|---|---|---|---|---|');
  for (const e of d.edges) {
    const what = [e.label, e.payload ? `payload: ${e.payload}` : null, e.targetPort ? `→ port ${e.targetPort}` : null].filter(Boolean).join(' · ');
    L.push(`| \`${e.source}\` | \`${e.target}\` | ${e.kind} | ${e.protocol ?? ''} | ${what} |`);
  }
  if (d.frames.length) {
    L.push('', '## Boundaries', '');
    for (const f of d.frames) {
      const members = d.nodes.filter((n) => n.frame === f.id).map((n) => `\`${n.id}\``).join(', ');
      L.push(`- **${f.label}**${f.parent ? ` (in ${f.parent})` : ''}: ${members || '—'}`);
    }
  }
  return L.join('\n') + '\n';
}

export function toMermaid(rawDoc) {
  const d = normalize(rawDoc);
  const safe = (id) => id.replace(/[^a-zA-Z0-9_]/g, '_');
  // Every label is quoted, because an unquoted one breaks on the first
  // parenthesis — and a quote inside it is written as the #quot; entity,
  // because mermaid has no backslash escape: `\"` is a parse error, not a
  // quote. One helper for nodes, frames and edges: they all failed the same
  // way, and a second copy of this rule is a third failure waiting.
  const q = (v) => `"${String(v ?? '').replace(/"/g, '#quot;')}"`;
  const shape = (n) => {
    const s = NODE_KINDS[n.kind]?.shape;
    const t = q(n.label);
    if (s === 'cylinder') return `[(${t})]`;
    if (s === 'pill') return `([${t}])`;
    if (s === 'hexagon') return `{{${t}}}`;
    if (s === 'skew') return `[/${t}/]`;
    if (s === 'diamond') return `{${t}}`;
    if (s === 'dashed') return `[${t}]`;
    return `[${t}]`;
  };
  const L = ['flowchart LR'];
  const emitNode = (n, ind) => L.push(`${ind}${safe(n.id)}${shape(n)}`);
  const walk = (fid, ind) => {
    for (const f of d.frames.filter((f) => (f.parent ?? null) === fid)) {
      L.push(`${ind}subgraph ${safe(f.id)}[${q(f.label)}]`);
      for (const n of d.nodes.filter((n) => n.frame === f.id)) emitNode(n, ind + '  ');
      walk(f.id, ind + '  ');
      L.push(`${ind}end`);
    }
  };
  walk(null, '  ');
  for (const n of d.nodes.filter((n) => !n.frame || !d.frames.some((f) => f.id === n.frame))) emitNode(n, '  ');
  for (const e of d.edges) {
    const arrow = e.kind === 'async' ? '-.->' : e.kind === 'import' ? '-->' : e.kind === 'data' ? '-->' : e.kind === 'deploy' ? '-.-' : '-->';
    const lbl = [e.label, e.protocol].filter(Boolean).join(' / ');
    L.push(`  ${safe(e.source)} ${arrow}${lbl ? `|${q(lbl)}|` : ''} ${safe(e.target)}`);
  }
  for (const n of d.nodes) {
    const c = NODE_KINDS[n.kind]?.color; if (c) L.push(`  style ${safe(n.id)} stroke:${c},stroke-width:2px`);
  }
  return L.join('\n') + '\n';
}
