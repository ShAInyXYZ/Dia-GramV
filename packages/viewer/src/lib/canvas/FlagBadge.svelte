<script lang="ts">
  // The bubble on an element that carries flags. It says how many and whether
  // any is unread; the note itself opens in FlagPop, in screen space, so it
  // reads the same at every zoom and is never buried under a neighbouring card.
  import Icon from '../kit/Icon.svelte';
  import { hl } from '../stores/hl.svelte';
  import { dg } from '../stores/diagram.svelte';
  import type { Flag } from '../model/flow';

  // items: the flags this badge answers for. A master answers for its members,
  // so each item carries the id of the element it is actually on.
  let { on, items, small = false }: { on: string; items: { on: string; flag: Flag }[]; small?: boolean } = $props();
  const issues = $derived(items.filter((i) => (i.flag.kind ?? 'issue') === 'issue').length);
  const unread = $derived(items.some((i) => dg.flagUnread(i.on, i.flag.id)));
  const open = $derived(hl.flagOpen?.on === on);
  const tip = $derived(items.length === 1 ? items[0].flag.title : `${items.length} flags · ${issues} issue${issues === 1 ? '' : 's'}`);

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (open) { hl.flagOpen = null; return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hl.flagOpen = { on, x: r.left + r.width / 2, y: r.bottom };
  }
</script>

<button class="badge nodrag nopan" class:issue={issues > 0} class:unread class:open class:small onclick={toggle} data-tip={tip} aria-label="flags on {on}: {tip}">
  <Icon name="flag" size={small ? 9 : 10} />{#if items.length > 1}<b>{items.length}</b>{/if}
</button>

<style>
  /* A pennant in the warning colour: it is a problem someone wrote down, and
     it sits on the outline the way the lint bar sits inside it. Unread, it is
     filled and keeps ringing until it is opened; read, it is an outline and
     holds still. */
  .badge { position: relative; display: inline-flex; align-items: center; gap: 3px; height: 18px; padding: 0 5px; border-radius: 9px; border: 1px solid var(--muted); background: var(--bg); color: var(--muted); font-family: var(--mono); font-size: 9.5px; line-height: 1; cursor: pointer; transition: background .12s, color .12s; }
  .badge.small { height: 15px; padding: 0 4px; }
  .badge.issue { border-color: var(--warn); color: var(--warn); }
  .badge.unread { background: var(--warn); color: #1d1d1d; border-color: var(--warn); }
  .badge.unread:not(.issue) { background: var(--muted); border-color: var(--muted); }
  .badge.open, .badge:hover { border-color: var(--text); color: var(--text); }
  .badge.unread.open, .badge.unread:hover { color: #1d1d1d; }
  .badge b { font-weight: 600; }
  .badge.unread { animation: breathe 1.8s ease-in-out infinite; }
  .badge.unread::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; border: 1.5px solid var(--warn); animation: ring 1.8s ease-out infinite; pointer-events: none; }
  .badge.unread:not(.issue)::before { border-color: var(--muted); }
  @keyframes ring { 0% { transform: scale(1); opacity: .9; } 70%, 100% { transform: scale(2.4); opacity: 0; } }
  @keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
  @media (prefers-reduced-motion: reduce) { .badge.unread, .badge.unread::before { animation: none; } }
</style>
