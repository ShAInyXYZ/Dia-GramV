<script lang="ts">
  import { NODE_KINDS, EDGE_KINDS, STATUSES } from '@dgv/core';
  import { hl } from '../stores/hl.svelte';
  import { dg } from '../stores/diagram.svelte';
  const kinds = $derived([...new Set(dg.nodes.filter((n) => n.type === 'dgv').map((n) => (n.data as any).kind))].filter((k) => NODE_KINDS[k]));
  const edgeKinds = $derived([...new Set(dg.edges.map((e) => e.data?.kind ?? 'sync'))]);
  const dash: Record<string, string> = { sync: '', async: '7 5', data: '2 4', deploy: '12 6', control: '8 4 2 4', import: '' };
</script>

<div class="legend">
  {#if hl.colorBy === 'status'}
    {#each Object.entries(STATUSES) as [k, v]}<span class="it"><i style="background:{v.color}"></i>{v.label}</span>{/each}
  {:else}
    {#each kinds as k}<span class="it"><i style="background:{NODE_KINDS[k].color}"></i>{NODE_KINDS[k].label}</span>{/each}
  {/if}
  {#if edgeKinds.length}<span class="sep"></span>{/if}
  {#each edgeKinds as k}<span class="it"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#a49e95" stroke-width={k === 'import' ? 1 : 1.5} stroke-dasharray={dash[k]} /></svg>{EDGE_KINDS[k]?.label ?? k}</span>{/each}
</div>

<style>
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 6px 12px; font-family: var(--mono); font-size: 10px; color: var(--muted); background: var(--s1); border-top: 1px solid var(--hair); }
  .it { display: inline-flex; align-items: center; gap: 5px; }
  .it i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .sep { width: 1px; background: var(--hair2); }
</style>
