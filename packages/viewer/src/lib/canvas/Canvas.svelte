<script lang="ts">
  import { SvelteFlow, Background, BackgroundVariant, Controls, MiniMap, ConnectionMode, useSvelteFlow, type Connection } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import DgvNode from './DgvNode.svelte';
  import FrameNode from './FrameNode.svelte';
  import DgvEdge from './DgvEdge.svelte';
  import QuickAdd from './QuickAdd.svelte';
  import { dg } from '../stores/diagram.svelte';
  import { hl } from '../stores/hl.svelte';
  import { ui } from '../stores/ui.svelte';
  import { kindColor } from '@dgv/core';
  import type { FNode, FEdge } from '../model/flow';

  const nodeTypes = { dgv: DgvNode, frame: FrameNode } as any;
  const edgeTypes = { dgv: DgvEdge } as any;
  const flow = useSvelteFlow();
  const tones: Record<string, string> = { neutral: '#2a2825', amber: '#3a2a1c', cyan: '#1c3236', violet: '#2e2438', green: '#1c332c', rose: '#3a222a' };

  function onNodeClick({ node }: { node: FNode }) {
    if (node.type === 'frame') { dg.setActive(null); return; }
    dg.setActive(hl.activeId === node.id ? null : node.id);
  }
  function onPaneClick() { dg.setActive(null); ui.quickAdd = null; }
  // double-click on empty canvas → quick-add at the cursor
  function onDblClick(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('.svelte-flow__pane')) return;
    if (!dg.name) return;
    ui.quickAdd = { x: e.clientX, y: e.clientY };
  }
  function pick(kind: string) {
    const at = ui.quickAdd!; ui.quickAdd = null;
    const p = flow.screenToFlowPosition({ x: at.x, y: at.y });
    dg.addNode(kind, { x: Math.round(p.x / 12) * 12, y: Math.round(p.y / 12) * 12 });
    ui.sideOpen = true; ui.tab = 'inspect';
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wrap" ondblclick={onDblClick} onmousemove={(e) => (ui.mouse = { x: e.clientX, y: e.clientY })}>
  <SvelteFlow
    bind:nodes={dg.nodes} bind:edges={dg.edges} {nodeTypes} {edgeTypes}
    fitView colorMode="dark" minZoom={0.05} maxZoom={3}
    connectionMode={ConnectionMode.Loose}
    deleteKey={['Delete', 'Backspace']}
    snapGrid={[12, 12]}
    zoomOnDoubleClick={false}
    onnodeclick={onNodeClick as any}
    onpaneclick={onPaneClick}
    onnodedrag={({ nodes }: { nodes: FNode[] }) => dg.onDrag(nodes)}
    onnodedragstop={({ nodes }: { nodes: FNode[] }) => dg.afterDrag(nodes)}
    onbeforeconnect={(c: Connection) => dg.connect(c.source, c.target, c.sourceHandle, c.targetHandle) ?? false}
    onbeforedelete={async ({ nodes, edges }: { nodes: FNode[]; edges: FEdge[] }) => { dg.remove([...nodes.map((n) => n.id), ...edges.map((e) => e.id)]); return false; }}
    onselectionchange={({ nodes, edges }: { nodes: FNode[]; edges: FEdge[] }) => dg.onSelectionChange(nodes, edges)}
  >
    <!-- two-level grid: fine 24px lines, stronger 120px lines — snapping is 12px so cards land on the fine grid -->
    <Background id="minor" variant={BackgroundVariant.Lines} bgColor="#0e0d0b" patternColor="#151412" gap={24} lineWidth={1} />
    <Background id="major" variant={BackgroundVariant.Lines} patternColor="#1c1a17" gap={120} lineWidth={1} />
    <Controls showLock={false} />
    <MiniMap nodeColor={(n: any) => (n.type === 'frame' ? tones[n.data?.tone ?? 'neutral'] : kindColor(n.data?.kind))} maskColor="rgba(14,13,11,0.75)" pannable zoomable />
  </SvelteFlow>
  {#if ui.quickAdd}<QuickAdd at={ui.quickAdd} onpick={pick} onclose={() => (ui.quickAdd = null)} />{/if}
</div>

<style>
  .wrap { position: absolute; inset: 0; }
</style>
