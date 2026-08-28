/**
 * Structural validation of a .dgv.json document. Hand-written on purpose:
 * one schema, and every failure names the exact path + a fix, which a
 * generated validator's messages never do well.
 *
 * The document shape (all positions are ABSOLUTE canvas coords):
 *
 * {
 *   dgv: 1,
 *   meta:   { title, description?, updated?, colorBy?: 'kind'|'status' },
 *   frames: [{ id, label, parent?, tone?, position:{x,y}, size:{width,height}, note?, ack? }],
 *   nodes:  [{ id, kind, label, sublabel?, note?, frame?, position:{x,y}, tech?, status?, path?: string | string[],
 *              tags?: string[], ports?: [{ id, protocol?, dir?: 'in'|'out'|'both', shape? }], ack? }],
 *   edges:  [{ id, source, target, kind?, protocol?, label?, sourcePort?, targetPort?, payload?, note?, ack? }]
 *
 *   `ack` = "I know, it is intentional": a one-line reason that turns this element's
 *   lint WARNINGS into info. Errors are never acknowledged away.
 *
 *   Any element may also carry `flags`: judgements lint cannot make, raised by
 *   the agent (dgv_flag) or a person (viewer) — "this is a dead end for
 *   settings", "these two load the same plugins twice". Each is
 *   { id, kind?: 'issue'|'idea'|'question', title, note?, fix?, by?, at? }.
 *   Resolving a flag removes it; the history keeps the record.
 *
 *   `history` (top level) is written by the store on every save — see history.js.
 * }
 */
import { NODE_KINDS, EDGE_KINDS, STATUSES, FRAME_TONES } from './catalog.js';
import { error } from './diagnostics.js';

