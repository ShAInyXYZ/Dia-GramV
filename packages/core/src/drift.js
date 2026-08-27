/**
 * Drift: does the diagram still describe the code?
 *
 * Lint says whether the plan is coherent. Drift says whether it is TRUE —
 * every node with a `path` must point at something that exists, and every
 * directory of code must belong to some node. A diagram that passes both is a
 * map of the repository; one that passes only lint is a plan somebody had.
 *
 * Pure: takes the list of files the caller walked (relative, forward
 * slashes) so it runs the same in Node and in the browser. The MCP tool and
 * the CLI do the walking.
 */

const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

/** glob → RegExp. `**` crosses directories, `*` and `?` do not. A bare path claims itself and everything under it. */
export function pathMatcher(pattern) {
  const p = norm(pattern);
  if (!/[*?]/.test(p)) {
    const esc = p.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${esc}(/.*)?$`);
  }
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') { if (p[i + 1] === '*') { re += '.*'; i++; if (p[i + 1] === '/') i++; } else re += '[^/]*'; }
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/**
 * @param doc    a DGV document; nodes may carry `path: string | string[]`
 * @param files  every file in the project, relative to its root
 * @param opts   { depth = 2 }  how deep to name an unclaimed directory
 */
export function drift(doc, files, opts = {}) {
  const depth = Math.max(1, opts.depth ?? 2);
  const ignore = (doc.meta?.driftIgnore ?? []).map(pathMatcher);
  const all = [...new Set(files.map(norm))].filter(Boolean);
  const tree = all.filter((f) => !ignore.some((re) => re.test(f)));
  const ignored = all.length - tree.length;

  const findings = [];
  const claimed = {};                        // node id → files
  const owners = new Map();                  // file → node ids
  let mapped = 0, unmapped = 0, missing = 0;

  for (const n of doc.nodes ?? []) {
    const paths = n.path == null ? [] : Array.isArray(n.path) ? n.path : [n.path];
    if (!paths.length) {
      unmapped++;
      findings.push({ code: 'drift/unmapped', severity: 'info', message: `node "${n.id}" (${n.label}) has no path — nothing ties it to the code`, subject: { type: 'node', id: n.id, field: 'path' }, fixes: ['set path to the file or directory that implements it', 'leave it if it is not code: a device, an external service, a store'] });
      continue;
    }
    const hits = new Set();
    for (const pat of paths) {
      const re = pathMatcher(pat);
      const matched = tree.filter((f) => re.test(f));
      if (!matched.length) {
        missing++;
        findings.push({ code: 'drift/missing', severity: 'error', message: `node "${n.id}" claims "${pat}" but nothing there exists`, subject: { type: 'node', id: n.id, field: 'path', path: pat }, fixes: ['the code moved: update path', 'the node is gone: remove it, or set status: todo if it is not written yet'] });
      }
      for (const f of matched) hits.add(f);
    }
    if (hits.size) mapped++;
    claimed[n.id] = [...hits];
    for (const f of hits) { if (!owners.has(f)) owners.set(f, []); owners.get(f).push(n.id); }
  }

  // One file, two owners: one of them is wrong. Report each pair once.
  const pairs = new Set();
  for (const [f, ids] of owners) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const key = [ids[i], ids[j]].sort().join('\0');
      if (pairs.has(key)) continue; pairs.add(key);
      findings.push({ code: 'drift/shared', severity: 'warning', message: `nodes "${ids[i]}" and "${ids[j]}" both claim ${f}`, subject: { type: 'node', id: ids[i], other: ids[j], path: f }, fixes: ['narrow one path so each file has one owner', 'merge the two nodes if they are one thing'] });
    }
  }

  // Code nobody claims — only meaningful once the diagram is tethered at all.
  const linked = mapped + missing > 0;
  let unclaimed = 0;
  if (linked) {
    const free = tree.filter((f) => !owners.has(f) && f.includes('/'));   // loose root files are not a subsystem
    const dirs = new Map();                                                // dir → { free, total }
    const bump = (d, isFree) => { const s = dirs.get(d) ?? { free: 0, total: 0 }; s.total++; if (isFree) s.free++; dirs.set(d, s); };
    for (const f of tree) {
      if (!f.includes('/')) continue;
      const parts = f.split('/'); parts.pop();
      for (let i = 1; i <= parts.length; i++) bump(parts.slice(0, i).join('/'), !owners.has(f));
    }
    const direct = new Map();                                              // dir → has a file directly in it
    for (const f of free) { const d = f.split('/').slice(0, -1).join('/'); direct.set(d, true); }

    const report = (d, s, partial) => {
      unclaimed++;
      findings.push({ code: 'drift/unclaimed', severity: 'warning', message: partial ? `${d}/ — ${s.free} of ${s.total} files belong to no node` : `${d}/ — ${s.total} file${s.total > 1 ? 's' : ''}, no node claims any of it`, subject: { type: 'dir', path: d, files: s.free, partial }, fixes: ['add a node with this path', 'widen an existing node\'s path to cover it', `add it to meta.driftIgnore if it is not part of the system`] });
    };
    const visit = (d, level) => {
      const s = dirs.get(d); if (!s || !s.free) return;                    // fully claimed, or empty
      const whole = s.free === s.total;
      if (level >= depth) { report(d, s, !whole); return; }
      if (whole && direct.get(d)) { report(d, s, false); return; }         // real code lives here: name this one
      // partly claimed, or only subdirectories: look inside
      const kids = [...dirs.keys()].filter((k) => k.startsWith(d + '/') && !k.slice(d.length + 1).includes('/'));
      if (whole && !kids.length) { report(d, s, false); return; }
      for (const k of kids.sort()) visit(k, level + 1);
    };
    for (const top of [...dirs.keys()].filter((k) => !k.includes('/')).sort()) visit(top, 1);
  }

  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    ok: missing === 0 && unclaimed === 0,
    linked,
    summary: { files: tree.length, ignored, mapped, unmapped, missing, unclaimed },
    claimed,
    findings,
  };
}
