/** Export a diagram as Markdown (for docs/CLAUDE.md), Mermaid (for READMEs), or Structurizr DSL (for teams documenting in C4). */
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

/**
 * Structurizr DSL — the C4 view of a DGV diagram, for teams whose
 * documentation standard is C4 and who use DGV as the working model.
 *
 * The mapping is lossy on purpose and one-way. C4 groups by containment
 * (a component is inside a container, a container inside a system); DGV
 * groups by boundary (these things share a process, a machine, a trust
 * zone) and types every node by role. So:
 *
 *   diagram   → softwareSystem
 *   frame     → group          a boundary holding several deployables is not a container
 *   node      → container      technology = tech, description = sublabel, tag = the kind
 *   module    → component      of the one container that imports it — or, when several
 *                              do, of a synthetic container named after its frame; a
 *                              component must live in a container
 *   external  → softwareSystem outside the system, tagged External
 *   edge      → relationship   description = label, technology = protocol, tag = kind
 *
 * Ports, status and flags have no C4 slot; they travel as properties so
 * nothing is silently dropped. The import edge from a container to its own
 * component is not emitted: containment already says it, and Structurizr
 * refuses a relationship between a parent and its child.
 */
export function toStructurizr(rawDoc) {
  const d = normalize(rawDoc);
  const str = (v) => `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' ')}"`;
  // an identifier the DSL accepts, and never one of its keywords
  const KW = new Set(['workspace', 'model', 'views', 'group', 'person', 'softwaresystem', 'container', 'component', 'element', 'relationship', 'styles', 'theme', 'themes', 'properties', 'tags', 'description', 'technology', 'url', 'include', 'exclude', 'autolayout', 'this', 'name', 'perspectives', 'deploymentenvironment', 'deploymentnode', 'infrastructurenode', 'branding', 'terminology', 'configuration', 'users', 'scope']);
  const ident = (id) => { const x = String(id).replace(/[^a-zA-Z0-9_]/g, '_'); return KW.has(x.toLowerCase()) ? x + '_' : x; };
  const frameById = new Map(d.frames.map((f) => [f.id, f]));
  const frameOf = (n) => (n.frame && frameById.has(n.frame) ? n.frame : null);
  const nodeById = new Map(d.nodes.map((n) => [n.id, n]));
  const isModule = (n) => n.kind === 'module';
  const isExternal = (n) => n.kind === 'external';

  // Who owns each module: the single non-module node that imports it, else a
  // synthetic container for its frame (or one for the frameless modules).
  const importers = new Map();
  for (const e of d.edges) {
    if (e.kind !== 'import') continue;
    const t = nodeById.get(e.target), s = nodeById.get(e.source);
    if (!t || !s || !isModule(t) || isModule(s) || isExternal(s)) continue;
    if (!importers.has(t.id)) importers.set(t.id, new Set());
    importers.get(t.id).add(s.id);
  }
  const synthetic = new Map();                 // frame id | '' → { id, label }
  const parentOf = new Map();                  // module id → container id (a node id or a synthetic id)
  for (const n of d.nodes.filter(isModule)) {
    const owners = [...(importers.get(n.id) ?? [])];
    if (owners.length === 1) { parentOf.set(n.id, owners[0]); continue; }
    const fid = frameOf(n) ?? '';
    if (!synthetic.has(fid)) synthetic.set(fid, { id: fid ? `${fid}_modules` : 'modules', label: fid ? `${frameById.get(fid).label} · modules` : 'Modules', frame: fid || null });
    parentOf.set(n.id, synthetic.get(fid).id);
  }
  const identOf = (id) => ident(id);

  const props = (pairs) => {
    const live = pairs.filter(([, v]) => v != null && v !== '');
    return live.length ? [`properties {`, ...live.map(([k, v]) => `  ${str(k)} ${str(v)}`), `}`] : [];
  };
  const portStr = (ports) => (ports ?? []).map((p) => `${p.id}${p.protocol ? ':' + p.protocol : ''}${p.dir ? '/' + p.dir : ''}`).join(', ');
  const flagStr = (flags) => (flags ?? []).map((f) => `${f.kind ?? 'issue'}: ${f.title}`).join('; ');

  const L = [];
  const push = (ind, ...lines) => { for (const l of lines) L.push('  '.repeat(ind) + l); };

  const emitComponent = (m, ind) => {
    push(ind, `${identOf(m.id)} = component ${str(m.label)} ${str(m.sublabel ?? m.note ?? '')} ${str(m.tech ?? '')} {`);
    push(ind + 1, `tags ${str(m.kind)}`);
    push(ind + 1, ...props([['dgv.id', m.id], ['dgv.status', m.status], ['dgv.path', Array.isArray(m.path) ? m.path.join(', ') : m.path], ['dgv.ports', portStr(m.ports)], ['dgv.flags', flagStr(m.flags)], ['dgv.note', m.sublabel ? m.note : undefined]]));
    push(ind, `}`);
  };
  const emitContainer = (c, ind) => {
    const kids = d.nodes.filter((n) => isModule(n) && parentOf.get(n.id) === c.id);
    push(ind, `${identOf(c.id)} = container ${str(c.label)} ${str(c.sublabel ?? c.note ?? '')} ${str(c.tech ?? '')} {`);
    push(ind + 1, `tags ${str(c.kind)}`);
    push(ind + 1, ...props([['dgv.id', c.id], ['dgv.status', c.status], ['dgv.path', Array.isArray(c.path) ? c.path.join(', ') : c.path], ['dgv.ports', portStr(c.ports)], ['dgv.flags', flagStr(c.flags)], ['dgv.note', c.sublabel ? c.note : undefined]]));
    for (const m of kids) emitComponent(m, ind + 1);
    push(ind, `}`);
  };
  const emitSynthetic = (syn, ind) => {
    const kids = d.nodes.filter((n) => isModule(n) && parentOf.get(n.id) === syn.id);
    push(ind, `${identOf(syn.id)} = container ${str(syn.label)} ${str('modules with no single owner')} "" {`);
    push(ind + 1, `tags "module"`);
    for (const m of kids) emitComponent(m, ind + 1);
    push(ind, `}`);
  };

  L.push('workspace ' + str(d.meta.title) + ' ' + str(d.meta.description ?? '') + ' {', '', '  model {');
  // externals live outside the system, as C4 draws them
  for (const n of d.nodes.filter(isExternal)) {
    push(2, `${identOf(n.id)} = softwareSystem ${str(n.label)} ${str(n.sublabel ?? n.note ?? '')} {`);
    push(3, `tags "External"`);
    push(3, ...props([['dgv.id', n.id], ['dgv.kind', n.kind], ['dgv.status', n.status], ['dgv.ports', portStr(n.ports)], ['dgv.flags', flagStr(n.flags)]]));
    push(2, `}`);
  }
  const containers = d.nodes.filter((n) => !isModule(n) && !isExternal(n));
  push(2, `sys = softwareSystem ${str(d.meta.title)} ${str(d.meta.description ?? '')} {`);
  for (const f of d.frames) {
    const own = containers.filter((n) => frameOf(n) === f.id);
    const syn = synthetic.get(f.id);
    if (!own.length && !syn) continue;
    push(3, `group ${str(f.label)} {`);
    for (const c of own) emitContainer(c, 4);
    if (syn) emitSynthetic(syn, 4);
    push(3, `}`);
  }
  for (const c of containers.filter((n) => !frameOf(n))) emitContainer(c, 3);
  if (synthetic.has('')) emitSynthetic(synthetic.get(''), 3);
  push(2, `}`, ``);

  // relationships — never between a parent and its own child
  const seen = new Set();
  for (const e of d.edges) {
    const s = nodeById.get(e.source), t = nodeById.get(e.target);
    if (!s || !t) continue;
    if (parentOf.get(t.id) === s.id || parentOf.get(s.id) === t.id) continue;
    const desc = e.label ?? '', tech = e.protocol ?? '';
    const key = `${s.id}|${t.id}|${desc}|${tech}`;
    if (seen.has(key)) continue; seen.add(key);
    const pr = props([['dgv.id', e.id], ['dgv.sourcePort', e.sourcePort], ['dgv.targetPort', e.targetPort], ['dgv.payload', e.payload], ['dgv.flags', flagStr(e.flags)]]);
    const head = `${identOf(s.id)} -> ${identOf(t.id)} ${str(desc)} ${str(tech)} ${str(e.kind)}`;
    if (pr.length) { push(2, `${head} {`); push(3, ...pr); push(2, `}`); } else push(2, head);
  }
  L.push('  }', '', '  views {');
  // one statement per line: the DSL does not accept a view body on one line
  const view = (head) => { push(2, `${head} {`); push(3, 'include *', 'autoLayout lr'); push(2, '}'); };
  view('systemContext sys "Context"');
  view('container sys "Containers"');
  const withKids = new Set([...parentOf.values()]);
  for (const cid of withKids) view(`component ${identOf(cid)} ${str('Components-' + ident(cid))}`);
  // The kind travels as a tag; give the tags the shapes C4 readers expect and
  // the catalog colour the DGV key uses, so a database is a cylinder in the
  // same yellow on both canvases. Only for kinds actually present: a short DSL
  // for a small diagram. One statement per line — the parser insists.
  // no Hexagon for bridges: Structurizr's PlantUML exporter draws it as bare text
  const SHAPE = { ui: 'WebBrowser', device: 'MobileDevicePortrait', db: 'Cylinder', cache: 'Cylinder', storage: 'Folder', queue: 'Pipe', bridge: 'RoundedBox', model: 'RoundedBox', external: 'RoundedBox', infra: 'Box', sidecar: 'RoundedBox' };
  const LINE = { async: 'dashed', data: 'dotted', import: 'dotted', deploy: 'dashed', control: 'dashed' };
  // dark ink on the light catalog colours, white on the dark ones
  const ink = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1d1d1d' : '#ffffff'; };
  const kinds = [...new Set(d.nodes.map((n) => n.kind))].filter((k) => NODE_KINDS[k]);
  const edgeKinds = [...new Set(d.edges.map((e) => e.kind))].filter((k) => LINE[k]);
  const block = (head, lines) => { push(3, `${head} {`); for (const l of lines) push(4, l); push(3, '}'); };
  if (kinds.length || edgeKinds.length) {
    push(2, 'styles {');
    for (const k of kinds) {
      const c = NODE_KINDS[k].color;
      block(`element ${str(k === 'external' ? 'External' : k)}`, [...(SHAPE[k] ? [`shape ${SHAPE[k]}`] : []), `background ${c}`, `color ${ink(c)}`, `stroke ${c}`]);
    }
    // Structurizr's default relationship is dashed; make the base solid so
    // the async/data styles below actually read as different.
    if (d.edges.length) block('relationship "Relationship"', ['style solid']);
    for (const k of edgeKinds) block(`relationship ${str(k)}`, [`style ${LINE[k]}`]);
    push(2, '}');
  }
  push(2, `theme default`);
  L.push('  }', '}');
  return L.join('\n') + '\n';
}
