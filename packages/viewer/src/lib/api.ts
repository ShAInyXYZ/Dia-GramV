// Thin client for the dgv serve API. The file on disk is the source of truth.
export type DiagramInfo = { name: string; title?: string; description?: string; updated?: string; nodes: number; edges: number; frames: number };

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `${r.status} ${r.statusText}`);
  return r.json();
}
export const api = {
  list: () => fetch('/api/diagrams').then((r) => j<DiagramInfo[]>(r)),
  read: (name: string) => fetch(`/api/diagrams/${name}`).then((r) => j<any>(r)),
  write: (name: string, doc: any) => fetch(`/api/diagrams/${name}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) }).then((r) => j<{ ok: boolean; history?: any[] }>(r)),
  remove: (name: string) => fetch(`/api/diagrams/${name}`, { method: 'DELETE' }).then((r) => j<{ ok: boolean }>(r)),
  health: () => fetch('/api/health').then((r) => j<{ ok: boolean; dir: string }>(r)),
  /** Subscribe to on-disk changes. Returns unsubscribe. */
  events(onChange: (name: string) => void): () => void {
    const es = new EventSource('/api/events');
    es.addEventListener('change', (e) => onChange(JSON.parse((e as MessageEvent).data).name));
    return () => es.close();
  },
};
