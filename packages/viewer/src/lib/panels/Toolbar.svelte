<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte';
  import { NODE_KINDS } from '@dgv/core';
  import { dg } from '../stores/diagram.svelte';
  import { hl } from '../stores/hl.svelte';

  const flow = useSvelteFlow();
  let addKind = $state('service');

  function centerOfView() {
    const el = document.querySelector('.svelte-flow') as HTMLElement | null;
    const r = el?.getBoundingClientRect() ?? { left: 0, top: 0, width: 800, height: 600 };
    const p = flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return { x: p.x - 130, y: p.y - 40 };
  }
  function addNode() { const id = dg.addNode(addKind, centerOfView()); flow.fitView({ nodes: [{ id }], duration: 250, maxZoom: 1.2 }); }
  function addFrame() { dg.addFrame(centerOfView()); }
  function exportJson() {
    const blob = new Blob([JSON.stringify(dg.doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${dg.name}.dgv.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  const hasSelection = $derived(dg.nodes.some((n) => n.selected && n.type !== 'frame'));
</script>

<div class="bar">
  <div class="group">
    <select bind:value={addKind} title="kind of node to add">
      {#each Object.entries(NODE_KINDS) as [k, v]}<option value={k}>{v.label}</option>{/each}
    </select>
    <button onclick={addNode} disabled={!dg.name} title="add a node at the viewport centre">+ node</button>
    <button onclick={addFrame} disabled={!dg.name} title={hasSelection ? 'wrap the selected nodes in a frame' : 'add an empty frame'}>{hasSelection ? '⊞ frame selection' : '+ frame'}</button>
  </div>
  <div class="group">
    <button onclick={() => dg.relayout('TB')} disabled={!dg.name} title="dagre layout, top→bottom inside frames">layout ↓</button>
    <button onclick={() => dg.relayout('LR')} disabled={!dg.name} title="dagre layout, left→right inside frames">layout →</button>
    <button onclick={() => flow.fitView({ duration: 300 })} title="fit (also: minimap)">fit</button>
    <button class:active={hl.colorBy === 'status'} onclick={() => { hl.colorBy = hl.colorBy === 'kind' ? 'status' : 'kind'; dg.touch(); }} title="color nodes by kind or by build status">by {hl.colorBy}</button>
  </div>
  <div class="group right">
    <span class="save {dg.saveState}" class:dirty={dg.dirty}>{dg.saveState === 'saving' ? 'saving…' : dg.saveState === 'error' ? 'save failed' : dg.dirty ? 'unsaved' : 'saved ✓'}</span>
    <button class="primary" onclick={() => dg.save()} disabled={!dg.name || !dg.dirty} title="Ctrl+S">save</button>
    <button onclick={exportJson} disabled={!dg.name}>export</button>
  </div>
</div>

<style>
  .bar { display: flex; align-items: center; gap: 14px; padding: 8px 12px; background: var(--s1); border-bottom: 1px solid var(--hair); }
  .group { display: flex; align-items: center; gap: 6px; }
  .group.right { margin-left: auto; }
  select { width: auto; padding: 4px 6px; font-family: var(--mono); font-size: 11.5px; }
  .save { font-family: var(--mono); font-size: 11px; letter-spacing: .04em; color: var(--ok); margin-right: 4px; }
  .save.dirty { color: var(--warn); } .save.saving { color: var(--muted); } .save.error { color: var(--err); }
</style>
