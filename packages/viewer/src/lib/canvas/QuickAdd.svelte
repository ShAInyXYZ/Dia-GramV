<script lang="ts">
  // Quick-add popover at the cursor: type to filter kinds, Enter to place.
  import { NODE_KINDS } from '@dgv/core';
  import Shape from './Shape.svelte';
  let { at, onpick, onclose }: { at: { x: number; y: number }; onpick: (kind: string) => void; onclose: () => void } = $props();
  let q = $state(''), idx = $state(0), input = $state<HTMLInputElement | null>(null);
  const items = $derived(Object.entries(NODE_KINDS).filter(([k, v]) => !q || k.includes(q.toLowerCase()) || v.label.toLowerCase().includes(q.toLowerCase()) || v.hint.toLowerCase().includes(q.toLowerCase())));
  $effect(() => { input?.focus(); });
  $effect(() => { q; idx = 0; });
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onclose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[idx]) onpick(items[idx][0]); }
    e.stopPropagation();
  }
  // keep the popover on screen
  const left = $derived(Math.min(at.x, window.innerWidth - 300));
  const top = $derived(Math.min(at.y, window.innerHeight - 380));
</script>

<div class="qa nodrag nopan" style="left:{left}px; top:{top}px" role="dialog" onkeydown={key}>
  <input bind:this={input} bind:value={q} placeholder="add a node… (type to filter)" />
  <div class="list">
    {#each items as [k, v], i (k)}
      <button class="it" class:on={i === idx} onmouseenter={() => (idx = i)} onclick={() => onpick(k)}>
        <span class="glyph"><Shape shape={v.shape} w={34} h={20} color={v.color} /></span>
        <span class="name" style="color:{v.color}">{v.label}</span>
        <span class="hint">{v.hint}</span>
      </button>
    {/each}
    {#if !items.length}<div class="none">no kind matches "{q}"</div>{/if}
  </div>
</div>

<style>
  .qa { position: fixed; z-index: 50; width: 300px; background: var(--s1); border: 1px solid var(--hair2); border-radius: 8px; padding: 6px; }
  input { margin-bottom: 6px; }
  .list { max-height: 330px; overflow: auto; }
  .it { display: grid; grid-template-columns: 38px 1fr; column-gap: 8px; width: 100%; text-align: left; background: transparent; border: 1px solid transparent; padding: 5px 6px; border-radius: 5px; }
  .it.on { background: var(--s2); border-color: var(--hair); }
  .glyph { position: relative; width: 34px; height: 20px; grid-row: 1 / 3; align-self: center; }
  .name { font-family: var(--mono); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
  .hint { font-size: 10.5px; color: var(--dim); line-height: 1.3; }
  .none { color: var(--dim); font-size: 11px; padding: 8px; }
</style>
