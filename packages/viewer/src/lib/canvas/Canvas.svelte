<script lang="ts">
  import { SvelteFlow, Background, Controls, MiniMap, ConnectionMode, type Connection } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import DgvNode from './DgvNode.svelte';
  import FrameNode from './FrameNode.svelte';
  import DgvEdge from './DgvEdge.svelte';
  import { dg } from '../stores/diagram.svelte';
  import { hl } from '../stores/hl.svelte';
  import { kindColor } from '@dgv/core';
  import type { FNode, FEdge } from '../model/flow';

  const nodeTypes = { dgv: DgvNode, frame: FrameNode } as any;
  const edgeTypes = { dgv: DgvEdge } as any;

  function onNodeClick({ node }: { node: FNode }) {
    if (node.type === 'frame') { dg.setActive(null); return; }
    dg.setActive(hl.activeId === node.id ? null : node.id);
  }
  function onPaneClick() { dg.setActive(null); }
</script>

<SvelteFlow
  bind:nodes={dg.nodes} bind:edges={dg.edges} {nodeTypes} {edgeTypes}
  fitView colorMode="dark" minZoom={0.05} maxZoom={3}
  connectionMode={ConnectionMode.Loose}
  deleteKey={['Delete', 'Backspace']}
  onnodeclick={onNodeClick as any}
  onpaneclick={onPaneClick}
  onnodedragstop={({ nodes }: { nodes: FNode[] }) => dg.afterDrag(nodes)}
  onbeforeconnect={(c: Connection) => dg.connect(c.source, c.target) ?? false}
  onbeforedelete={async ({ nodes, edges }: { nodes: FNode[]; edges: FEdge[] }) => { dg.remove([...nodes.map((n) => n.id), ...edges.map((e) => e.id)]); return false; }}
  onselectionchange={({ nodes, edges }: { nodes: FNode[]; edges: FEdge[] }) => dg.onSelectionChange(nodes, edges)}
>
  <Background bgColor="#0e0d0b" patternColor="#242220" gap={22} />
  <Controls showLock={false} />
  <MiniMap nodeColor={(n: any) => (n.type === 'frame' ? '#1a1917' : kindColor(n.data?.kind))} maskColor="rgba(14,13,11,0.75)" pannable zoomable />
</SvelteFlow>
