<script lang="ts">
  import { EDGE_KINDS } from '@dgv/core';
  import EdgeGlyph from '../kit/EdgeGlyph.svelte';
  let { value = 'sync', onchange }: { value?: string; onchange: (k: string) => void } = $props();
</script>

<div class="kinds">
  {#each Object.entries(EDGE_KINDS) as [k, v]}
    <button class="k" class:on={value === k} onclick={() => onchange(k)} data-tip={v.hint}>
      <EdgeGlyph kind={k} w={28} color={value === k ? 'var(--accent)' : '#a8a8a8'} />
      <span>{v.label}</span>
    </button>
  {/each}
</div>

<style>
  .kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
  .k { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 2px; font-size: 9px; letter-spacing: .04em; color: var(--muted); }
  .k.on { color: var(--accent); border-color: var(--accent); }
</style>
