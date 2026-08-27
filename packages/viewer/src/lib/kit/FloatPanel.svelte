<script lang="ts">
  // A floating panel over the canvas: a header that collapses to a pill, a body when open.
  // Positioned by the caller via `corner`; never sits where Svelte Flow puts its own controls.
  import type { Snippet } from 'svelte';
  let { title, open = $bindable(true), corner = 'top-left', width = 260, children }:
    { title: string; open?: boolean; corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; width?: number; children: Snippet } = $props();
</script>

<section class="fp {corner}" class:open style="--w:{width}px">
  <button class="head" onclick={() => (open = !open)} aria-expanded={open}>
    <span class="chev">{open ? '▾' : '▸'}</span><span class="title">{title}</span>
  </button>
  {#if open}<div class="body">{@render children()}</div>{/if}
</section>

<style>
  .fp { position: absolute; z-index: 5; background: var(--s1); border: 1px solid var(--hair); border-radius: 7px; font-family: var(--mono); color: var(--muted); }
  /* A definite width, because the body lays out on a grid: equal tracks need a
     container to divide, and max-content would collapse each track to its own
     widest cell and leave the columns misaligned. --w is therefore the size,
     kept small enough that the panel does not cover the canvas it floats on. */
  .fp.open { width: var(--w); }
  .fp.top-left { top: 12px; left: 12px; }
  .fp.top-right { top: 12px; right: 12px; }
  .fp.bottom-left { bottom: 12px; left: 12px; }
  .fp.bottom-right { bottom: 12px; right: 12px; }
  .head { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: transparent; border: none; padding: 8px 12px; color: var(--dim); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
  .head:hover { color: var(--text); }
  .chev { width: 8px; }
  .open .head { border-bottom: 1px solid var(--hair); }
  .body { padding: 10px 12px 14px; max-height: min(64vh, 560px); overflow: auto; }
</style>
