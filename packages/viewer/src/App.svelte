<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteFlowProvider } from '@xyflow/svelte';
  import Canvas from './lib/canvas/Canvas.svelte';
  import Toolbar from './lib/panels/Toolbar.svelte';
  import Inspector from './lib/panels/Inspector.svelte';
  import Problems from './lib/panels/Problems.svelte';
  import Legend from './lib/panels/Legend.svelte';
  import Picker from './lib/panels/Picker.svelte';
  import { dg } from './lib/stores/diagram.svelte';
  import { api } from './lib/api';

  let tab = $state<'inspect' | 'problems'>('inspect');
  const errCount = $derived(dg.diagnostics.filter((d) => d.severity === 'error').length);
  const warnCount = $derived(dg.diagnostics.filter((d) => d.severity === 'warning').length);

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
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); dg.save(); } };
    window.addEventListener('hashchange', onHash); window.addEventListener('keydown', onKey);
    window.onbeforeunload = () => (dg.dirty ? 'unsaved changes' : undefined);
    return () => { off(); window.removeEventListener('hashchange', onHash); window.removeEventListener('keydown', onKey); };
  });
  $effect(() => { if (dg.selected) tab = 'inspect'; });
</script>

<SvelteFlowProvider>
  <div class="app">
    <header>
      <Picker />
      <Toolbar />
    </header>
    <main>
      <div class="canvas">
        {#if dg.name}<div class="title"><b>{dg.meta.title}</b>{#if dg.meta.description}<span>{dg.meta.description}</span>{/if}</div>{/if}
        {#if dg.externalChange}<div class="banner">This diagram changed on disk (probably the agent). <button onclick={() => dg.open(dg.name!)}>reload &amp; discard my edits</button> <button class="primary" onclick={() => dg.save()}>overwrite with mine</button></div>{/if}
        {#if dg.error}<div class="banner err">{dg.error}</div>{/if}
        <Canvas />
      </div>
      <aside>
        <div class="tabs">
          <button class:active={tab === 'inspect'} onclick={() => (tab = 'inspect')}>inspect</button>
          <button class:active={tab === 'problems'} onclick={() => (tab = 'problems')}>problems {#if errCount}<b class="e">{errCount}</b>{/if}{#if warnCount}<b class="w">{warnCount}</b>{/if}</button>
        </div>
        <div class="scroll">{#if tab === 'inspect'}<Inspector />{:else}<Problems />{/if}</div>
        <div class="dir mono" title={dg.dir}>{dg.dir}</div>
      </aside>
    </main>
    <Legend />
  </div>
</SvelteFlowProvider>

<style>
  .app { display: flex; flex-direction: column; height: 100%; }
  header { display: flex; flex-direction: column; }
  main { flex: 1; display: flex; min-height: 0; }
  .canvas { flex: 1; position: relative; min-width: 0; }
  aside { width: 320px; display: flex; flex-direction: column; border-left: 1px solid var(--hair); background: var(--s1); }
  .tabs { display: flex; border-bottom: 1px solid var(--hair); }
  .tabs button { flex: 1; border: none; border-radius: 0; background: transparent; color: var(--dim); padding: 8px; border-bottom: 2px solid transparent; }
  .tabs button.active { color: var(--text); border-bottom-color: var(--accent); }
  .tabs b { font-size: 9.5px; margin-left: 4px; padding: 0 4px; border-radius: 3px; }
  .tabs b.e { background: var(--err); color: #fff; } .tabs b.w { background: var(--warn); color: #000; }
  .scroll { flex: 1; overflow: auto; }
  .dir { font-size: 9.5px; color: var(--dim); padding: 6px 12px; border-top: 1px solid var(--hair); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; }
  .title { position: absolute; top: 10px; left: 12px; z-index: 5; pointer-events: none; max-width: 420px; }
  .title b { display: block; font-size: 14px; } .title span { display: block; font-size: 11.5px; color: var(--muted); margin-top: 2px; line-height: 1.4; }
  .banner { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 6; background: var(--s2); border: 1px solid var(--warn); border-radius: 6px; padding: 8px 12px; font-size: 12px; display: flex; gap: 8px; align-items: center; }
  .banner.err { border-color: var(--err); }
</style>
