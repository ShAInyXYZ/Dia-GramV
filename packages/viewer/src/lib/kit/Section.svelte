<script lang="ts">
  import type { Snippet } from 'svelte';
  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<div class="sec">
  <div class="lbl">{label}</div>
  {@render children()}
</div>

<style>
  .sec + .sec { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--hair); }
  .lbl { font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); margin-bottom: 5px; }
</style>
