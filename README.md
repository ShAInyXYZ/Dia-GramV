<div align="center">
  <img src="banner.svg" width="880" alt="Dia-GramV — plan the architecture before you write the code"/>

  <p><strong>An MCP server that gives your AI a typed, checkable model of the system you are building.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/MCP-stdio-e8873a?style=flat-square&labelColor=161513" alt="MCP over stdio"/>
    <img src="https://img.shields.io/badge/Node-20%2B-e8873a?style=flat-square&labelColor=161513&logo=node.js&logoColor=e6e3de" alt="Node 20+"/>
    <img src="https://img.shields.io/badge/Svelte-5-e8873a?style=flat-square&labelColor=161513&logo=svelte&logoColor=e6e3de" alt="Svelte 5"/>
    <img src="https://img.shields.io/badge/license-MIT-e8873a?style=flat-square&labelColor=161513" alt="MIT"/>
    <img src="https://img.shields.io/badge/cloud-none-e8873a?style=flat-square&labelColor=161513" alt="No cloud"/>
  </p>

  <p>Your diagrams are files in your repo. No accounts, no server, no telemetry.</p>

  <p>
    <a href="#install"><strong>Install ↓</strong></a> ·
    <a href="#see-it-work"><strong>See it work</strong></a> ·
    <a href="#mcp-tools"><strong>MCP tools</strong></a> ·
    <a href="#the-file-format"><strong>Format</strong></a>
  </p>
</div>

---

## What it is

DGV is two things sharing one file:

1. **An MCP server** your coding agent talks to. It can create the model, change it, ask what is wrong with it, and read it back as a compact outline — without ever opening your source tree.
2. **A live editor** in your browser for when *you* want to look, drag something, or hand the picture to a teammate.

Between them sits `dgv/<name>.dgv.json` — a plain, versioned file in your repo. Not a rendering, not an export: **the model itself**, in git, next to the code it describes.

Every component has a `kind` that means something (`api`, `worker`, `db`, `queue`, `bridge`, `sidecar`, `model`, `device`…). Every connection carries a `kind` and a `protocol`, and binds to a **port the target actually declares**. Because those are typed, a linter can read the plan and tell you — with a stable code and concrete fixes — when it cannot work.

## Why we built it

