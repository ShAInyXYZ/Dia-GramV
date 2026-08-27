#!/usr/bin/env node
/**
 * dgv — Dia-GramV command line.
 *
 *   dgv mcp [--dir d]                 MCP server on stdio (what Claude Code launches)
 *   dgv serve [--dir d] [--port p] [--no-open]   local viewer + API
 *   dgv open <name>                   open one diagram in the viewer (starts it if needed)
 *   dgv lint <name|file> [--json]     lint a diagram
 *   dgv layout <name|file>            auto layout in place
 *   dgv export <name|file> [--format markdown|mermaid|summary]
 *   dgv list | catalog | doctor
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, layout, toMarkdown, toMermaid, toSVG, outline as textSummary, catalogSummary, normalize, summarizeDiagnostics as diagSummary } from '@dgv/core';
import * as store from '@dgv/core/store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const has = (n) => argv.includes(n);
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && !(arr[i - 1]?.startsWith('--') && !['--json', '--no-open'].includes(arr[i - 1])));
const dir = store.resolveDir(flag('--dir'));

function loadDoc(ref) {
  if (ref.endsWith('.json') && fs.existsSync(ref)) return { doc: normalize(JSON.parse(fs.readFileSync(ref, 'utf8'))), file: ref };
  return { doc: store.read(dir, ref), file: store.fileOf(dir, ref) };
}
function saveDoc(file, doc) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n'); fs.renameSync(tmp, file); }

const usage = () => { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 12).map((l) => l.replace(/^ \* ?/, '')).join('\n')); };

switch (cmd) {
  case 'mcp': {
    const { serveStdio } = await import('../src/server.js');
    await serveStdio({ dir });
    break;
  }
  case 'serve': {
    const { startHttp } = await import('../src/http.js');
    const { openBrowser } = await import('../src/server.js');
    const port = Number(flag('--port') ?? 7710);
    const s = await startHttp({ dir, port, log: (m) => console.error(m) });
    console.error(`dgv viewer  ${s.url}\ndiagrams    ${s.dir}`);
    if (!has('--no-open')) openBrowser(s.url);
    break;
  }
  case 'open': {
    const { startHttp, probe, DEFAULT_PORT } = await import('../src/http.js');
    const { openBrowser } = await import('../src/server.js');
    const name = positional[0];
    let up = await probe(DEFAULT_PORT);
    if (!up) { const s = await startHttp({ dir, port: DEFAULT_PORT }); console.error(`dgv viewer  ${s.url}`); }
    openBrowser(`http://127.0.0.1:${DEFAULT_PORT}/${name ? '#/' + name : ''}`);
    if (up) process.exit(0);
    break;
  }
  case 'lint': {
    const { doc } = loadDoc(positional[0]);
    const d = lint(doc); const s = diagSummary(d);
    if (has('--json')) console.log(JSON.stringify({ summary: s, diagnostics: d }, null, 2));
    else { for (const x of d) console.log(`${x.severity.padEnd(7)} ${x.code.padEnd(26)} ${x.message}${x.fixes.length ? `\n        fix: ${x.fixes.join(' | ')}` : ''}`); console.log(`\n${s.error} error(s), ${s.warning} warning(s), ${s.info} info`); }
    process.exit(s.ok ? 0 : 1);
  }
  case 'layout': {
    const { doc, file } = loadDoc(positional[0]);
    saveDoc(file, layout(doc, {}, { direction: flag('--direction') }));
    console.log(`laid out ${file}`);
    break;
  }
  case 'export': {
    const { doc } = loadDoc(positional[0]);
    const f = flag('--format') ?? 'markdown';
    process.stdout.write(f === 'svg' ? toSVG(doc) : f === 'mermaid' ? toMermaid(doc) : f === 'summary' ? textSummary(doc) : toMarkdown(doc));
    break;
  }
  case 'list': { for (const d of store.list(dir)) console.log(`${d.name.padEnd(24)} ${String(d.nodes).padStart(3)} nodes ${String(d.edges).padStart(3)} edges  ${d.title ?? ''}`); break; }
  case 'catalog': { console.log(JSON.stringify(catalogSummary(), null, 2)); break; }
  case 'doctor': {
    const dist = path.resolve(__dirname, '../../viewer/dist/index.html');
    console.log(`node       ${process.version}`);
    console.log(`diagrams   ${dir} ${fs.existsSync(dir) ? `(${store.list(dir).length} found)` : '(will be created)'}`);
    console.log(`viewer     ${fs.existsSync(dist) ? 'built' : 'NOT built — run: npm run build'}`);
    console.log(`mcp        claude mcp add dgv -s user -- node ${path.resolve(__dirname, 'dgv.mjs')} mcp`);
    break;
  }
  default: usage();
}
