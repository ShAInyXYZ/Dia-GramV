<script lang="ts">
  // A line sample with the edge kind's dash pattern and the same arrowhead the canvas draws.
  let { kind = 'sync', w = 34, color = '#a49e95' }: { kind?: string; w?: number; color?: string } = $props();
  const dash: Record<string, string> = { sync: '', async: '7 5', data: '2 4', deploy: '12 6', control: '8 4 2 4', import: '' };
  const width = $derived(kind === 'import' ? 1 : kind === 'data' ? 2 : 1.5);
</script>

<svg class="e" width={w} height="10" viewBox="0 0 {w} 10" aria-hidden="true">
  <line x1="0" y1="5" x2={w - 8} y2="5" stroke={color} stroke-width={width} stroke-dasharray={dash[kind] ?? ''} />
  <polygon points="{w},5 {w - 8},1.5 {w - 8},8.5" fill={color} />
</svg>

<style>
  .e { flex: none; display: inline-block; }
</style>
