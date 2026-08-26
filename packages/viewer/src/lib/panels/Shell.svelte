<script lang="ts">
  // Layout + keyboard: the canvas owns the screen; the side panel is a rail until it is needed.
  import { useSvelteFlow } from '@xyflow/svelte';
  import type { Snippet } from 'svelte';
  import { dg } from '../stores/diagram.svelte';
  import { hl, EDGE_STYLES } from '../stores/hl.svelte';
  import { ui, typing } from '../stores/ui.svelte';

  let { bar, canvas, inspect, problems }: { bar: Snippet; canvas: Snippet; inspect: Snippet; problems: Snippet } = $props();
  const flow = useSvelteFlow();
  const errs = $derived(dg.diagnostics.filter((d) => d.severity === 'error').length);
  const warns = $derived(dg.diagnostics.filter((d) => d.severity === 'warning').length);
  let width = $state(320), dragging = $state(false);

  function open(tab: 'inspect' | 'problems') { if (ui.sideOpen && ui.tab === tab) ui.sideOpen = false; else { ui.sideOpen = true; ui.tab = tab; } }
  function key(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); dg.save(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) dg.redo(); else dg.undo(); return; }
    if (typing(e)) return;
    if (e.key === 'Escape') { if (ui.quickAdd) ui.quickAdd = null; else if (dg.selected) dg.select(null); else ui.sideOpen = false; dg.setActive(null); return; }
    if (!dg.name) return;
    switch (e.key.toLowerCase()) {
      case 'a': e.preventDefault(); ui.quickAdd = { ...ui.mouse }; break;
      case 'g': e.preventDefault(); { const p = flow.screenToFlowPosition(ui.mouse); dg.addFrame({ x: p.x, y: p.y }); } break;
      case 'f': flow.fitView({ duration: 300 }); break;
      case 'l': hl.edgeStyle = EDGE_STYLES[(EDGE_STYLES.indexOf(hl.edgeStyle) + 1) % EDGE_STYLES.length]; dg.touch(); break;
      case '1': hl.colorBy = 'kind'; dg.touch(); break;
      case '2': hl.colorBy = 'status'; dg.touch(); break;
      case 'p': open('problems'); break;
      case 'i': open('inspect'); break;
    }
  }
  function startResize(e: MouseEvent) {
    dragging = true; const x0 = e.clientX, w0 = width;
    const mv = (ev: MouseEvent) => (width = Math.max(240, Math.min(560, w0 + (x0 - ev.clientX))));
    const up = () => { dragging = false; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  }
</script>

<svelte:window onkeydown={key} />

<div class="app" class:dragging>
  <header>{@render bar()}</header>
  <main>
    <div class="canvas">{@render canvas()}</div>
    <aside style="width:{ui.sideOpen ? width : 36}px">
      {#if ui.sideOpen}<!-- svelte-ignore a11y_no_static_element_interactions --><div class="grip" onmousedown={startResize}></div>{/if}
      <div class="rail">
        <button class:on={ui.sideOpen && ui.tab === 'inspect'} onclick={() => open('inspect')} data-tip="inspect (I)">i</button>
        <button class:on={ui.sideOpen && ui.tab === 'problems'} onclick={() => open('problems')} data-tip="problems (P)">!
          {#if errs}<b class="e">{errs}</b>{:else if warns}<b class="w">{warns}</b>{/if}
        </button>
        <button class="close" onclick={() => (ui.sideOpen = !ui.sideOpen)} data-tip="toggle panel (Esc)">{ui.sideOpen ? '›' : '‹'}</button>
      </div>
      {#if ui.sideOpen}
        <div class="panel">
          <div class="scroll">{#if ui.tab === 'inspect'}{@render inspect()}{:else}{@render problems()}{/if}</div>
          <div class="dir mono">{dg.dir}</div>
        </div>
      {/if}
    </aside>
  </main>
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100%; }
  .app.dragging { user-select: none; cursor: col-resize; }
  main { flex: 1; display: flex; min-height: 0; }
  .canvas { flex: 1; position: relative; min-width: 0; }
  aside { position: relative; display: flex; border-left: 1px solid var(--hair); background: var(--s1); transition: width .12s ease; }
  .grip { position: absolute; left: -3px; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 3; }
  .rail { width: 36px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding-top: 8px; border-right: 1px solid var(--hair); flex: none; }
  .rail button { position: relative; width: 26px; height: 26px; padding: 0; border-radius: 6px; background: transparent; border-color: transparent; color: var(--dim); font-family: var(--mono); font-size: 12px; }
  .rail button.on { color: var(--accent); border-color: var(--hair2); background: var(--s2); }
  .rail button.close { margin-top: auto; margin-bottom: 8px; }
  .rail b { position: absolute; top: -4px; right: -6px; font-size: 8.5px; padding: 0 4px; border-radius: 6px; line-height: 13px; }
  .rail b.e { background: var(--err); color: #fff; } .rail b.w { background: var(--warn); color: #000; }
  .panel { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .scroll { flex: 1; overflow: auto; }
  .dir { font-size: 9.5px; color: var(--dim); padding: 6px 12px; border-top: 1px solid var(--hair); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; }
</style>
