<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte';
  import { dg } from '../stores/diagram.svelte';
  const flow = useSvelteFlow();
  let showInfo = $state(false);
  const list = $derived(dg.diagnostics.filter((d) => showInfo || d.severity !== 'info'));
  const counts = $derived({ error: dg.diagnostics.filter((d) => d.severity === 'error').length, warning: dg.diagnostics.filter((d) => d.severity === 'warning').length, info: dg.diagnostics.filter((d) => d.severity === 'info').length });

  function go(d: any) {
    const id = d.subject?.id; if (!id) return;
    if (d.subject.type === 'edge') { const e = dg.edge(id); if (e) { dg.select({ type: 'edge', id }); flow.fitView({ nodes: [{ id: e.source }, { id: e.target }], duration: 300, maxZoom: 1 }); } }
    else { const n = dg.node(id); if (n) { dg.select({ type: n.type === 'frame' ? 'frame' : 'node', id }); flow.fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.1 }); } }
  }
</script>

<div class="pane">
  <div class="head">
    <span class="c err">{counts.error} err</span><span class="c warn">{counts.warning} warn</span>
    <button class="mini" class:active={showInfo} onclick={() => (showInfo = !showInfo)}>{counts.info} info</button>
  </div>
  {#if !list.length}<p class="hint">{dg.name ? 'No problems. The plan holds together.' : 'Open a diagram.'}</p>{/if}
  {#each list as d}
    <button class="row {d.severity}" onclick={() => go(d)}>
      <span class="code">{d.code}</span>
      <span class="msg">{d.message}</span>
      {#if d.fixes?.length}<span class="fix">→ {d.fixes[0]}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .pane { padding: 8px 8px 20px; }
  .head { display: flex; gap: 10px; align-items: center; padding: 2px 4px 8px; font-family: var(--mono); font-size: 10.5px; }
  .c.err { color: var(--err); } .c.warn { color: var(--warn); }
  .mini { font-size: 10px; padding: 1px 6px; margin-left: auto; color: var(--dim); }
  .row { display: block; width: 100%; text-align: left; background: transparent; border: 1px solid transparent; border-left: 2px solid var(--hair2); border-radius: 0 4px 4px 0; padding: 6px 8px; margin-bottom: 4px; font-family: var(--sans); font-size: 11.5px; line-height: 1.35; }
  .row:hover { background: var(--s2); border-color: var(--hair); }
  .row.error { border-left-color: var(--err); } .row.warning { border-left-color: var(--warn); } .row.info { border-left-color: var(--hair2); opacity: .8; }
  .code { display: block; font-family: var(--mono); font-size: 9.5px; letter-spacing: .06em; color: var(--dim); }
  .msg { display: block; color: var(--text); }
  .fix { display: block; color: var(--muted); font-size: 10.5px; margin-top: 2px; }
  .hint { color: var(--dim); font-size: 12px; padding: 4px; }
</style>
