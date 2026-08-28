<script lang="ts">
  // What changed, on which element, by whom. A pill at the bottom centre of
  // the canvas — the one edge nothing else uses — that opens upward into the
  // list. Grouped by element: the question it answers is "what happened to
  // this node", not "what happened at 14:02".
  import { useSvelteFlow } from '@xyflow/svelte';
  import { describeChange, kindColor } from '@dgv/core';
  import Icon from '../kit/Icon.svelte';
  import { dg, type HistEntry } from '../stores/diagram.svelte';
  import { flash } from '../stores/hl.svelte';
  import { ui } from '../stores/ui.svelte';
  import { ago } from '../time';

  const flow = useSvelteFlow();
  const tones: Record<string, string> = { neutral: '#8a8580', amber: '#e8873a', cyan: '#5ec8d8', violet: '#c98cff', green: '#4ec9a5', rose: '#e86a8f' };
  let mode = $state<'element' | 'time'>('element');
  let expanded = $state<string | null>(null);
  // Re-render the relative times now and then; the entries themselves do not change.
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 30_000); return () => clearInterval(t); });

  const open = $derived(ui.historyOpen);
  $effect(() => { if (open) dg.markHistorySeen(); });

  type Group = { key: string; type: string; id: string; label: string; kind?: string; gone: boolean; entries: HistEntry[]; last: string; unread: number };
  const groups = $derived.by<Group[]>(() => {
    const m = new Map<string, Group>();
    for (const e of dg.history) {
      const key = `${e.type}:${e.id}`;
      let g = m.get(key);
      if (!g) { g = { key, type: e.type, id: e.id, label: '', kind: e.kind, gone: false, entries: [], last: e.at, unread: 0 }; m.set(key, g); }
      g.entries.push(e); g.last = e.at;
      if (e.kind) g.kind = e.kind;
      if (dg.isNew(e)) g.unread++;
    }
    for (const g of m.values()) {
      const live = liveOf(g.type, g.id);
      g.gone = !live && g.type !== 'meta';
      let seen = '';
      for (const e of g.entries) if (e.label) seen = e.label;
      g.label = live?.label ?? (seen || (g.type === 'meta' ? dg.meta?.title ?? 'diagram' : ''));
      g.kind = live?.kind ?? g.kind;
      g.entries.reverse();
    }
    return [...m.values()].sort((a, b) => (b.last > a.last ? 1 : b.last < a.last ? -1 : 0));
  });
  const timeline = $derived([...dg.history].reverse());
  const last = $derived(dg.history[dg.history.length - 1]);

  function liveOf(type: string, id: string): { label: string; kind?: string; tone?: string } | null {
    if (type === 'edge') { const e = dg.edge(id); return e ? { label: `${e.source} → ${e.target}` } : null; }
    const n = dg.node(id); if (!n) return null;
    const d = n.data as any;
    return { label: d.label, kind: d.kind, tone: d.tone };
  }
  const dotOf = (g: Group) => g.type === 'node' && g.kind ? kindColor(g.kind) : g.type === 'frame' ? tones[liveOf('frame', g.id)?.tone ?? 'neutral'] : 'var(--hair2)';
  const who = (by: string) => (by === 'viewer' ? 'you' : by);

  function go(type: string, id: string) {
    if (type === 'meta') return;
    if (type === 'edge') { const e = dg.edge(id); if (!e) return; flash(id); dg.select({ type: 'edge', id }); flow.fitView({ nodes: [{ id: e.source }, { id: e.target }], duration: 300, maxZoom: 1 }); return; }
    const n = dg.node(id); if (!n) return;
    flash(id); dg.select({ type: n.type === 'frame' ? 'frame' : 'node', id });
    flow.fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.1 });
  }
  function pick(g: Group) { expanded = expanded === g.key ? null : g.key; if (!g.gone) go(g.type, g.id); }
</script>

