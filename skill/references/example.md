# Worked example — Local AI Harness

The full file is `example.dgv.json` next to this one. What to notice:

- Frames are boundaries: `machine` (the workstation) contains `core`, `serving`, `memory`; `remote` is a sibling; the external `ntfy` sits in no frame.
- Every callable thing declares ports: `api.rest` (http, in), `api.events` (sse, out), `llama.chat`, `typesense.search`, `sidecar.embed`.
- Edges bind to ports and carry the contract: `loop → llama` is `sync http → chat`, payload `messages[], tools[], grammar`.
- Code structure inside the core is `module` nodes with `import` edges (`loop → tools`, `loop → rfx`); nothing else uses `import`.
- Store access is `data` (`loop → typesense`, `llama → weights`); the stores never initiate.
- Build tracking rides on the same nodes via `status` (`rfx` is `wip`).

Authoring it took three `dgv_apply` calls: frames+nodes, edges, then one fix pass from the lint report.
