<script lang="ts">
  import { EDGE_KINDS } from '@dgv/core';
  let { value = 'sync', onchange }: { value?: string; onchange: (k: string) => void } = $props();
  const dash: Record<string, string> = { sync: '', async: '7 5', data: '2 4', deploy: '12 6', control: '8 4 2 4', import: '' };
</script>

<div class="kinds">
  {#each Object.entries(EDGE_KINDS) as [k, v]}
    <button class="k" class:on={value === k} onclick={() => onchange(k)} data-tip={v.hint}>
      <svg width="26" height="8"><line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" stroke-width={k === 'import' ? 1 : k === 'data' ? 2 : 1.5} stroke-dasharray={dash[k]} /></svg>
      <span>{v.label}</span>
    </button>
  {/each}
</div>

<style>
  .kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
  .k { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 2px; font-size: 9px; letter-spacing: .04em; color: var(--muted); }
  .k.on { color: var(--accent); border-color: var(--accent); }
</style>
