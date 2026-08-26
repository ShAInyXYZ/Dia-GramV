<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import { NODE_KINDS, STATUSES } from '@dgv/core';
  import Shape from './Shape.svelte';
  import { hl } from '../stores/hl.svelte';
  import { dg, accentOf } from '../stores/diagram.svelte';
  import type { NodeData } from '../model/flow';

  let { id, data, selected }: NodeProps & { data: NodeData } = $props();
  let w = $state(260), h = $state(80);

  const kind = $derived(NODE_KINDS[data.kind] ?? { shape: 'rect', color: '#8a8580', label: data.kind });
  const accent = $derived(accentOf(data));
  const dim = $derived(hl.neighbors ? !hl.neighbors.has(id) : false);
  const active = $derived(hl.activeId === id);
  const problem = $derived(dg.problemIds.get(id));
  const pad = $derived(({ cylinder: '18px 14px 14px', hexagon: '10px 22px', skew: '10px 22px 10px 26px', diamond: '10px 18px', window: '26px 12px 10px', tab: '16px 12px 10px', folder: '18px 12px 10px', terminal: '22px 12px 10px' } as Record<string, string>)[kind.shape] ?? '10px 12px');
</script>

<div class="card" class:dim class:active class:selected style="--accent:{accent}; padding:{pad}" bind:clientWidth={w} bind:clientHeight={h}>
  <Shape shape={kind.shape} {w} {h} color={accent} {dim} />
  <Handle type="target" position={Position.Left} class="hdl" />
  <Handle type="source" position={Position.Right} class="hdl" />
  <div class="body">
    <div class="row">
      <span class="kind">{kind.label}</span>
      {#if data.tech}<span class="tech">{data.tech}</span>{/if}
      {#if data.status}<span class="status" style="--sc:{STATUSES[data.status]?.color}">{data.status}</span>{/if}
      {#if problem}<span class="prob {problem}" title="has {problem}s">●</span>{/if}
    </div>
    <div class="label">{data.label}</div>
    {#if data.sublabel}<div class="sub">{data.sublabel}</div>{/if}
    {#if data.ports?.length}
      <div class="ports">
        {#each data.ports as p (p.id)}
          <span class="port" class:out={p.dir === 'out'} title={p.shape ?? ''}>{p.dir === 'out' ? '↗' : '↘'} {p.id}{#if p.protocol}<em>:{p.protocol}</em>{/if}</span>
        {/each}
      </div>
    {/if}
    {#if data.note}<div class="note">{data.note}</div>{/if}
  </div>
</div>

<style>
  .card { position: relative; width: 260px; color: var(--text); transition: opacity .15s ease; cursor: grab; }
  .card.dim { opacity: .38; }
  .card.active :global(.shape path:first-child) { filter: drop-shadow(0 0 6px var(--accent)); }
  .body { position: relative; }
  .row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; min-height: 12px; }
  .kind { font-family: var(--mono); font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); }
  .tech { font-family: var(--mono); font-size: 9.5px; color: var(--dim); }
  .status { margin-left: auto; font-family: var(--mono); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: var(--sc); border: 1px solid var(--sc); border-radius: 3px; padding: 0 4px; opacity: .9; }
  .prob { font-size: 9px; margin-left: 2px; }
  .prob.error { color: var(--err); } .prob.warning { color: var(--warn); }
  .label { font-size: 13.5px; font-weight: 650; line-height: 1.2; }
  .sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
  .ports { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
  .port { font-family: var(--mono); font-size: 9.5px; color: var(--muted); background: var(--s1); border: 1px solid var(--hair); border-radius: 3px; padding: 1px 5px; }
  .port.out { border-style: dashed; }
  .port em { font-style: normal; color: var(--dim); }
  .note { font-size: 10.5px; color: var(--dim); margin-top: 7px; line-height: 1.45; white-space: pre-wrap; }
  :global(.svelte-flow__node-dgv .hdl) { width: 9px; height: 9px; background: var(--accent); border: 2px solid var(--bg); opacity: 0; transition: opacity .12s; }
  :global(.svelte-flow__node-dgv:hover .hdl) { opacity: 1; }
</style>
