<script lang="ts">
  // The real node shape at swatch size, in the kind's colour — so a legend entry looks like the card it explains.
  import { NODE_KINDS } from '@dgv/core';
  import Shape from '../canvas/Shape.svelte';
  let { kind, w = 34, h = 20, color }: { kind: string; w?: number; h?: number; color?: string } = $props();
  const k = $derived(NODE_KINDS[kind] ?? { shape: 'rect', color: '#8a8580' });
</script>

<span class="g" style="width:{w}px;height:{h}px"><Shape shape={k.shape} {w} {h} color={color ?? k.color} /></span>

<style>
  .g { position: relative; display: inline-block; flex: none; }
</style>
