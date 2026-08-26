/**
 * Semantic lint: the reason DGV exists. Structure may be valid and the
 * architecture still wrong — a module calling a DB over HTTP, a bridge with
 * one side, an edge into a port the target never declared, an import cycle.
 *
 * Every rule returns diagnostics with a stable code so the agent can repair
 * the exact subject. Errors block "ok"; warnings/info are advice.
 */
import { NODE_KINDS, EDGE_KINDS, PROTOCOLS } from './catalog.js';
import { validateSchema } from './schema.js';
import { normalize, adjacency, indexes, estimateHeight, NODE_W } from './model.js';
import { error, warn, info } from './diagnostics.js';

export function lint(rawDoc, opts = {}) {
  const out = validateSchema(rawDoc);
  if (out.some((d) => d.code.startsWith('schema/'))) return out;   // fix shape first
  const doc = normalize(rawDoc);
  const ix = indexes(doc);
  const adj = adjacency(doc);

  // ---- references & ids ------------------------------------------------
  const dupes = (list, type) => {
    const seen = new Set();
    for (const it of list) {
      if (seen.has(it.id)) out.push(error('ref/duplicate-id', `duplicate ${type} id "${it.id}"`, { type, id: it.id }, ['rename one of them']));
      seen.add(it.id);
    }
  };
  dupes(doc.frames, 'frame'); dupes(doc.nodes, 'node'); dupes(doc.edges, 'edge');

  for (const f of doc.frames) {
    if (f.parent && !ix.frame.has(f.parent)) out.push(error('ref/missing-frame', `frame "${f.id}" has parent "${f.parent}" which does not exist`, { type: 'frame', id: f.id }, ['create that frame', 'remove parent']));
    // parent cycle
    let cur = f, seen = new Set();
    while (cur?.parent) { if (seen.has(cur.id)) { out.push(error('frame/cycle', `frame parent chain loops at "${f.id}"`, { type: 'frame', id: f.id }, ['break the parent loop'])); break; } seen.add(cur.id); cur = ix.frame.get(cur.parent); }
  }
  for (const n of doc.nodes) {
    if (n.frame && !ix.frame.has(n.frame)) out.push(error('ref/missing-frame', `node "${n.id}" belongs to frame "${n.frame}" which does not exist`, { type: 'node', id: n.id }, [`add frame "${n.frame}"`, 'remove node.frame']));
  }
  for (const e of doc.edges) {
    for (const end of ['source', 'target']) {
      if (!ix.node.has(e[end])) out.push(error('ref/missing-node', `edge "${e.id}" ${end} "${e[end]}" does not exist`, { type: 'edge', id: e.id, field: end }, [`add node "${e[end]}"`, 'remove the edge']));
    }
    if (e.source === e.target) out.push(warn('graph/self-loop', `edge "${e.id}" connects "${e.source}" to itself`, { type: 'edge', id: e.id }, ['remove it, or model the internal step as a module']));
  }
  if (out.some((d) => d.severity === 'error')) return out;   // rest assumes refs resolve

  // ---- ports & contracts ----------------------------------------------
  for (const e of doc.edges) {
    const s = ix.node.get(e.source), t = ix.node.get(e.target);
    const check = (node, portId, side) => {
      if (!portId) return;
      const port = (node.ports ?? []).find((p) => p.id === portId);
      if (!port) {
        out.push(error('port/undeclared', `edge "${e.id}" uses ${side} port "${portId}" but node "${node.id}" does not declare it`, { type: 'edge', id: e.id, field: side === 'target' ? 'targetPort' : 'sourcePort' },
          [`add port {id:"${portId}"} to node "${node.id}"`, `point the edge at one of: ${(node.ports ?? []).map((p) => p.id).join(', ') || '(none declared)'}`]));
        return;
      }
      const wantDir = side === 'target' ? 'in' : 'out';
      if (port.dir && port.dir !== 'both' && port.dir !== wantDir) {
        out.push(error('port/direction', `edge "${e.id}" enters "${node.id}.${portId}" as ${wantDir} but the port is declared ${port.dir}`, { type: 'edge', id: e.id }, [`set port dir to "${wantDir}" or "both"`, 'reverse the edge']));
      }
      if (port.protocol && e.protocol && port.protocol.toLowerCase() !== e.protocol.toLowerCase()) {
        out.push(error('port/protocol-mismatch', `edge "${e.id}" speaks ${e.protocol} but port "${node.id}.${portId}" is ${port.protocol}`, { type: 'edge', id: e.id, field: 'protocol' }, [`set edge protocol to "${port.protocol}"`, 'add a bridge node that translates between them']));
      }
    };
    check(s, e.sourcePort, 'source');
    check(t, e.targetPort, 'target');

    // a node that declares ports expects CALLS to name one; control/deploy/import
    // edges (systemd runs it, a package embeds it) are not calls into a port
    const isCall = !['control', 'deploy', 'import'].includes(e.kind);
    if (isCall && !e.targetPort && (t.ports ?? []).some((p) => p.dir !== 'out')) {
      out.push(warn('port/unbound', `edge "${e.id}" → "${t.id}" does not name a port, but "${t.id}" declares ${t.ports.length}`, { type: 'edge', id: e.id, field: 'targetPort' }, [`set targetPort to one of: ${t.ports.map((p) => p.id).join(', ')}`]));
    }

    // contract present?
    const cross = NODE_KINDS[s.kind].role !== NODE_KINDS[t.kind].role;
    if (cross && !e.protocol && !e.label && e.kind !== 'deploy' && e.kind !== 'import') {
      out.push(warn('contract/unspecified', `edge "${e.id}" ${s.id} → ${t.id} crosses ${s.kind}→${t.kind} with no protocol or label`, { type: 'edge', id: e.id, field: 'protocol' }, ['name the protocol (http, grpc, sql, ipc…)', 'or label what is exchanged']));
    }
    if (e.protocol && !PROTOCOLS.includes(e.protocol.toLowerCase())) {
      out.push(info('contract/unknown-protocol', `edge "${e.id}" names protocol "${e.protocol}" which is not in the catalog (allowed, just unchecked)`, { type: 'edge', id: e.id, field: 'protocol' }, []));
    }

    // role sanity
    const sRole = NODE_KINDS[s.kind].role, tRole = NODE_KINDS[t.kind].role;
    if (sRole === 'store' && (e.kind === 'sync' || e.kind === 'async')) {
      out.push(warn('kind/store-initiates', `"${s.id}" is a ${s.kind}; stores do not initiate ${e.kind} calls to "${t.id}"`, { type: 'edge', id: e.id }, ['reverse the edge and mark it kind:"data"', 'if it is a trigger/CDC stream, add a worker or queue between them']));
    }
    if (tRole === 'store' && e.kind === 'sync') {
      out.push(info('kind/store-access', `edge "${e.id}" into ${t.kind} "${t.id}" is kind:"sync"; data access reads better as kind:"data"`, { type: 'edge', id: e.id, field: 'kind' }, ['set kind to "data"']));
    }
    if (e.kind === 'import' && (s.kind !== 'module' && t.kind !== 'module')) {
      out.push(warn('kind/import-not-module', `edge "${e.id}" is an import but neither end is a module (${s.kind} → ${t.kind})`, { type: 'edge', id: e.id, field: 'kind' }, ['use sync/async/data for runtime hops', 'or model the imported thing as a module']));
    }
    if (e.kind === 'import' && s.frame !== t.frame && s.frame && t.frame) {
      const sf = ix.frame.get(s.frame), tf = ix.frame.get(t.frame);
      if (sf && tf && !sameRootFrame(ix, s.frame, t.frame)) {
        out.push(warn('kind/import-across-programs', `import "${e.id}" links modules in different top-level frames (${rootOf(ix, s.frame)} vs ${rootOf(ix, t.frame)}) — imports cannot cross process boundaries`, { type: 'edge', id: e.id }, ['make it a runtime edge with a protocol', 'move the module into a shared frame']));
      }
    }
    if (sRole === 'code' && tRole !== 'code' && e.kind !== 'import' && !e.protocol && s.frame === undefined) {
      out.push(info('kind/module-loose', `module "${s.id}" makes a runtime call but sits in no frame — which program runs it?`, { type: 'node', id: s.id }, ['put the module inside the program/service frame that hosts it']));
    }
  }

  // ---- graph shape -----------------------------------------------------
  for (const n of doc.nodes) {
    const a = adj.get(n.id);
    if (!a.in.length && !a.out.length) out.push(warn('graph/orphan', `node "${n.id}" (${n.label}) has no edges`, { type: 'node', id: n.id }, ['connect it', 'or remove it if it is not part of the system']));
    if (n.kind === 'bridge') {
      const peers = new Set([...a.in.map((e) => e.source), ...a.out.map((e) => e.target)]);
      if (peers.size < 2) out.push(warn('kind/bridge-one-sided', `bridge "${n.id}" touches only ${peers.size} other node(s); a bridge joins two sides`, { type: 'node', id: n.id }, ['connect both sides it translates between', 'or change its kind']));
    }
    if (n.kind === 'api' && !a.in.length) out.push(warn('kind/api-unused', `api "${n.id}" is exposed but nothing calls it`, { type: 'node', id: n.id }, ['add the caller (ui, device, external…)']));
    if (['db', 'cache', 'storage'].includes(n.kind)) {
      const writers = new Set(a.in.filter((e) => e.kind === 'data' || e.kind === 'sync').map((e) => e.source));
      if (writers.size > 2) out.push(info('graph/shared-store', `${n.kind} "${n.id}" is accessed directly by ${writers.size} nodes (${[...writers].join(', ')}); consider one owner service`, { type: 'node', id: n.id }, ['route access through one owning service or api']));
    }
    if (n.kind === 'external' && n.frame) {
      const root = rootOf(ix, n.frame);
      out.push(info('kind/external-inside', `external "${n.id}" sits inside frame "${root}" — externals usually live outside your boundary`, { type: 'node', id: n.id }, ['remove node.frame', 'or change kind if you actually own it']));
    }
    if (opts.requireStatus && !n.status) out.push(info('status/missing', `node "${n.id}" has no build status`, { type: 'node', id: n.id, field: 'status' }, ['set status: todo|wip|done|blocked']));
  }

  // import cycles (Tarjan-lite DFS on import edges)
  const importOut = new Map();
  for (const e of doc.edges) if (e.kind === 'import') { if (!importOut.has(e.source)) importOut.set(e.source, []); importOut.get(e.source).push(e.target); }
  const state = new Map(); const stack = [];
  const reported = new Set();
  const dfs = (v) => {
    state.set(v, 1); stack.push(v);
    for (const w of importOut.get(v) ?? []) {
      if (!state.has(w)) dfs(w);
      else if (state.get(w) === 1) {
        const cyc = stack.slice(stack.indexOf(w)).concat(w);
        const key = [...cyc].sort().join('|');
        if (!reported.has(key)) { reported.add(key); out.push(error('graph/import-cycle', `import cycle: ${cyc.join(' → ')}`, { type: 'node', id: w, cycle: cyc }, ['extract the shared part into a third module', 'invert one dependency'])); }
      }
    }
    stack.pop(); state.set(v, 2);
  };
  for (const id of importOut.keys()) if (!state.has(id)) dfs(id);

  // ---- frames ----------------------------------------------------------
  for (const f of doc.frames) {
    const members = doc.nodes.filter((n) => n.frame === f.id).length + doc.frames.filter((k) => k.parent === f.id).length;
    if (!members) out.push(warn('frame/empty', `frame "${f.id}" (${f.label}) has no members`, { type: 'frame', id: f.id }, ['put nodes in it (node.frame)', 'or remove it']));
  }

  // ---- layout ----------------------------------------------------------
  const boxes = doc.nodes.filter((n) => n.position).map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: NODE_W, h: opts.measured?.[n.id]?.h ?? estimateHeight(n) }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x < b.x + b.w - 8 && b.x < a.x + a.w - 8 && a.y < b.y + b.h - 8 && b.y < a.y + a.h - 8) {
      out.push(warn('layout/overlap', `nodes "${a.id}" and "${b.id}" overlap`, { type: 'node', id: a.id, other: b.id }, ['run layout', 'drag one aside']));
    }
  }
  for (const n of doc.nodes) {
    if (!n.position || !n.frame) continue;
    const f = ix.frame.get(n.frame);
    if (!f?.position || !f.size) continue;
    const inside = n.position.x >= f.position.x && n.position.y >= f.position.y &&
      n.position.x + NODE_W <= f.position.x + f.size.width && n.position.y + estimateHeight(n) <= f.position.y + f.size.height;
    if (!inside) out.push(warn('layout/outside-frame', `node "${n.id}" is drawn outside its frame "${f.id}"`, { type: 'node', id: n.id }, ['run layout', 'the viewer refits frames on drag']));
  }
  const unplaced = doc.nodes.filter((n) => !n.position).length;
  if (unplaced) out.push(info('layout/unplaced', `${unplaced} node(s) have no position yet`, { type: 'diagram' }, ['run layout (dgv_layout)']));

  return out;
}

function rootOf(ix, fid) {
  let cur = ix.frame.get(fid); const seen = new Set();
  while (cur?.parent && ix.frame.has(cur.parent) && !seen.has(cur.id)) { seen.add(cur.id); cur = ix.frame.get(cur.parent); }
  return cur?.id ?? fid;
}
function sameRootFrame(ix, a, b) { return rootOf(ix, a) === rootOf(ix, b); }