{#if dg.name}
  <div class="hist" class:open>
    {#if open}
      <div class="drop" role="dialog" aria-label="change history">
        <div class="head">
          <span class="count">{dg.history.length} change{dg.history.length === 1 ? '' : 's'}</span>
          {#if last}<span class="lastc">· last {ago(last.at, now)} by {who(last.by)}</span>{/if}
          <span class="modes">
            <button class:on={mode === 'element'} onclick={() => (mode = 'element')}>by element</button>
            <button class:on={mode === 'time'} onclick={() => (mode = 'time')}>timeline</button>
          </span>
        </div>
        <div class="list">
          {#if !dg.history.length}
            <p class="hint">Nothing on record yet. Every save — yours or the agent's — that changes the architecture lands here. Moving cards does not count.</p>
          {:else if mode === 'element'}
            {#each groups as g (g.key)}
              <button class="row" class:gone={g.gone} class:x={expanded === g.key} onclick={() => pick(g)}>
                <i class="dot" style="background:{dotOf(g)}"></i>
                <span class="id mono">{g.id}</span>
                <span class="lbl">{g.label}{#if g.gone} <em>removed</em>{/if}</span>
                {#if g.unread}<b class="new">{g.unread}</b>{/if}
                <span class="n">{g.entries.length}</span>
                <span class="when">{ago(g.last, now)}</span>
              </button>
              {#if expanded === g.key}
                <div class="entries">
                  {#each g.entries as e}
                    <div class="entry" class:unread={dg.isNew(e)}>
                      <span class="when">{ago(e.at, now)}</span><span class="by">{who(e.by)}</span><span class="what">{describeChange(e)}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            {/each}
          {:else}
            {#each timeline as e, i (e.at + e.type + e.id + e.op + i)}
              <button class="row tl" class:unread={dg.isNew(e)} onclick={() => go(e.type, e.id)}>
                <span class="when">{ago(e.at, now)}</span><span class="by">{who(e.by)}</span>
                <span class="id mono">{e.id}</span>
                <span class="what">{describeChange(e)}</span>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
    <button class="pill" class:on={open} onclick={() => (ui.historyOpen = !ui.historyOpen)} data-tip="what changed, and who changed it (H)" aria-expanded={open}>
      <Icon name="history" size={12} />
      <span>history</span>
      {#if dg.newCount}<b class="new">{dg.newCount} new</b>{:else if dg.history.length}<span class="dim">{dg.history.length}</span>{/if}
    </button>
  </div>
{/if}

<style>
  .hist { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 6; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 8px; border-radius: 14px; background: var(--s1); border: 1px solid var(--hair); color: var(--dim); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; }
  .pill:hover, .pill.on { color: var(--text); border-color: var(--hair2); }
  .pill .dim { font-size: 10px; letter-spacing: 0; }
  .new { font-family: var(--mono); font-size: 9px; letter-spacing: 0; text-transform: none; padding: 0 5px; border-radius: 7px; line-height: 14px; background: var(--accent); color: #0e0e0e; font-weight: 600; }

  .drop { width: min(480px, calc(100vw - 40px)); max-height: 46vh; display: flex; flex-direction: column; background: var(--s1); border: 1px solid var(--hair2); border-radius: 8px; overflow: hidden; }
  .head { display: flex; align-items: baseline; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--hair); font-family: var(--mono); font-size: 10.5px; color: var(--muted); }
  .count { color: var(--text); }
  .lastc { color: var(--dim); }
  .modes { margin-left: auto; display: flex; gap: 2px; }
  .modes button { font-size: 9.5px; padding: 1px 7px; background: transparent; border-color: transparent; color: var(--dim); }
  .modes button.on { color: var(--text); background: var(--s2); border-color: var(--hair); }
  .list { overflow: auto; padding: 4px; }
  .hint { color: var(--dim); font-size: 11.5px; line-height: 1.5; padding: 8px 10px; margin: 0; }

  .row { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 6px 8px; background: transparent; border: 1px solid transparent; border-radius: 5px; font-family: var(--sans); font-size: 11.5px; color: var(--text); }
  .row:hover { background: var(--s2); border-color: var(--hair); }
  .row.x { background: var(--s2); border-color: var(--hair); border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .row.gone .lbl { color: var(--dim); }
  .row .lbl em { font-style: normal; font-family: var(--mono); font-size: 9.5px; color: var(--dim); }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .id { font-size: 11px; flex: none; }
  .lbl { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
  .n { font-family: var(--mono); font-size: 9.5px; color: var(--dim); }
  .when { font-family: var(--mono); font-size: 9.5px; color: var(--dim); flex: none; min-width: 52px; }
  .by { font-family: var(--mono); font-size: 9.5px; color: var(--muted); flex: none; min-width: 38px; }
  .entries { margin: 0 0 4px; padding: 4px 8px 6px 23px; background: var(--s2); border: 1px solid var(--hair); border-top: none; border-radius: 0 0 5px 5px; }
  .entry { display: flex; gap: 10px; align-items: baseline; padding: 3px 0; font-size: 11px; color: var(--muted); border-left: 2px solid transparent; padding-left: 8px; margin-left: -10px; }
  .entry.unread { border-left-color: var(--accent); }
  .entry .what, .tl .what { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
  .tl { font-size: 11px; }
  .tl.unread { border-left: 2px solid var(--accent); }
</style>
