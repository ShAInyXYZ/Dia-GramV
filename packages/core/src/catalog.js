/**
 * The DGV catalog: every kind of thing a diagram may contain, and what it
 * means. The viewer draws from it (shape + color), the lint reasons from it
 * (which kinds may call which), and the skill quotes it to the agent.
 *
 * Keep this the single source of truth — never duplicate a kind list.
 */

/** Node kinds. `shape` is drawn by the viewer; `role` drives lint rules. */
/** @type {Record<string, {label:string, shape:string, color:string, role:string, hint:string}>} */
export const NODE_KINDS = {
  ui:       { label: 'UI',        shape: 'window',   color: '#6ea8fe', role: 'client',  hint: 'user-facing surface: web panel, desktop window, mobile screen, TUI' },
  service:  { label: 'Service',   shape: 'rect',     color: '#e8873a', role: 'compute', hint: 'a running process that owns logic: backend, core, daemon' },
  api:      { label: 'API',       shape: 'pill',     color: '#4ec9a5', role: 'iface',   hint: 'a named interface surface: REST/gRPC/WS endpoint set, gateway, SDK facade' },
  module:   { label: 'Module',    shape: 'tab',      color: '#c98cff', role: 'code',    hint: 'internal package / library inside a program; linked by import, not network' },
  program:  { label: 'Program',   shape: 'terminal', color: '#9ab87a', role: 'compute', hint: 'an executable: CLI, script, job runner, standalone binary' },
  worker:   { label: 'Worker',    shape: 'rect',     color: '#d9a75b', role: 'compute', hint: 'background processor: queue consumer, cron, scheduler' },
  db:       { label: 'Database',  shape: 'cylinder', color: '#c9b458', role: 'store',   hint: 'relational / document / graph database with a schema' },
  cache:    { label: 'Cache',     shape: 'cylinder', color: '#8fb5c9', role: 'store',   hint: 'ephemeral key-value store: redis, in-memory LRU' },
  storage:  { label: 'Storage',   shape: 'folder',   color: '#b8a27e', role: 'store',   hint: 'files, blobs, object storage, model weights on disk' },
  queue:    { label: 'Queue',     shape: 'skew',     color: '#e86a8f', role: 'broker',  hint: 'message bus, topic, event stream, job queue' },
  bridge:   { label: 'Bridge',    shape: 'hexagon',  color: '#5ec8d8', role: 'adapter', hint: 'translator between two worlds: IPC shim, FFI, webview bridge, protocol adapter' },
  sidecar:  { label: 'Sidecar',   shape: 'dashed',   color: '#c98cff', role: 'compute', hint: 'optional helper process, usually another language/runtime' },
  model:    { label: 'Model',     shape: 'diamond',  color: '#4ec9a5', role: 'compute', hint: 'ML model or serving engine consumed by the system' },
  external: { label: 'External',  shape: 'dashed',   color: '#8a8580', role: 'external',hint: 'third-party service or SaaS you do not control' },
  device:   { label: 'Device',    shape: 'device',   color: '#6ea8fe', role: 'client',  hint: 'remote hardware: phone, sensor, another machine on the tailnet' },
  infra:    { label: 'Infra',     shape: 'thin',     color: '#7d766c', role: 'infra',   hint: 'proxy, load balancer, container host, tunnel' },
};

/** Edge kinds: how two nodes relate. Drives stroke style + lint. */
/** @type {Record<string, {label:string, dash:string, hint:string}>} */
export const EDGE_KINDS = {
  sync:    { label: 'Sync call',   dash: 'solid',  hint: 'request/response; caller waits' },
  async:   { label: 'Async',       dash: 'dashed', hint: 'fire-and-forget, publish, webhook, stream' },
  data:    { label: 'Data',        dash: 'dotted', hint: 'reads/writes state: SQL, file IO, cache ops' },
  import:  { label: 'Import',      dash: 'thin',   hint: 'compile-time dependency between modules; no runtime hop' },
  deploy:  { label: 'Deploys',     dash: 'long',   hint: 'runs on / is hosted by / ships inside' },
  control: { label: 'Control',     dash: 'dashdot',hint: 'starts, stops, supervises, configures' },
};

/** Protocols an edge or port may name. Free text is allowed; these get lint. */
export const PROTOCOLS = [
  'http', 'https', 'rest', 'graphql', 'grpc', 'ws', 'sse', 'tcp', 'udp', 'mqtt', 'amqp', 'kafka', 'nats',
  'sql', 'redis', 's3', 'fs', 'ipc', 'unix-socket', 'stdio', 'ffi', 'jsbridge', 'import', 'exec', 'ssh', 'smb',
];

/** Build status a node may carry (viewer "color by status"). */
/** @type {Record<string, {label:string, color:string}>} */
export const STATUSES = {
  todo:    { label: 'To do',   color: '#8a8580' },
  wip:     { label: 'WIP',     color: '#e8873a' },
  done:    { label: 'Done',    color: '#4ec9a5' },
  blocked: { label: 'Blocked', color: '#c98cff' },
  failed:  { label: 'Failed',  color: '#f93c31' },
  update:  { label: 'Update',  color: '#c9b458' },
};

/** Frame tone: purely visual grouping color. */
export const FRAME_TONES = ['neutral', 'amber', 'cyan', 'violet', 'green', 'rose'];

/**
 * Which edge kinds make sense from role → role. Anything not listed is a
 * lint warning (never an error — the developer may know better).
 */
export const ROLE_RULES = {
  store:    { mayCall: false, hint: 'a database, cache or storage never initiates sync calls' },
  external: { mayCall: true },
};

export function kindOf(kind) { return NODE_KINDS[kind] ?? null; }
export const NODE_KIND_IDS = Object.keys(NODE_KINDS);
export const EDGE_KIND_IDS = Object.keys(EDGE_KINDS);
export const STATUS_IDS = Object.keys(STATUSES);

/** Compact catalog for the MCP tool / skill — everything an author needs. */
export function catalogSummary() {
  return {
    nodeKinds: Object.fromEntries(Object.entries(NODE_KINDS).map(([k, v]) => [k, { shape: v.shape, hint: v.hint }])),
    edgeKinds: Object.fromEntries(Object.entries(EDGE_KINDS).map(([k, v]) => [k, v.hint])),
    protocols: PROTOCOLS,
    statuses: STATUS_IDS,
    frameTones: FRAME_TONES,
    portDirections: ['in', 'out', 'both'],
  };
}
