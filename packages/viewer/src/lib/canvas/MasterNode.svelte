<script lang="ts">
  // A folded frame, standing in for everything inside it.
  //
  // It has to read as a node — something a wire can land on — while still
  // saying "there is a group in here". The two offset plates behind the card
  // carry that: a card with depth, rather than a card with a badge on it.
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import KindGlyph from '../kit/KindGlyph.svelte';
  import { hl } from '../stores/hl.svelte';
  import { dg } from '../stores/diagram.svelte';
  import type { NodeData } from '../model/flow';

  let { id, data, selected }: NodeProps & { data: NodeData } = $props();
  const tones: Record<string, string> = { neutral: '#8a8580', amber: '#e8873a', cyan: '#5ec8d8', violet: '#c98cff', green: '#4ec9a5', rose: '#e86a8f' };

  const m = $derived(data.master!);
  const tone = $derived(tones[m.tone] ?? tones.neutral);
  const dim = $derived(hl.neighbors ? !hl.neighbors.has(id) : false);
  const active = $derived(hl.activeId === id);

  // The card answers for its members, so it carries their worst problem too —
  // folding a frame must not hide the fact that something inside it is wrong.
  const problem = $derived.by(() => {
    let worst: 'error' | 'warning' | undefined = dg.problemIds.get(id);
    for (const mid of m.members) {
      const p = dg.problemIds.get(mid);
      if (p === 'error') return 'error';
      if (p) worst ??= p;
    }
    return worst;
  });

  // "4 nodes · 2 frames", and nothing at all when it is empty.
  const inside = $derived([
    m.nodes ? `${m.nodes} node${m.nodes > 1 ? 's' : ''}` : '',
    m.frames ? `${m.frames} frame${m.frames > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ') || 'empty');
</script>

<div class="master" class:dim class:active class:selected class:flash={hl.flash === id} style="--tone:{tone}">
  <i class="plate p2"></i>
  <i class="plate p1"></i>

  <div class="card">
    {#if problem}<div class="probbar {problem}"></div>{/if}
    <Handle type="target" id="in" position={Position.Left} class="hdl" />
    <Handle type="source" id="out" position={Position.Right} class="hdl" />

    <div class="row">
      <span class="tag">group</span>
      <span class="inside">{inside}</span>
      <button
        class="unfold nodrag nopan"
        onclick={(e) => { e.stopPropagation(); dg.setCollapsed(id, false); }}
        data-tip="unfold this group"
        aria-label="unfold {data.label}"
      >⤢</button>
    </div>

    <div class="label">{data.label}</div>

    {#if m.kinds.length}
      <div class="kinds">
        {#each m.kinds.slice(0, 5) as k (k.kind)}
          <span class="chip"><KindGlyph kind={k.kind} w={18} h={11} />{#if k.n > 1}<em>{k.n}</em>{/if}</span>
        {/each}
        {#if m.kinds.length > 5}<span class="more">+{m.kinds.length - 5}</span>{/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .master { position: relative; width: 260px; cursor: grab; transition: opacity .15s ease; }
  .master.dim { opacity: .38; }

  /* Two plates peeking out behind, offset down-right: the group has thickness.
     They are the only decoration here, and they are load-bearing — without
     them a folded frame is indistinguishable from an ordinary card. */
  .plate { position: absolute; left: 0; right: 0; top: 0; bottom: 0; border-radius: 7px; border: 1px solid var(--hair2); background: var(--bg); }
  .p1 { transform: translate(4px, 4px); }
  .p2 { transform: translate(8px, 8px); opacity: .55; }

  .card { position: relative; padding: 11px 12px 10px; border-radius: 7px; border: 1px solid var(--tone); background: var(--s1); }
  .master.active .card { box-shadow: 0 0 0 1px var(--tone); }
  .master.selected .card { border-color: var(--accent); }
  .master.flash { animation: pulse .9s ease-out; }
  @keyframes pulse { 0% { filter: brightness(1.8); } 100% { filter: brightness(1); } }

  .probbar { position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px; border-radius: 2px; }
  .probbar.error { background: var(--err); } .probbar.warning { background: var(--warn); }

  .row { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
  .tag { font-family: var(--mono); font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--tone); }
  .inside { font-family: var(--mono); font-size: 9.5px; color: var(--dim); }
  /* Pushed to the far edge and only inked on hover: the way back out should be
     there when wanted and quiet the rest of the time. */
  .unfold { margin-left: auto; padding: 0 4px; background: transparent; border: none; color: var(--dim); font-size: 12px; line-height: 1; opacity: 0; transition: opacity .12s, color .12s; }
  .master:hover .unfold { opacity: 1; }
  .unfold:hover { color: var(--text); }

  .label { font-size: 13.5px; font-weight: 650; line-height: 1.2; color: var(--text); }

  .kinds { display: flex; align-items: center; gap: 6px; margin-top: 7px; }
  .chip { display: inline-flex; align-items: center; gap: 3px; }
  .chip em { font-style: normal; font-family: var(--mono); font-size: 9px; color: var(--dim); }
  .more { font-family: var(--mono); font-size: 9px; color: var(--dim); }

  :global(.svelte-flow__node-master .hdl) { width: 9px; height: 9px; background: var(--tone); border: 2px solid var(--bg); opacity: 0; transition: opacity .12s; }
  :global(.svelte-flow__node-master:hover .hdl) { opacity: 1; }
</style>
