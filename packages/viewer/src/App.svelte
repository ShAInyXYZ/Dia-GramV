<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteFlowProvider } from '@xyflow/svelte';
  import Canvas from './lib/canvas/Canvas.svelte';
  import TopBar from './lib/panels/TopBar.svelte';
  import Inspector from './lib/panels/Inspector.svelte';
  import Problems from './lib/panels/Problems.svelte';
  import Legend from './lib/panels/Legend.svelte';
  import Shell from './lib/panels/Shell.svelte';
  import { dg } from './lib/stores/diagram.svelte';
  import { ui } from './lib/stores/ui.svelte';
  import { api } from './lib/api';

  onMount(() => {
    (async () => {
      try { dg.dir = (await api.health()).dir; } catch { dg.error = 'dgv serve is not running (npm run serve)'; }
      await dg.refreshList();
      const fromHash = location.hash.replace(/^#\/?/, '');
      if (fromHash && dg.list.some((d) => d.name === fromHash)) dg.open(fromHash);
      else if (dg.list.length) dg.open(dg.list[0].name);
    })();
    const off = api.events((name) => dg.onDiskChange(name));
    const onHash = () => { const n = location.hash.replace(/^#\/?/, ''); if (n && n !== dg.name) dg.open(n); };
    window.addEventListener('hashchange', onHash);
    window.onbeforeunload = () => (dg.dirty ? 'unsaved changes' : undefined);
    return () => { off(); window.removeEventListener('hashchange', onHash); };
  });
  // a selection opens the inspector; the rail stays collapsed otherwise
  $effect(() => { if (dg.selected) { ui.sideOpen = true; ui.tab = 'inspect'; } });
</script>

<SvelteFlowProvider>
  <Shell>
    {#snippet bar()}<TopBar />{/snippet}
    {#snippet canvas()}
      <Canvas />
      <Legend />
      {#if dg.externalChange}<div class="banner">This diagram changed on disk (probably the agent). <button onclick={() => dg.open(dg.name!)}>reload &amp; discard my edits</button> <button class="primary" onclick={() => dg.save()}>overwrite with mine</button></div>{/if}
      {#if dg.error}<div class="banner err">{dg.error}</div>{/if}
    {/snippet}
    {#snippet inspect()}<Inspector />{/snippet}
    {#snippet problems()}<Problems />{/snippet}
  </Shell>
</SvelteFlowProvider>

<style>
  .banner { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 6; background: var(--s2); border: 1px solid var(--warn); border-radius: 6px; padding: 8px 12px; font-size: 12px; display: flex; gap: 8px; align-items: center; }
  .banner.err { border-color: var(--err); }
</style>
