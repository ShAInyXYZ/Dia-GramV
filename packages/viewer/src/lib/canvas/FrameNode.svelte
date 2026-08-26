<script lang="ts">
  import { NodeResizer, type NodeProps } from '@xyflow/svelte';
  import { dg } from '../stores/diagram.svelte';
  import type { FrameData } from '../model/flow';

  let { id, data, selected }: NodeProps & { data: FrameData } = $props();
  const tones: Record<string, string> = { neutral: '#8a8580', amber: '#e8873a', cyan: '#5ec8d8', violet: '#c98cff', green: '#4ec9a5', rose: '#e86a8f' };
  const tone = $derived(tones[data.tone ?? 'neutral'] ?? tones.neutral);
  const problem = $derived(dg.problemIds.get(id));
</script>

<NodeResizer minWidth={200} minHeight={120} isVisible={selected} color="var(--accent)" onResizeEnd={() => { dg.refit(); dg.touch(); }} />
<div class="frame" style="--tone:{tone}">
  <div class="frame-label">{data.label}{#if problem}<span class="prob {problem}">●</span>{/if}</div>
  {#if data.note}<div class="frame-note">{data.note}</div>{/if}
</div>

<style>
  .frame { width: 100%; height: 100%; border: 1px dashed color-mix(in srgb, var(--tone) 55%, var(--hair2)); border-radius: 12px; background: color-mix(in srgb, var(--tone) 4%, transparent); }
  .frame-label { position: absolute; top: -10px; left: 14px; padding: 1px 10px; background: var(--bg); color: var(--tone); font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
  .frame-note { position: absolute; top: 12px; left: 16px; right: 16px; font-size: 10.5px; color: var(--dim); }
  .prob { margin-left: 6px; font-size: 9px; } .prob.error { color: var(--err); } .prob.warning { color: var(--warn); }
</style>
