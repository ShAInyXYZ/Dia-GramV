<script lang="ts">
  import { NODE_KINDS, EDGE_KINDS, STATUSES, PROTOCOLS, FRAME_TONES } from '@dgv/core';
  import { dg } from '../stores/diagram.svelte';
  import type { NodeData, FrameData, EdgeData, Port } from '../model/flow';
  import EdgeKindPicker from '../canvas/EdgeKindPicker.svelte';

  const sel = $derived(dg.selected);
  const node = $derived(sel && sel.type !== 'edge' ? dg.node(sel.id) : undefined);
  const edge = $derived(sel?.type === 'edge' ? dg.edge(sel.id) : undefined);
  const nd = $derived(node?.type === 'dgv' ? (node.data as NodeData) : null);
  const fd = $derived(node?.type === 'frame' ? (node.data as FrameData) : null);
  const ed = $derived(edge?.data ?? ({} as EdgeData));
  const frames = $derived(dg.frames().filter((f) => f.id !== node?.id));
  const portsOf = (id?: string) => ((dg.node(id ?? '')?.data as NodeData | undefined)?.ports ?? []);
  const hasWarn = (id?: string) => dg.diagnostics.some((d) => d.subject?.id === id && (d.severity === 'warning' || (d as any).ack));

  let idDraft = $state('');
  $effect(() => { idDraft = node?.id ?? ''; });
  const up = (patch: Record<string, any>) => node && dg.updateData(node.id, patch);
  const upE = (patch: Record<string, any>) => edge && dg.updateEdge(edge.id, patch);
  const setPort = (i: number, patch: Partial<Port>) => nd && up({ ports: nd.ports!.map((p, j) => j === i ? { ...p, ...patch } : p) });
  const addPort = () => nd && up({ ports: [...(nd.ports ?? []), { id: `port${(nd.ports?.length ?? 0) + 1}`, dir: 'in' }] });
  const rmPort = (i: number) => nd && up({ ports: nd.ports!.filter((_, j) => j !== i) });
</script>

