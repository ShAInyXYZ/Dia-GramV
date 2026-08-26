<script lang="ts">
  import { dg } from '../stores/diagram.svelte';
  let creating = $state(false), name = $state(''), title = $state('');
  async function create() {
    const n = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-'); if (!n) return;
    await dg.create(n, title.trim() || n); creating = false; name = ''; title = '';
  }
</script>

<div class="picker">
  <div class="brand"><span class="logo">◈</span> Dia-GramV</div>
  <select value={dg.name ?? ''} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v === '__new') creating = true; else if (v) dg.open(v); }}>
    {#if !dg.name}<option value="">choose a diagram…</option>{/if}
    {#each dg.list as d}<option value={d.name}>{d.title ?? d.name} · {d.nodes}n {d.edges}e</option>{/each}
    <option value="__new">+ new diagram</option>
  </select>
  {#if creating}
    <div class="new">
      <input placeholder="file name (my-app)" bind:value={name} />
      <input placeholder="title" bind:value={title} onkeydown={(e) => e.key === 'Enter' && create()} />
      <button class="primary" onclick={create}>create</button><button onclick={() => (creating = false)}>cancel</button>
    </div>
  {/if}
</div>

<style>
  .picker { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--hair); background: var(--s1); }
  .brand { font-family: var(--mono); font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
  .logo { color: var(--accent); }
  select { max-width: 360px; font-family: var(--mono); font-size: 11.5px; }
  .new { display: flex; gap: 6px; align-items: center; } .new input { width: 160px; }
</style>