[Cerveau](https://github.com/ShAInyXYZ/Cerveau) — a local-first agentic coding harness, and a much older project — had an internal `arch-viewer`: a Svelte Flow canvas that drew its architecture. It was useful, and it had two problems. Nothing could talk to it but a human with a browser, so the agent doing the actual building never saw it. And it inferred structure from geometry, so it was fragile: move a box near another box and membership changed under you.

DGV keeps the lineage — same library, same conviction that architecture is worth drawing — and rebuilds the foundation:

| arch-viewer (in Cerveau) | DGV |
|---|---|
| a viewer a person opens | an **MCP server** an agent drives, plus a viewer |
| membership inferred from geometry | membership **declared** (`node.frame`, `edge.targetPort`) |
| untyped boxes and lines | a **catalog** of kinds, protocols, edge kinds, statuses |
| draws whatever you give it | **lints** it, and says how to fix it |
| a picture | a **file in the repo** that review and CI can reach |

## Why this changes things for AI-assisted work

The picture is the least interesting part. The point is that a machine can read the model, check it, and change it.

**If you vibecode**, you are generating a system faster than you can hold it in your head. Nothing in the loop remembers last Tuesday's decision, and the model in your head drifts from the one in the repo silently. DGV gives that drift somewhere to be caught: the plan is a file, and the file gets argued with.

**If you are a developer working with AI**, the diagram is where you state intent that code cannot express yet. *"The worker consumes the queue; the API never writes to the bucket directly."* Say it once, and every later prompt inherits it.

**If you are the AI**, this is the difference between grepping and knowing. Dropped into a 200-file repo, an agent burns thousands of tokens rebuilding a picture that already exists — and still guesses. `dgv_read` returns the whole system in a few hundred:

```
# Notes app
frames 3 · nodes 6 · edges 5

## frame server: Server · one process
- api  [api]    HTTP API — /api/notes    ports: rest:http/in
- jobs [worker] Job runner — thumbnails, exports
## frame data: Data
- pg    [db]      Postgres — notes, users   ports: sql:sql/in
- redis [queue]   Job queue — Redis lists   ports: jobs:redis/in
- s3    [storage] Object store — uploads    ports: put:s3/in

## edges
- web-api:    web → api    [sync http]   fetch    ports ·→rest
- api-pg:     api → pg     [data sql]             ports ·→sql
- api-redis:  api → redis  [async redis] enqueue  ports ·→jobs
- jobs-redis: jobs → redis [async redis] consume  ports ·→jobs
- jobs-s3:    jobs → s3    [data s3]              ports ·→put
```

That is the whole architecture, and it is authoritative rather than inferred. A model that can read `api → pg [data sql] ·→sql` does not invent a REST endpoint on your database.

**And it tracks what is left to do.** Every node carries a `status` — `todo`, `wip`, `done`, `blocked`, `failed`, `update`. Colour the canvas by status instead of kind and the diagram *is* the build board, in the same file, at component granularity. An agent can ask what is still `todo` and pick up where the last session stopped.

## See it work

A real session. Nothing below is illustrative — it is the output of the tools in this repo.

### 1. The agent describes the system

```jsonc
dgv_apply({ name: "notes-app",
  frames: [ {id:"browser", label:"Browser"}, {id:"server", label:"Server · one process"}, … ],
  nodes:  [ {id:"api", kind:"api", label:"HTTP API", frame:"server",
             ports:[{id:"rest", protocol:"http", dir:"in"}]}, … ],
  edges:  [ {id:"jobs-s3", source:"jobs", target:"s3", kind:"data",
             protocol:"s3", targetPort:"upload"},
            {id:"pg-api",  source:"pg", target:"api", kind:"sync",
             protocol:"http", label:"notify on change"}, … ] })
```

### 2. DGV refuses it, and says exactly why

`dgv_apply` lints on every write, so a mistake comes back in the same turn that made it:

```jsonc
{ "ok": false, "lint": { "error": 1, "warning": 2 },
  "diagnostics": [
    { "code": "port/undeclared", "severity": "error",
      "message": "edge \"jobs-s3\" uses target port \"upload\" but node \"s3\" does not declare it",
      "subject": { "type": "edge", "id": "jobs-s3", "field": "targetPort" },
      "fixes": [ "add port {id:\"upload\"} to node \"s3\"", "point the edge at one of: put" ] },

    { "code": "kind/store-initiates", "severity": "warning",
      "message": "\"pg\" is a db; stores do not initiate sync calls to \"api\"",
      "subject": { "type": "edge", "id": "pg-api" },
      "fixes": [ "reverse the edge and mark it kind:\"data\"",
                 "if it is a trigger/CDC stream, add a worker or queue between them" ] }
  ] }
```

Two mistakes anyone makes at 2am: a port called `upload` on one side and `put` on the other, and a database calling back into the API. The first would have compiled and failed at runtime. The second is an architecture the agent would have cheerfully implemented.

Both come back with the fix rather than just the complaint — so the agent repairs the plan before writing a line of code.

### 3. Fixed, laid out, open in the browser

```jsonc
dgv_apply({ name:"notes-app",
            edges:[ {id:"jobs-s3", …, targetPort:"put"} ],
            remove:{ edges:["pg-api"] } })
→ { "ok": true, "lint": { "error": 0, "warning": 0 } }

dgv_layout({ name:"notes-app", direction:"TB" })  → { "ok": true, "nodes": 6, "frames": 3 }
dgv_open({ name:"notes-app" })                    → http://127.0.0.1:7710/#/notes-app
```

<div align="center">
  <img src="assets/viewer.png" width="880" alt="The DGV viewer: typed shaped nodes in frames, routed wires carrying protocols, inspector open on the HTTP API node"/>
</div>

Shapes carry the kind, so a `db` reads as a cylinder and a `queue` as a skewed box without reading a word. Wires carry their protocol. The inspector edits every field including ports; the `!` tab lists live diagnostics and jumps to the subject. `Ctrl+S` saves, and when the agent edits the file the page reloads — or warns you first if you have unsaved changes.

### 4. Any of it, back out as a picture

`Shift+S` in the viewer, or `dgv_export` from the agent. A standalone SVG: routed wires, cropped to the content, no external fonts or images, nothing fetched — it works pasted into a README exactly as this one is.

<div align="center">
  <img src="assets/notes-app.svg" width="760" alt="The notes-app diagram exported as a standalone SVG"/>
</div>

The whole example is [`examples/notes-app.dgv.json`](examples/notes-app.dgv.json) — 3.6 kB of JSON for the entire system.

### At real size

Small systems fit on a screen. This is [Cerveau](https://github.com/ShAInyXYZ/Cerveau) itself — 35 components, 7 boundaries, 44 typed connections:

<div align="center">
  <img src="assets/architecture.svg" width="880" alt="Cerveau's architecture: 35 components across 7 boundaries"/>
</div>

**Fold it and the same file answers a different question.** Every frame collapses into one node, the wires crossing each boundary merge into one labelled link, and a system you cannot take in at a glance becomes seven boxes you can. Same document — no second diagram to keep in sync, no moment where the overview and the detail disagree:

<div align="center">
  <img src="assets/architecture-folded.svg" width="620" alt="The same architecture folded to 7 nodes and 11 merged links"/>
</div>

## Install

Needs **Node 20+**. Nothing else — no database, no account, no network.

```bash
git clone https://github.com/ShAInyXYZ/Dia-GramV.git
cd Dia-GramV
npm install
npm run build                          # builds the viewer once

node packages/mcp/bin/dgv.mjs doctor   # checks node + viewer, prints the next line with your real path
```

Register the MCP server with Claude Code (user scope, so it works in every project):

```bash
claude mcp add dgv -s user -- node /ABS/PATH/Dia-GramV/packages/mcp/bin/dgv.mjs mcp
```

Optionally install the skill, which teaches the planning workflow — when to draw, what to lint, how to repair:

```bash
ln -s /ABS/PATH/Dia-GramV/skill ~/.claude/skills/dgv
```

Then just ask: *"map this project's architecture in DGV before we start."*

Diagrams are written to `./dgv` under the directory the agent was started in. Override with `DGV_DIR=/some/path`.

<details>
<summary>Using it without an agent</summary>

```bash
node packages/mcp/bin/dgv.mjs serve                    # viewer on http://127.0.0.1:7710
node packages/mcp/bin/dgv.mjs lint   <name|file> [--json]
node packages/mcp/bin/dgv.mjs layout <name|file> [--direction TB|LR]
node packages/mcp/bin/dgv.mjs export <name|file> [--format markdown|mermaid|summary|svg]
node packages/mcp/bin/dgv.mjs list | catalog | doctor | open <name>
```
</details>

## MCP tools

| tool | does |
|---|---|
| `dgv_catalog` | node kinds (shape + meaning), edge kinds, protocols, statuses — read once per session |
| `dgv_list`, `dgv_read` | find and read diagrams (compact outline or full JSON) |
| `dgv_create` | new empty diagram |
| `dgv_apply` | upsert frames/nodes/edges by id, remove by id; auto-places new nodes; **returns the lint report** |
| `dgv_lint` | diagnostics with `code`, `severity`, `subject`, `fixes` |
| `dgv_layout` | dagre layout; members stay inside their frame |
| `dgv_open` | start the viewer if needed, open the diagram in the browser |
| `dgv_export` | markdown tables (for docs / CLAUDE.md), mermaid, outline, or standalone SVG |

Every write returns the lint report, so the agent never has to remember to check.

## What the linter catches

Structure first — unknown ids, duplicate ids, broken references — then the semantic rules that make a plan *wrong* rather than malformed:

| code | when |
|---|---|
| `port/undeclared` | an edge points at a port the target never declared |
| `port/unbound` | the target declares ports and the edge names none |
| `kind/store-initiates` | a database or bucket making calls out |
| `kind/protocol-mismatch` | a protocol a kind cannot speak |
| `kind/import-across-programs` | an import crossing a process boundary |
| `edge/cycle` | an import cycle |
| `node/unreachable` | an API nobody calls |
| `bridge/one-sided` | a bridge wired on one side only |
| `frame/nested` | a frame inside a frame |

Every one carries `fixes`. `info`-level findings can be silenced per subject with an `ack` that records *why*, so an acknowledged exception is documented in the file instead of forgotten.

Frames do not nest. Folding one had to answer "and what about the frames inside it", and every answer was a special case; one flat level makes a frame exactly one node.

## The viewer

`node packages/mcp/bin/dgv.mjs serve` → http://127.0.0.1:7710

- add nodes by kind (`A`), drag from a node's right handle to connect, drag nodes into frames (frames grow to fit), resize frames
- the inspector edits every field including ports; the problems panel lints live and jumps to the subject
- colour by kind (`1`) or by build status (`2`); `Ctrl+S` saves
- **fold a frame into one node** — hover a frame and fold it, or `S` for the simple view. The folded view keeps its own layout, per diagram, in your browser — never in the file
- **snapshot** (`Shift+S`) saves what is on screen as a standalone SVG
- the page reloads when the agent changes the file, or warns you if you have unsaved edits
- `npm run dev` runs Vite on 5190 with `/api` proxied to 7710, for hacking on the viewer itself

## The file format

```jsonc
{ "dgv": 1,
  "meta":   { "title": "Notes app", "description": "…", "colorBy": "kind" },
  "frames": [ { "id": "server", "label": "Server · one process", "tone": "amber" } ],
  "nodes":  [ { "id": "api", "kind": "api", "label": "HTTP API", "sublabel": "/api/notes",
                "frame": "server", "status": "done",
                "ports": [ { "id": "rest", "protocol": "http", "dir": "in" } ] } ],
  "edges":  [ { "id": "web-api", "source": "web", "target": "api",
                "kind": "sync", "protocol": "http", "targetPort": "rest", "label": "fetch" } ] }
```

Positions live in the file too, so a layout you arranged stays arranged. [`skill/references/format.md`](skill/references/format.md) has the full schema, every kind, and every lint code.

## Packages

| path | what |
|---|---|
| `packages/core` | isomorphic ESM: catalog, validator, lint, dagre layout, orthogonal router, exports, file store |
| `packages/mcp` | `dgv` CLI + MCP server + local HTTP/SSE server for the viewer |
| `packages/viewer` | Svelte 5 + Svelte Flow editor: shaped nodes, frames, folding, inspector, live problems |
| `skill/` | Claude Code skill (`SKILL.md`) teaching the planning workflow |
| `examples/` | [`notes-app`](examples/notes-app.dgv.json), [`local-ai-harness`](examples/local-ai-harness.dgv.json) |

```bash
npm test    # core: schema, lint rules, patch semantics, layout containment, folding, exports, SVG
```

## Honest limits

DGV records the plan. **It does not read your source**, so it cannot tell you the code matches — only that the plan is coherent, and that what you wrote down still says what you meant. Keeping the two in step is a habit, not a feature; the file living in the repo is what makes that habit reviewable.

Not here yet: collaboration and hosting, sequence and lifecycle diagram types, repository auto-discovery. The format is versioned (`dgv: 1`) so those can arrive without breaking existing diagrams.

## Credits

Inspired by [archify](https://github.com/tt-a1i/archify) — typed IR and repairable diagnostics — and grown out of the `arch-viewer` draft inside [Cerveau](https://github.com/ShAInyXYZ/Cerveau) ([cerveau.sh](https://cerveau.sh)), where the Svelte Flow canvas and the idea of frames came from.

MIT © Mounir Belahbib