<div class="pane">
  {#if nd && node}
    <div class="head"><span class="k" style="color:{NODE_KINDS[nd.kind]?.color}">{NODE_KINDS[nd.kind]?.label ?? nd.kind}</span><button class="x" onclick={() => dg.remove([node.id])} title="delete (Del)">delete</button></div>
    <label class="f">id</label><input class="mono" bind:value={idDraft} onchange={() => { if (!dg.renameId(node.id, idDraft)) idDraft = node.id; }} />
    <label class="f">kind</label>
    <select value={nd.kind} onchange={(e) => up({ kind: (e.target as HTMLSelectElement).value })}>{#each Object.entries(NODE_KINDS) as [k, v]}<option value={k}>{v.label} — {v.hint}</option>{/each}</select>
    <label class="f">label</label><input value={nd.label} oninput={(e) => up({ label: (e.target as HTMLInputElement).value })} />
    <label class="f">sublabel</label><input value={nd.sublabel ?? ''} oninput={(e) => up({ sublabel: (e.target as HTMLInputElement).value })} />
    <label class="f">path · the code this is</label><input class="mono" value={Array.isArray(nd.path) ? nd.path.join(', ') : nd.path ?? ''} placeholder="internal/api — or a glob, or a comma list" onchange={(e) => { const v = (e.target as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean); up({ path: v.length > 1 ? v : v[0] }); }} />
    <div class="two">
      <div><label class="f">tech</label><input value={nd.tech ?? ''} placeholder="Go, Svelte 5…" oninput={(e) => up({ tech: (e.target as HTMLInputElement).value })} /></div>
      <div><label class="f">status</label><select value={nd.status ?? ''} onchange={(e) => up({ status: (e.target as HTMLSelectElement).value || undefined })}><option value="">—</option>{#each Object.entries(STATUSES) as [k, v]}<option value={k}>{v.label}</option>{/each}</select></div>
    </div>
    <label class="f">frame</label>
    <select value={node.parentId ?? ''} onchange={(e) => dg.setParent(node.id, (e.target as HTMLSelectElement).value || null)}><option value="">(none)</option>{#each frames as f}<option value={f.id}>{(f.data as FrameData).label}</option>{/each}</select>
    <label class="f">ports <button class="mini" onclick={addPort}>+ port</button></label>
    {#each nd.ports ?? [] as p, i (i)}
      <div class="port">
        <input class="mono" value={p.id} placeholder="id" oninput={(e) => setPort(i, { id: (e.target as HTMLInputElement).value })} />
        <input class="mono" list="protocols" value={p.protocol ?? ''} placeholder="protocol" oninput={(e) => setPort(i, { protocol: (e.target as HTMLInputElement).value || undefined })} />
        <select value={p.dir ?? 'in'} onchange={(e) => setPort(i, { dir: (e.target as HTMLSelectElement).value as any })}><option value="in">in</option><option value="out">out</option><option value="both">both</option></select>
        <button class="mini" onclick={() => rmPort(i)}>×</button>
        <input class="wide" value={p.shape ?? ''} placeholder="what crosses it (shape / contract)" oninput={(e) => setPort(i, { shape: (e.target as HTMLInputElement).value || undefined })} />
      </div>
    {/each}
    <label class="f">note</label><textarea value={nd.note ?? ''} oninput={(e) => up({ note: (e.target as HTMLTextAreaElement).value })}></textarea>
    <label class="f">tags</label><input class="mono" value={(nd.tags ?? []).join(', ')} onchange={(e) => up({ tags: (e.target as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean) })} />
    {#if hasWarn(node.id) || nd.ack}
      <label class="f">accepted warning · why</label><input value={nd.ack ?? ''} placeholder="leave empty to keep the warning" onchange={(e) => up({ ack: (e.target as HTMLInputElement).value || undefined })} />
    {/if}

  {:else if fd && node}
    <div class="head"><span class="k">Frame</span><button class="x" onclick={() => dg.remove([node.id])}>delete</button></div>
    <label class="f">id</label><input class="mono" bind:value={idDraft} onchange={() => { if (!dg.renameId(node.id, idDraft)) idDraft = node.id; }} />
    <label class="f">label</label><input value={fd.label} oninput={(e) => up({ label: (e.target as HTMLInputElement).value })} />
    <label class="f">tone</label><select value={fd.tone ?? 'neutral'} onchange={(e) => up({ tone: (e.target as HTMLSelectElement).value })}>{#each FRAME_TONES as t}<option value={t}>{t}</option>{/each}</select>
    <label class="f">inside</label>
    <select value={node.parentId ?? ''} onchange={(e) => dg.setParent(node.id, (e.target as HTMLSelectElement).value || null)}><option value="">(top level)</option>{#each frames as f}<option value={f.id}>{(f.data as FrameData).label}</option>{/each}</select>
    <label class="f">note</label><textarea value={fd.note ?? ''} oninput={(e) => up({ note: (e.target as HTMLTextAreaElement).value })}></textarea>
    {#if hasWarn(node.id) || fd.ack}
      <label class="f">accepted warning · why</label><input value={fd.ack ?? ''} placeholder="leave empty to keep the warning" onchange={(e) => up({ ack: (e.target as HTMLInputElement).value || undefined })} />
    {/if}
    <p class="hint">Drag nodes into a frame to adopt them; frames grow to fit. Drag a corner to resize.</p>
  {:else if edge}
    <div class="head"><span class="k">Edge</span><button class="x" onclick={() => dg.remove([edge.id])}>delete</button></div>
    <div class="ends mono">{edge.source} <span class="dim">→</span> {edge.target}</div>
    <label class="f">kind</label>
    <EdgeKindPicker value={ed.kind ?? 'sync'} onchange={(k) => upE({ kind: k })} />
    <label class="f">protocol</label><input class="mono" list="protocols" value={ed.protocol ?? ''} oninput={(e) => upE({ protocol: (e.target as HTMLInputElement).value || undefined })} />
    <label class="f">label</label><input value={ed.label ?? ''} placeholder="what happens: send turn, stream tokens…" oninput={(e) => upE({ label: (e.target as HTMLInputElement).value || undefined })} />
    <div class="two">
      <div><label class="f">from port</label><select value={ed.sourcePort ?? ''} onchange={(e) => upE({ sourcePort: (e.target as HTMLSelectElement).value || undefined })}><option value="">—</option>{#each portsOf(edge.source) as p}<option value={p.id}>{p.id}{p.protocol ? ` (${p.protocol})` : ''}</option>{/each}</select></div>
      <div><label class="f">to port</label><select value={ed.targetPort ?? ''} onchange={(e) => upE({ targetPort: (e.target as HTMLSelectElement).value || undefined })}><option value="">—</option>{#each portsOf(edge.target) as p}<option value={p.id}>{p.id}{p.protocol ? ` (${p.protocol})` : ''}</option>{/each}</select></div>
    </div>
    <label class="f">payload</label><input value={ed.payload ?? ''} placeholder="messages[], tools[], grammar" oninput={(e) => upE({ payload: (e.target as HTMLInputElement).value || undefined })} />
    <label class="f">note</label><textarea value={ed.note ?? ''} oninput={(e) => upE({ note: (e.target as HTMLTextAreaElement).value || undefined })}></textarea>
    {#if hasWarn(edge.id) || ed.ack}
      <label class="f">accepted warning · why</label><input value={ed.ack ?? ''} placeholder="leave empty to keep the warning" onchange={(e) => upE({ ack: (e.target as HTMLInputElement).value || undefined })} />
    {/if}
  {:else}
    <p class="hint">Select a node, frame or edge to edit it.<br /><br />Drag from a node's right handle to another node to connect them. Click a node to light up its neighbourhood.</p>
  {/if}
  <datalist id="protocols">{#each PROTOCOLS as p}<option value={p}></option>{/each}</datalist>
</div>

<style>
  .pane { padding: 10px 12px 20px; }
  .head { display: flex; align-items: center; justify-content: space-between; }
  .k { font-family: var(--mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .x { font-size: 10.5px; padding: 2px 8px; color: var(--dim); } .x:hover { color: var(--err); border-color: var(--err); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .mini { font-size: 10px; padding: 0 6px; margin-left: 6px; text-transform: none; letter-spacing: 0; }
  .port { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 4px; margin-bottom: 6px; padding: 6px; background: var(--s2); border: 1px solid var(--hair); border-radius: 5px; }
  .port select { width: auto; } .port .wide { grid-column: 1 / -1; }
  .ends { font-size: 11.5px; color: var(--muted); margin: 8px 0 2px; }
  .hint { color: var(--dim); font-size: 12px; line-height: 1.5; }
</style>
