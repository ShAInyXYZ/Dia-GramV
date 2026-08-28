<script lang="ts">
  // The inspector's view of an element's flags: read them, resolve them, and
  // raise one by hand — a person can see an incoherence the agent missed.
  import { dg } from '../stores/diagram.svelte';
  import { ago } from '../time';

  let { on }: { on: string } = $props();
  const items = $derived(dg.flagsFor(on).filter((i) => i.on === on));
  let adding = $state(false), title = $state(''), kind = $state<'issue' | 'idea' | 'question'>('issue'), fix = $state('');
  function add() {
    const t = title.trim(); if (!t) return;
    dg.addFlag(on, { title: t, kind, fix: fix.trim() || undefined });
    adding = false; title = ''; fix = ''; kind = 'issue';
  }
</script>

<label class="f">flags <button class="mini" onclick={() => (adding = !adding)}>{adding ? 'cancel' : '+ flag'}</button></label>
{#if adding}
  <div class="form">
    <input placeholder="what is wrong — one line" bind:value={title} onkeydown={(e) => e.key === 'Enter' && add()} />
    <div class="two">
      <select bind:value={kind}><option value="issue">issue</option><option value="idea">idea</option><option value="question">question</option></select>
      <button class="primary" onclick={add} disabled={!title.trim()}>raise</button>
    </div>
    <input placeholder="the fix, if you know it" bind:value={fix} onkeydown={(e) => e.key === 'Enter' && add()} />
  </div>
{/if}
{#each items as { flag } (flag.id)}
  <div class="flag {flag.kind ?? 'issue'}">
    <div class="top"><span class="kind">{flag.kind ?? 'issue'}</span><span class="meta">{flag.by === 'viewer' ? 'you' : flag.by ?? 'agent'}{flag.at ? ` · ${ago(flag.at)}` : ''}</span></div>
    <div class="title">{flag.title}</div>
    {#if flag.note}<div class="note">{flag.note}</div>{/if}
    {#if flag.fix}<div class="fix">→ {flag.fix}</div>{/if}
    <button class="resolve" onclick={() => dg.resolveFlag(on, flag.id)}>resolve</button>
  </div>
{/each}
{#if !items.length && !adding}<p class="none">none — the graph may lint clean and still be wrong; a flag pins that judgement here</p>{/if}

<style>
  .mini { font-size: 10px; padding: 0 6px; margin-left: 6px; text-transform: none; letter-spacing: 0; }
  .form { display: grid; gap: 4px; padding: 6px; margin-bottom: 6px; background: var(--s2); border: 1px solid var(--hair); border-radius: 5px; }
  .two { display: grid; grid-template-columns: 1fr auto; gap: 4px; }
  .flag { padding: 7px 8px 6px; margin-bottom: 6px; background: var(--s2); border: 1px solid var(--hair); border-left: 2px solid var(--muted); border-radius: 0 5px 5px 0; }
  .flag.issue { border-left-color: var(--warn); }
  .top { display: flex; font-family: var(--mono); font-size: 9.5px; margin-bottom: 3px; }
  .kind { letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .issue .kind { color: var(--warn); }
  .meta { margin-left: auto; color: var(--dim); }
  .title { font-size: 12px; font-weight: 600; line-height: 1.3; }
  .note { font-size: 11px; color: var(--muted); margin-top: 4px; line-height: 1.45; white-space: pre-wrap; }
  .fix { font-size: 11px; color: var(--text); margin-top: 5px; line-height: 1.4; }
  .resolve { margin-top: 6px; font-size: 10px; padding: 1px 7px; color: var(--muted); }
  .resolve:hover { color: var(--ok); border-color: var(--ok); }
  .none { color: var(--dim); font-size: 11px; line-height: 1.45; margin: 0; }
</style>
