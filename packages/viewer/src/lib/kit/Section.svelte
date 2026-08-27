<script lang="ts">
  import type { Snippet } from 'svelte';
  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<div class="sec">
  <div class="lbl">{label}</div>
  {@render children()}
</div>

<style>
  /* `.sec + .sec` was pruned by Svelte's scoped-CSS pass: each Section renders
     ONE .sec, so the compiler never sees a sibling and drops the rule as
     unused. The separator has always been missing. :global() keeps it, and the
     selector is still confined to adjacent Sections. */
  .sec:global(+ .sec) { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--hair); }
  /* A heading must sit nearer the rows it introduces than the rows above it,
     or it reads as a caption on the previous group. */
  .lbl { font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); margin-bottom: 10px; }
</style>
