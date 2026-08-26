---
name: dgv
description: Dia-GramV (DGV) — plan a system's architecture as a typed, linted, live diagram BEFORE writing code. Use when the user wants to design or map an app's architecture, see how modules / APIs / programs / databases / bridges connect, check a plan for incompatibilities, review an existing codebase's structure as a diagram, or track build status per component. Works through the `dgv` MCP tools (dgv_catalog, dgv_create, dgv_apply, dgv_lint, dgv_layout, dgv_open, dgv_export). Triggers on "architecture", "diagram", "system map", "how do the pieces connect", "plan before we build", "DGV".
---

# Dia-GramV (DGV)

One diagram per system, stored as `dgv/<name>.dgv.json` in the project. The agent authors it through MCP tools; the developer sees it live in the viewer and can drag, edit, and save from there. The file is the single source of truth — both sides read and write it.

**Why it exists:** a plan written in prose hides incompatibilities (a module calling a DB over HTTP, a service that nobody starts, a bridge with one side, an API nobody calls, an import cycle). DGV makes every component a typed node with **ports**, every relation a typed edge with a **protocol**, and lints the whole thing so those mistakes surface before code — instead of after a day of tokens.

## Workflow (always this order)

1. `dgv_catalog` once per session — the allowed node kinds, edge kinds, protocols. Never invent a kind.
2. `dgv_list` / `dgv_read` — is there already a diagram for this system? Extend it; do not create a second one for the same system.
3. `dgv_create` (new) then `dgv_apply` in **a few large batches**, not one node per call:
   - frames first (boundaries: machine, process, service group, remote), then nodes with `frame`, then edges.
   - every node: `kind`, `label`, short `sublabel`, `tech`. Add `ports` on anything that is *called* (api, service, db, model, sidecar): `{ id, protocol, dir, shape }` where `shape` says what crosses it (`"JSON /api/v1"`, `"text[] → float[][]"`).
   - every edge: `kind` (sync | async | data | import | deploy | control), `protocol`, `label` (what happens), `targetPort` when the target declares ports, `payload` when the shape matters.
   - never send `position` — DGV places new nodes; call `dgv_layout` after a batch.
4. Read the lint report `dgv_apply` returns. **Fix every error** by changing only the named `subject` using one of its `fixes`. Warnings are advice: fix them when they reveal a real gap (orphans, unspecified contracts, one-sided bridges); explain when you deliberately keep one.
5. `dgv_layout` then `dgv_open` — tell the user the URL. They may rearrange and save; re-read with `dgv_read` before your next edit so you never overwrite their layout.
6. `dgv_export format=markdown` when the plan is agreed → paste into the project's docs / CLAUDE.md so the build follows it.

## Modelling rules

- **One node per runtime thing** (process, store, device, external). Code-level structure inside a program is a `module` node with `import` edges — only inside the program's frame.
- **Frames are boundaries** (machine, container, process, trust zone, remote), not categories. Nest them (`parent`). Don't frame externals.
- **Bridges** are for translation between worlds (Go ↔ Python sidecar, webview ↔ native, IPC shim). A bridge has two sides.
- **Stores never initiate calls.** Access to a db/cache/storage is a `data` edge *into* it.
- Prefer fewer, truer nodes: 8–25 nodes per diagram. If a frame grows past ~12 nodes, it is probably two frames.
- Use `status` (todo/wip/done/blocked) on nodes when tracking a build; the viewer can colour by status. Keep it on the same diagram — no separate "build" diagram.
- Ids are stable and lowercase (`core`, `api`, `typesense`); the user reads them in the lint output and exports.

## When reading an existing codebase

Map from evidence, not names: entrypoints, listeners/ports, clients, DB drivers, queues, config. Write `tech` from what the code actually uses. Put the file path in `note` when useful. Do not draw runtime causality you did not verify.

## Reference

`references/format.md` — the file format and every lint code with its meaning.
`references/example.md` — a complete worked example (local AI harness).
Manual CLI (same core): `node <Dia-GramV>/packages/mcp/bin/dgv.mjs lint|layout|export|serve|open`.
