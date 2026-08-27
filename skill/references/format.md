# .dgv.json format

```jsonc
{
  "dgv": 1,
  "meta": { "title": "…", "description": "…", "updated": "2026-08-26", "colorBy": "kind" | "status", "edgeStyle": "floating" | "routed" | "straight",
            "driftIgnore"?: [ "docs", "scripts/**" ] },
  "frames": [ { "id", "label", "parent"?, "tone"?: neutral|amber|cyan|violet|green|rose, "note"?, "ack"?, "position"?: {x,y}, "size"?: {width,height} } ],
  "nodes":  [ { "id", "kind", "label", "sublabel"?, "note"?, "frame"?, "tech"?, "status"?: todo|wip|done|blocked|failed|update,
                "path"?: "internal/api" | [ "panel/src/**/*.svelte", "panel/package.json" ],
                "tags"?: [], "ports"?: [ { "id", "protocol"?, "dir"?: in|out|both, "shape"? } ], "position"?: {x,y}, "ack"? } ],
  "edges":  [ { "id", "source", "target", "kind"?: sync|async|data|import|deploy|control, "protocol"?, "label"?,
                "sourcePort"?, "targetPort"?, "payload"?, "note"?, "ack"? } ]
}
```

`ack` is a one-line reason on any element: its lint **warnings** become info carrying that reason. Errors cannot be acknowledged. Use it only after checking the warning is intentional, and say why in the ack.

`path` ties a node to the code that implements it: a file, a directory (which claims everything under it), a glob (`**` crosses directories, `*` does not), or a list. `dgv_drift` checks every path exists and that every directory of code belongs to some node; `meta.driftIgnore` lists what is deliberately outside the diagram.

Positions are absolute canvas pixels; nodes are 260 px wide, height is measured. Membership is explicit (`node.frame`) — never inferred from geometry. Frames do not nest.

## Node kinds

| kind | shape | meaning |
|---|---|---|
| ui | window | user-facing surface: web panel, desktop window, mobile screen, TUI |
| service | rect | a running process that owns logic: backend, core, daemon |
| api | pill | a named interface surface: REST/gRPC/WS endpoint set, gateway, SDK facade |
| module | tab | internal package / library inside a program; linked by `import` |
| program | chevron | an executable: CLI, script, job runner, standalone binary |
| worker | rect | background processor: queue consumer, cron, scheduler |
| db | cylinder | relational / document / graph database with a schema |
| cache | cylinder | ephemeral key-value store |
| storage | folder | files, blobs, object storage, model weights on disk |
| queue | skew | message bus, topic, event stream, job queue |
| bridge | hexagon | translator between two worlds: IPC shim, FFI, webview bridge, protocol adapter |
| sidecar | dashed | optional helper process, usually another language/runtime |
| model | chamfered | ML model or serving engine |
| external | dashed | third-party service or SaaS you do not control |
| device | phone | remote hardware: phone, sensor, another machine |
| infra | thin | proxy, load balancer, container host, tunnel |

## Edge kinds

sync (solid) · async (dashed) · data (dotted, thick) · import (thin) · deploy (long dash) · control (dash-dot)

## Lint codes

| code | severity | meaning / fix |
|---|---|---|
| schema/invalid | error | shape problem at the named path |
| ref/duplicate-id, ref/missing-node, ref/missing-frame, frame/cycle | error | dangling or looping references |
| port/undeclared | error | edge names a port the node does not declare — add the port or retarget |
| port/direction | error | edge enters an `out` port (or leaves an `in` port) |
| port/protocol-mismatch | error | edge protocol ≠ port protocol — change one, or add a bridge |
| graph/import-cycle | error | modules import each other in a loop |
| port/unbound | warning | a call edge (sync/async/data) into a node that declares ports names none |
| contract/unspecified | warning | cross-kind edge with no protocol and no label |
| kind/store-initiates | warning | a db/cache/storage is the source of a sync/async edge |
| kind/import-not-module | warning | `import` edge where neither end is a module |
| kind/import-across-programs | warning | import between different top-level frames (process boundary) |
| kind/bridge-one-sided | warning | bridge touches < 2 other nodes |
| kind/api-unused | warning | api with no callers |
| graph/orphan | warning | node with no edges |
| graph/self-loop | warning | edge to itself |
| frame/empty | warning | frame with no members |
| layout/overlap, layout/outside-frame | warning | run layout |
| kind/store-access, kind/module-loose, kind/external-inside, graph/shared-store, contract/unknown-protocol, layout/unplaced, status/missing | info | advice |

## Drift codes (`dgv_drift`)

Lint asks whether the plan is coherent; drift asks whether it is true of the code on disk.

| code | severity | meaning |
|---|---|---|
| `drift/missing` | error | a node's `path` matches nothing — the code moved, or the node describes something that is not there |
| `drift/unclaimed` | warning | a directory of code that no node's `path` covers |
| `drift/shared` | warning | two nodes claim the same file — one of them is wrong |
| `drift/unmapped` | info | a node with no `path`; fine for devices, externals and stores |

`ok` is true only with nothing missing and nothing unclaimed. A diagram with no `path` at all is reported as not linked, and unclaimed directories are not listed for it.
