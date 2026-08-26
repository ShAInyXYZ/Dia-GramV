<script lang="ts">
  // One thin bar: what diagram, is it saved, and the few global actions. Nothing else.
  import { useSvelteFlow } from '@xyflow/svelte';
  import { dg } from '../stores/diagram.svelte';
  import { hl, EDGE_STYLES } from '../stores/hl.svelte';
  import { ui } from '../stores/ui.svelte';

  const flow = useSvelteFlow();
  let menu = $state(false), creating = $state(false), name = $state(''), title = $state('');
  const selCount = $derived(dg.nodes.filter((n) => n.selected && n.type !== 'frame').length);

  function centerOfView() {
    const el = document.querySelector('.svelte-flow') as HTMLElement | null;
    const r = el?.getBoundingClientRect() ?? { left: 0, top: 0, width: 800, height: 600 };
    const p = flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return { x: p.x - 180, y: p.y - 100 };
  }
  async function create() {
    const n = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-'); if (!n) return;
    await dg.create(n, title.trim() || n); creating = false; menu = false; name = ''; title = '';
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(dg.doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${dg.name}.dgv.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  export function addFrame() { dg.addFrame(centerOfView()); }
</script>

<div class="bar">
  <div class="left">
    <span class="logo">◈</span>
    <div class="namewrap">
      <button class="name" onclick={() => (menu = !menu)}>{dg.meta?.title ?? 'choose a diagram'} <span class="chev">▾</span></button>
      {#if menu}
        <div class="menu" role="menu">
          {#each dg.list as d}<button class="mi" class:on={d.name === dg.name} onclick={() => { dg.open(d.name); menu = false; }}>{d.title ?? d.name}<span class="cnt">{d.nodes}n · {d.edges}e</span></button>{/each}
          {#if creating}
            <div class="new"><input placeholder="file name" bind:value={name} /><input placeholder="title" bind:value={title} onkeydown={(e) => e.key === 'Enter' && create()} /><button class="primary" onclick={create}>create</button></div>
          {:else}<button class="mi dim" onclick={() => (creating = true)}>+ new diagram</button>{/if}
        </div>
      {/if}
    </div>
    <button class="dot {dg.saveState}" class:dirty={dg.dirty} onclick={() => dg.save()} data-tip="save (Ctrl+S)" disabled={!dg.dirty}></button>
    {#if dg.meta?.description}<span class="desc">{dg.meta.description}</span>{/if}
  </div>

  <div class="right">
    {#if selCount >= 2}
      <div class="group align">
        <button onclick={() => dg.align('left')} data-tip="align left">⫷</button>
        <button onclick={() => dg.align('hcenter')} data-tip="align centres">⫿</button>
        <button onclick={() => dg.align('top')} data-tip="align top">⫠</button>
        <button onclick={() => dg.align('hspread')} data-tip="spread horizontally">↔</button>
        <button onclick={() => dg.align('vspread')} data-tip="spread vertically">↕</button>
      </div>
    {/if}
    <div class="group">
      <button onclick={() => dg.undo()} disabled={!dg.canUndo} data-tip="undo (Ctrl+Z)">↶</button>
      <button onclick={() => dg.redo()} disabled={!dg.canRedo} data-tip="redo (Ctrl+Shift+Z)">↷</button>
    </div>
    <div class="group">
      <button onclick={addFrame} disabled={!dg.name} data-tip={selCount ? 'wrap selection in a frame (G)' : 'add a frame (G)'}>{selCount ? '⊞ frame' : '+ frame'}</button>
      <button onclick={() => (ui.quickAdd = { x: window.innerWidth / 2 - 150, y: 120 })} disabled={!dg.name} data-tip="add a node (A, or double-click the canvas)">+ node</button>
    </div>
    <div class="group">
      <button onclick={() => dg.relayout('TB')} disabled={!dg.name} data-tip="auto layout ↓">layout ↓</button>
      <button onclick={() => dg.relayout('LR')} disabled={!dg.name} data-tip="auto layout →">layout →</button>
      <button onclick={() => flow.fitView({ duration: 300 })} data-tip="fit (F)">fit</button>
    </div>
    <div class="group">
      <button onclick={() => { hl.edgeStyle = EDGE_STYLES[(EDGE_STYLES.indexOf(hl.edgeStyle) + 1) % EDGE_STYLES.length]; dg.touch(); }} data-tip="link style (L)">links: {hl.edgeStyle}</button>
      <button class:active={hl.colorBy === 'status'} onclick={() => { hl.colorBy = hl.colorBy === 'kind' ? 'status' : 'kind'; dg.touch(); }} data-tip="colour by kind (1) / status (2)">by {hl.colorBy}</button>
      <button onclick={exportJson} disabled={!dg.name} data-tip="download the JSON">export</button>
    </div>
  </div>
</div>

<style>
  .bar { height: 40px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; background: var(--s1); border-bottom: 1px solid var(--hair); }
  .left, .right { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .logo { color: var(--accent); font-size: 14px; }
  .namewrap { position: relative; }
  .name { background: transparent; border-color: transparent; font-family: var(--sans); font-size: 13px; font-weight: 650; color: var(--text); padding: 4px 6px; }
  .name:hover { border-color: var(--hair); }
  .chev { color: var(--dim); font-size: 10px; margin-left: 2px; }
  .menu { position: absolute; top: 34px; left: 0; z-index: 40; min-width: 280px; background: var(--s1); border: 1px solid var(--hair2); border-radius: 7px; padding: 4px; }
  .mi { display: flex; justify-content: space-between; gap: 12px; width: 100%; text-align: left; background: transparent; border-color: transparent; font-family: var(--sans); font-size: 12px; padding: 6px 8px; }
  .mi:hover, .mi.on { background: var(--s2); }
  .mi.dim { color: var(--dim); }
  .cnt { font-family: var(--mono); font-size: 10px; color: var(--dim); }
  .new { display: grid; gap: 4px; padding: 6px; }
  .dot { width: 10px; height: 10px; padding: 0; border-radius: 50%; border: none; background: var(--ok); }
  .dot.dirty { background: var(--warn); } .dot.saving { background: var(--muted); } .dot.error { background: var(--err); }
  .dot:disabled { opacity: 1; }
  .desc { font-size: 11px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 38vw; }
  .group { display: flex; gap: 4px; padding-left: 8px; border-left: 1px solid var(--hair); }
  .group.align button { font-size: 13px; padding: 3px 8px; }
  button { padding: 4px 9px; }
</style>
