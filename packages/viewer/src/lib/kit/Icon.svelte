<script lang="ts">
  // The bar's icons, drawn inline rather than pulled from a library: there are
  // eleven of them and a dependency for eleven paths is not worth the bytes or the
  // version to maintain.
  //
  // 24x24 grid, 1.6 stroke, round caps — matching the canvas node outlines so
  // the chrome and the diagram look drawn by the same hand.
  let { name, size = 14 }: { name: string; size?: number } = $props();

  const P: Record<string, string> = {
    // history
    undo: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
    // add: a frame is a container, a node is a single card
    frame: 'M3 8h18M3 8v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8 M3 8V5a1 1 0 0 1 1-1h6l2 3 M12 13v5M9.5 15.5h5',
    node: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z M12 10v4M10 12h4',
    // layout direction: nodes stacked the way the graph will run
    'layout-v': 'M9 3h6v4H9zM9 10h6v4H9zM9 17h6v4H9z M12 7v3M12 14v3',
    'layout-h': 'M3 9h4v6H3zM10 9h4v6h-4zM17 9h4v6h-4z M7 12h3M14 12h3',
    fit: 'M4 9V5a1 1 0 0 1 1-1h4 M20 9V5a1 1 0 0 0-1-1h-4 M4 15v4a1 1 0 0 0 1 1h4 M20 15v4a1 1 0 0 1-1 1h-4',
    // the master node's own motif: a card with two plates behind it
    group: 'M4 11h9a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z M7 8h9a1 1 0 0 1 1 1v9 M10 5h8a1 1 0 0 1 1 1v8',
    // a link taking a routed path, versus colour swatches
    links: 'M5 5v6a3 3 0 0 0 3 3h8 M13 11l3 3-3 3',
    palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h1.6A4.5 4.5 0 0 0 21 9.8C21 6 16.9 3 12 3Z M7.5 11.5h.01M10 7.5h.01M14.5 7h.01',
    export: 'M12 3v11 M8 10l4 4 4-4 M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
    // a crop frame closing on the picture: take a still of the canvas
    snapshot: 'M3 8V5a1 1 0 0 1 1-1h3 M17 4h3a1 1 0 0 1 1 1v3 M21 16v3a1 1 0 0 1-1 1h-3 M7 20H4a1 1 0 0 1-1-1v-3 M8 9h8a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z',
  };
  const d = $derived(P[name] ?? '');
</script>

<svg class="ico" width={size} height={size} viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true">
  {#each d.split(' M') as seg, i}<path d={(i ? 'M' : '') + seg} />{/each}
</svg>

<style>
  .ico { display: block; flex: none; }
</style>
