<script lang="ts">
  // The note behind a flag badge, drawn over the canvas in screen space.
  // Opened from a badge (hl.flagOpen carries the anchor); closed by Escape,
  // a click elsewhere, or panning — it belongs to the place it was opened at.
  import { hl } from '../stores/hl.svelte';
  import { dg } from '../stores/diagram.svelte';
  import { ago } from '../time';
  import type { Flag } from '../model/flow';

  let { host }: { host: HTMLElement } = $props();
  const W = 272;
  const anchor = $derived(hl.flagOpen);
  const items = $derived<{ on: string; flag: Flag }[]>(anchor ? dg.flagsFor(anchor.on) : []);
  // Reading the note is what makes it read: the badge stops ringing.
  $effect(() => { for (const i of items) dg.markFlagSeen(i.on, i.flag.id); });
  $effect(() => { if (anchor && !items.length) hl.flagOpen = null; });

  const pos = $derived.by(() => {
    if (!anchor) return null;
    const r = host.getBoundingClientRect();
    const x = Math.min(Math.max(8, anchor.x - r.left - W / 2), r.width - W - 8);
    const y = anchor.y - r.top + 8;
    return { x, y, up: y > r.height * 0.62 };
  });
  const labelOf = (id: string) => { const n = dg.node(id); return n ? (n.data as any).label : (() => { const e = dg.edge(id); return e ? `${e.source} → ${e.target}` : id; })(); };
</script>

{#if anchor && pos && items.length}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="pop" class:up={pos.up} style="left:{pos.x}px; top:{pos.y}px; width:{W}px" onclick={(e) => e.stopPropagation()} onmousedown={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}>
    <div class="head"><span class="on mono">{anchor.on}</span><span class="what">{labelOf(anchor.on)}</span><button class="x" onclick={() => (hl.flagOpen = null)} aria-label="close">×</button></div>
    {#each items as { on, flag } (on + '/' + flag.id)}
      <div class="flag {flag.kind ?? 'issue'}">
        <div class="top">
          <span class="kind">{flag.kind ?? 'issue'}</span>
          {#if on !== anchor.on}<span class="member mono">on {on}</span>{/if}
          <span class="meta">{flag.by === 'viewer' ? 'you' : flag.by ?? 'agent'}{flag.at ? ` · ${ago(flag.at)}` : ''}</span>
        </div>
        <div class="title">{flag.title}</div>
        {#if flag.note}<div class="note">{flag.note}</div>{/if}
        {#if flag.fix}<div class="fix"><span class="arrow">→</span>{flag.fix}</div>{/if}
        <button class="resolve" onclick={() => dg.resolveFlag(on, flag.id)} data-tip="remove the flag — the history keeps it">resolve</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .pop { position: absolute; z-index: 30; background: var(--s1); border: 1px solid var(--hair2); border-radius: 7px; padding: 0 0 4px; font-family: var(--sans); color: var(--text); }
  .pop.up { transform: translateY(calc(-100% - 34px)); }
  .head { display: flex; align-items: baseline; gap: 8px; padding: 8px 10px 6px; border-bottom: 1px solid var(--hair); }
  .on { font-size: 10.5px; color: var(--text); }
  .what { font-size: 10.5px; color: var(--dim); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .x { background: transparent; border: none; color: var(--dim); font-size: 14px; line-height: 1; padding: 0 2px; }
  .x:hover { color: var(--text); }
  .flag { padding: 9px 10px 8px; border-left: 2px solid var(--muted); margin: 6px 6px 2px; background: var(--s2); border-radius: 0 5px 5px 0; }
  .flag.issue { border-left-color: var(--warn); }
  .top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; font-family: var(--mono); font-size: 9.5px; }
  .kind { letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .issue .kind { color: var(--warn); }
  .member { color: var(--dim); }
  .meta { margin-left: auto; color: var(--dim); }
  .title { font-size: 12.5px; font-weight: 600; line-height: 1.3; }
  .note { font-size: 11.5px; color: var(--muted); line-height: 1.45; margin-top: 5px; white-space: pre-wrap; }
  .fix { display: flex; gap: 6px; font-size: 11.5px; color: var(--text); line-height: 1.45; margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--hair); }
  .arrow { color: var(--dim); flex: none; }
  .resolve { margin-top: 8px; font-size: 10.5px; padding: 2px 8px; color: var(--muted); }
  .resolve:hover { color: var(--ok); border-color: var(--ok); }
</style>
