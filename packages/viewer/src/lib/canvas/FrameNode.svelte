<script lang="ts">
  import { NodeResizer, type NodeProps } from '@xyflow/svelte';
  import { dg } from '../stores/diagram.svelte';
  import { hl } from '../stores/hl.svelte';
  import type { FrameData } from '../model/flow';
  import FlagBadge from './FlagBadge.svelte';

  let { id, data, selected }: NodeProps & { data: FrameData } = $props();
  const tones: Record<string, string> = { neutral: '#8a8580', amber: '#e8873a', cyan: '#5ec8d8', violet: '#c98cff', green: '#4ec9a5', rose: '#e86a8f' };
  const tone = $derived(tones[data.tone ?? 'neutral'] ?? tones.neutral);
  const problem = $derived(dg.problemIds.get(id));
  const drop = $derived(hl.dropFrame === id);
  const flags = $derived((data.flags ?? []).map((f) => ({ on: id, flag: f })));

  // inline rename: double-click the label
  let editing = $state(false), draft = $state('');
  function start(e: MouseEvent) { e.stopPropagation(); draft = data.label; editing = true; }
  function commit() { if (editing) { const v = draft.trim(); if (v && v !== data.label) dg.updateData(id, { label: v }); editing = false; } }
</script>

<NodeResizer minWidth={200} minHeight={120} isVisible={selected} color="var(--accent)" onResizeEnd={() => { dg.refit(); dg.touch(); }} />
<div class="frame" class:drop style="--tone:{tone}">
  {#if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <input class="frame-edit nodrag nopan" bind:value={draft} autofocus onblur={commit} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') editing = false; }} />
  {:else}
    <div class="frame-label" ondblclick={start} role="heading" aria-level="3">
      <button class="fold nodrag nopan" onclick={(e) => { e.stopPropagation(); dg.setCollapsed(id, true); }} data-tip="fold into one node" aria-label="fold {data.label}">⤡</button>
      {data.label}{#if problem}<span class="prob {problem}">●</span>{/if}
      {#if flags.length}<FlagBadge on={id} items={flags} small />{/if}
    </div>
  {/if}
  {#if data.note}<div class="frame-note">{data.note}</div>{/if}
</div>

<style>
  .frame { width: 100%; height: 100%; border: 1px dashed var(--hair2); border-radius: 12px; background: color-mix(in srgb, var(--tone) 3%, transparent); transition: border-color .12s, background .12s; }
  .frame.drop { border-color: var(--accent); border-style: solid; background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .frame-label { position: absolute; top: -10px; left: 14px; display: flex; align-items: center; gap: 6px; padding: 1px 10px; background: var(--bg); color: var(--tone); font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; cursor: text; }
  /* Only inked on hover: a frame's job is to be a quiet boundary, and a
     permanent button on every one of them would out-shout the labels. */
  .fold { padding: 0; background: transparent; border: none; color: inherit; font-size: 11px; line-height: 1; opacity: 0; transition: opacity .12s; }
  .frame:hover .fold, .fold:focus-visible { opacity: .7; }
  .fold:hover { opacity: 1; }
  .frame-edit { position: absolute; top: -13px; left: 14px; width: 220px; padding: 2px 8px; font-family: var(--mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; background: var(--bg); }
  .frame-note { position: absolute; top: 12px; left: 16px; right: 16px; font-size: 10.5px; color: var(--dim); }
  .prob { margin-left: 6px; font-size: 9px; } .prob.error { color: var(--err); } .prob.warning { color: var(--warn); }
</style>
