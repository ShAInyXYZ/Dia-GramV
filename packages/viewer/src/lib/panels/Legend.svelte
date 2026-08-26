<script lang="ts">
  // Key to the diagram, grouped the way the catalog groups kinds; hover an entry
  // to spotlight it on the canvas, click to pin the spotlight. Lives top-left,
  // under the bar — Svelte Flow's controls (bottom-left) and minimap (bottom-right) stay clear.
  import { NODE_KINDS, EDGE_KINDS, STATUSES } from '@dgv/core';
  import FloatPanel from '../kit/FloatPanel.svelte';
  import Section from '../kit/Section.svelte';
  import KindGlyph from '../kit/KindGlyph.svelte';
  import EdgeGlyph from '../kit/EdgeGlyph.svelte';
  import { hl } from '../stores/hl.svelte';
  import { dg } from '../stores/diagram.svelte';

  let open = $state((() => { try { return localStorage.getItem('dgv.legend') !== 'closed'; } catch { return true; } })());
  $effect(() => { try { localStorage.setItem('dgv.legend', open ? 'open' : 'closed'); } catch {} });

  const GROUPS: { label: string; roles: string[] }[] = [
    { label: 'Clients', roles: ['client'] },
    { label: 'Compute', roles: ['compute'] },
    { label: 'Interfaces', roles: ['iface', 'code', 'adapter'] },
    { label: 'Data', roles: ['store', 'broker'] },
    { label: 'Outside', roles: ['external', 'infra'] },
  ];
  const present = $derived(new Set(dg.nodes.filter((n) => n.type === 'dgv').map((n) => (n.data as any).kind as string)));
  const groups = $derived(GROUPS.map((g) => ({ ...g, kinds: Object.keys(NODE_KINDS).filter((k) => present.has(k) && g.roles.includes(NODE_KINDS[k].role)) })).filter((g) => g.kinds.length));
  const edgeKinds = $derived(Object.keys(EDGE_KINDS).filter((k) => dg.edges.some((e) => (e.data?.kind ?? 'sync') === k)));
  const statuses = $derived(Object.keys(STATUSES).filter((s) => dg.nodes.some((n) => (n.data as any).status === s)));
  const count = (k: string) => dg.nodes.filter((n) => (n.data as any).kind === k).length;

  // spotlight: hover previews, click pins (click again to unpin)
  let pinned = $state<{ kind?: string; edge?: string } | null>(null);
  const hover = (f: { kind?: string; edge?: string } | null) => { if (!pinned) { hl.kindFilter = f?.kind ?? null; hl.edgeFilter = f?.edge ?? null; } };
  const pin = (f: { kind?: string; edge?: string }) => {
    pinned = pinned && pinned.kind === f.kind && pinned.edge === f.edge ? null : f;
    hl.kindFilter = pinned?.kind ?? null; hl.edgeFilter = pinned?.edge ?? null;
  };
</script>

<FloatPanel title="Key" bind:open corner="top-left" width={250}>
  {#each groups as g (g.label)}
    <Section label={g.label}>
      <div class="rows">
        {#each g.kinds as k (k)}
          <button class="row" class:pin={pinned?.kind === k} onmouseenter={() => hover({ kind: k })} onmouseleave={() => hover(null)} onclick={() => pin({ kind: k })} data-tip={NODE_KINDS[k].hint}>
            <KindGlyph kind={k} />
            <span class="name" style="color:{NODE_KINDS[k].color}">{NODE_KINDS[k].label}</span>
            <span class="n">{count(k)}</span>
          </button>
        {/each}
      </div>
    </Section>
  {/each}
  {#if edgeKinds.length}
    <Section label="Links">
      <div class="rows">
        {#each edgeKinds as k (k)}
          <button class="row" class:pin={pinned?.edge === k} onmouseenter={() => hover({ edge: k })} onmouseleave={() => hover(null)} onclick={() => pin({ edge: k })} data-tip={EDGE_KINDS[k].hint}>
            <EdgeGlyph kind={k} />
            <span class="name">{EDGE_KINDS[k].label}</span>
          </button>
        {/each}
      </div>
    </Section>
  {/if}
  {#if hl.colorBy === 'status' && statuses.length}
    <Section label="Build status">
      <div class="rows">
        {#each statuses as s (s)}<div class="row static"><i class="sw" style="background:{STATUSES[s].color}"></i><span class="name">{STATUSES[s].label}</span></div>{/each}
      </div>
    </Section>
  {/if}
  {#if !groups.length}<div class="empty">nothing on the canvas yet</div>{/if}
</FloatPanel>

<style>
  .rows { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
  .row { display: flex; align-items: center; gap: 7px; width: 100%; padding: 3px 5px; background: transparent; border: 1px solid transparent; border-radius: 4px; font-family: var(--mono); font-size: 10.5px; color: var(--muted); text-align: left; }
  .row:hover { background: var(--s2); border-color: var(--hair); }
  .row.pin { border-color: var(--accent); }
  .row.static { cursor: default; } .row.static:hover { background: transparent; border-color: transparent; }
  .name { flex: 1; letter-spacing: .04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { color: var(--dim); font-size: 9.5px; }
  .sw { width: 34px; height: 8px; border-radius: 2px; display: inline-block; flex: none; }
  .empty { font-size: 11px; color: var(--dim); padding: 4px; }
</style>