const ID_RE = /^[a-zA-Z][a-zA-Z0-9_.:-]*$/;
export const FLAG_KINDS = ['issue', 'idea', 'question'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function validateSchema(doc) {
  const out = [];
  const bad = (path, msg, fix) => out.push(error('schema/invalid', `${path}: ${msg}`, { path }, fix ? [fix] : []));

  if (!isObj(doc)) { bad('/', 'document must be an object'); return out; }
  if (doc.dgv !== 1) bad('/dgv', 'must be the number 1', 'set "dgv": 1');
  if (!isObj(doc.meta)) bad('/meta', 'must be an object', 'add meta: { title }');
  else {
    if (!isStr(doc.meta.title) || !doc.meta.title.trim()) bad('/meta/title', 'must be a non-empty string', 'give the diagram a title');
    if (doc.meta.colorBy != null && !['kind', 'status'].includes(doc.meta.colorBy)) bad('/meta/colorBy', 'must be "kind" or "status"');
    if (doc.meta.driftIgnore != null && !(Array.isArray(doc.meta.driftIgnore) && doc.meta.driftIgnore.every(isStr))) bad('/meta/driftIgnore', 'driftIgnore must be a list of path globs');
    if (doc.meta.edgeStyle != null && !['floating', 'routed', 'straight'].includes(doc.meta.edgeStyle)) bad('/meta/edgeStyle', 'must be floating | routed | straight');
  }
  for (const key of ['frames', 'nodes', 'edges']) {
    if (doc[key] != null && !Array.isArray(doc[key])) bad(`/${key}`, 'must be an array');
  }

  const flags = (who, list) => {
    if (list == null) return;
    if (!Array.isArray(list)) return bad(`${who}/flags`, 'flags must be an array');
    list.forEach((f, j) => {
      if (!isObj(f) || !isStr(f.id) || !f.id) return bad(`${who}/flags/${j}`, 'a flag needs an id');
      if (!isStr(f.title) || !f.title.trim()) bad(`${who}/flags/${j}/title`, 'a flag needs a title (one line: what is wrong)');
      if (f.kind != null && !FLAG_KINDS.includes(f.kind)) bad(`${who}/flags/${j}/kind`, `kind must be one of ${FLAG_KINDS.join(', ')}`);
    });
  };
  if (doc.history != null && !Array.isArray(doc.history)) bad('/history', 'history must be an array (the store writes it; do not edit it by hand)');

  const pos = (path, p) => {
    if (!isObj(p) || !isNum(p.x) || !isNum(p.y)) bad(path, 'position must be {x, y} numbers', 'omit position to let DGV place it, or give numbers');
  };

  (doc.frames ?? []).forEach((f, i) => {
    const p = `/frames/${i}`;
    if (!isObj(f)) return bad(p, 'must be an object');
    if (!isStr(f.id) || !ID_RE.test(f.id)) bad(`${p}/id`, 'id must match ^[a-zA-Z][a-zA-Z0-9_.:-]*$');
    if (!isStr(f.label) || !f.label.trim()) bad(`${p}/label`, 'label required');
    if (f.parent != null && !isStr(f.parent)) bad(`${p}/parent`, 'parent must be a frame id');
    if (f.tone != null && !FRAME_TONES.includes(f.tone)) bad(`${p}/tone`, `tone must be one of ${FRAME_TONES.join(', ')}`);
    if (f.ack != null && !isStr(f.ack)) bad(`${p}/ack`, 'ack must be a string (the reason)');
    flags(p, f.flags);
    if (f.position != null) pos(`${p}/position`, f.position);
    if (f.size != null && (!isObj(f.size) || !isNum(f.size.width) || !isNum(f.size.height))) bad(`${p}/size`, 'size must be {width, height}');
  });

  (doc.nodes ?? []).forEach((n, i) => {
    const p = `/nodes/${i}`;
    if (!isObj(n)) return bad(p, 'must be an object');
    const who = n.id ? `${p} (${n.id})` : p;
    if (!isStr(n.id) || !ID_RE.test(n.id)) bad(`${p}/id`, 'id must match ^[a-zA-Z][a-zA-Z0-9_.:-]*$');
    if (!NODE_KINDS[n.kind]) bad(`${who}/kind`, `unknown kind "${n.kind}"`, `use one of ${Object.keys(NODE_KINDS).join(', ')}`);
    if (!isStr(n.label) || !n.label.trim()) bad(`${who}/label`, 'label required');
    if (n.frame != null && !isStr(n.frame)) bad(`${who}/frame`, 'frame must be a frame id');
    if (n.status != null && !STATUSES[n.status]) bad(`${who}/status`, `unknown status "${n.status}"`, `use one of ${Object.keys(STATUSES).join(', ')}`);
    if (n.ack != null && !isStr(n.ack)) bad(`${who}/ack`, 'ack must be a string (the reason)');
    flags(who, n.flags);
    if (n.position != null) pos(`${who}/position`, n.position);
    if (n.tags != null && !(Array.isArray(n.tags) && n.tags.every(isStr))) bad(`${who}/tags`, 'tags must be strings');
    if (n.path != null && !(isStr(n.path) || (Array.isArray(n.path) && n.path.every(isStr)))) bad(`${who}/path`, 'path must be a file, directory or glob — a string, or a list of them');
    if (n.ports != null) {
      if (!Array.isArray(n.ports)) bad(`${who}/ports`, 'ports must be an array');
      else n.ports.forEach((pt, j) => {
        if (!isObj(pt) || !isStr(pt.id) || !pt.id) return bad(`${who}/ports/${j}`, 'port needs an id');
        if (pt.dir != null && !['in', 'out', 'both'].includes(pt.dir)) bad(`${who}/ports/${j}/dir`, 'dir must be in | out | both');
      });
    }
  });

  (doc.edges ?? []).forEach((e, i) => {
    const p = `/edges/${i}`;
    if (!isObj(e)) return bad(p, 'must be an object');
    const who = e.id ? `${p} (${e.id})` : p;
    if (!isStr(e.id) || !ID_RE.test(e.id)) bad(`${p}/id`, 'id must match ^[a-zA-Z][a-zA-Z0-9_.:-]*$', 'use "<source>-<target>" or similar');
    if (!isStr(e.source)) bad(`${who}/source`, 'source node id required');
    if (!isStr(e.target)) bad(`${who}/target`, 'target node id required');
    if (e.kind != null && !EDGE_KINDS[e.kind]) bad(`${who}/kind`, `unknown edge kind "${e.kind}"`, `use one of ${Object.keys(EDGE_KINDS).join(', ')}`);
    if (e.ack != null && !isStr(e.ack)) bad(`${who}/ack`, 'ack must be a string (the reason)');
    flags(who, e.flags);
  });

  return out;
}
