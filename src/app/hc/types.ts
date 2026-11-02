/** Protocol types taken from `hc schema` (OpenRPC) — only the fields this client uses. */

export interface Status {
  state: string;
  app?: string;
  kind?: string | null;
  msg?: string;
  progress?: number | null;
  title?: string;
}

export interface Foreground {
  pid: number;
  name: string;
  argv: string[];
  cwd: string;
}

export interface Terminal {
  address: string;
  labels: Record<string, string>;
  argv: string[];
  cwd: string;
  /** "live" or "finished". */
  state: string;
  created_ms: number;
  screen: string;
  cols: number;
  rows: number;
  name?: string | null;
  title?: string;
  status?: Status | null;
  records?: Record<string, Status>;
  reported?: boolean;
  turn?: number;
  keep?: boolean;
  pid?: number | null;
  reason?: string | null;
  exit_code?: number | null;
  signal?: string | null;
  finished_ms?: number | null;
  foreground?: Foreground | null;
  parent?: string | null;
}

export interface MachineView {
  name: string;
  target: string;
  id: string;
  host: string;
  version: string;
  /** connecting, connected, needs_login or unreachable. */
  state: string;
  since_ms?: number | null;
  why?: string | null;
  temporary?: boolean;
}

export interface CoreInfo {
  id: string;
  name: string;
}

export interface HelloResult {
  generation: number;
  version: string;
  core: CoreInfo;
  framed: boolean;
  methods: string[];
  features: string[];
}

export interface SubscribeResult {
  seq: number;
  terminals: Terminal[];
  channel?: number | null;
}

export interface MachineListResult {
  machines: MachineView[];
}

/** Close payload of a stream channel, sent by the core. */
export interface ChannelCloseReason {
  reason: string;
  exit_code?: number | null;
  signal?: string | null;
}

export interface EndData {
  reason: string | null;
  exit_code: number | null;
  signal: string | null;
  finished_ms: number | null;
}

interface EventBase {
  seq: number;
  terminal?: string;
  machine?: string;
}

export type HcEvent = EventBase &
  (
    | { type: 'created' | 'restarted'; data: Terminal }
    | { type: 'lost' | 'finished'; data: EndData }
    | { type: 'keep'; data: { keep: boolean } }
    | { type: 'removed'; data?: Record<string, never> }
    | {
        type: 'status';
        data: {
          status: Status | null;
          records: Record<string, Status>;
          reported: boolean;
        };
      }
    | { type: 'turn'; data: { turn: number; state: string } }
    | { type: 'title'; data: { title: string } }
    | { type: 'labels'; data: { labels: Record<string, string>; record?: Terminal } }
    | { type: 'size'; data: { cols: number; rows: number } }
    | { type: 'foreground'; data: Foreground | null }
    | { type: 'doc'; data: { name: string; version: number } }
  );

export type HcNotification =
  | { method: 'event'; params: HcEvent }
  | { method: 'heartbeat'; params: { seq: number } }
  | { method: 'missed'; params: { seq: number; terminals: Terminal[] } };
