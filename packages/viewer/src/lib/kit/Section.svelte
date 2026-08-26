<script lang="ts">
  import type { Snippet } from 'svelte';
  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<div class="sec">
  <div class="lbl">{label}</div>
  {@render children()}
</div>

<style>
  .sec + .sec { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hair); }
  .lbl { font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); margin-bottom: 8px; }
</style>
