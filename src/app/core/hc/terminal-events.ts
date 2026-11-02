import type { HcEvent, HcNotification, Terminal } from './types';

export interface Snapshot {
  seq: number;
  terminals: Terminal[];
}

/** Applies one `events.subscribe` notification to a snapshot. Pure; never mutates its input. */
export function applyMessage(snapshot: Snapshot, message: HcNotification): Snapshot {
  switch (message.method) {
    case 'missed':
      return { seq: message.params.seq, terminals: message.params.terminals };
    case 'event':
      return applyEvent(snapshot, message.params);
    default:
      // heartbeat: liveness only, terminals and seq stay as they are
      return snapshot;
  }
}

export function applyEvent(snapshot: Snapshot, event: HcEvent): Snapshot {
  if (event.seq <= snapshot.seq) return snapshot;
  const terminals = reduce(snapshot.terminals, event);
  return { seq: event.seq, terminals };
}

function reduce(terminals: Terminal[], event: HcEvent): Terminal[] {
  switch (event.type) {
    case 'created':
    case 'restarted':
      return upsert(terminals, event.data);
    case 'removed':
      return terminals.filter((t) => t.address !== event.terminal);
    case 'labels':
      return event.data.record
        ? upsert(terminals, event.data.record)
        : patch(terminals, event.terminal, { labels: event.data.labels });
    case 'lost':
      return patch(terminals, event.terminal, { ...event.data, pid: null, foreground: null });
    case 'finished':
      return patch(terminals, event.terminal, { ...event.data, state: 'finished', foreground: null });
    case 'keep':
      return patch(terminals, event.terminal, { keep: event.data.keep });
    case 'status':
      return patch(terminals, event.terminal, {
        status: event.data.status,
        records: event.data.records,
        reported: event.data.reported,
      });
    case 'turn':
      return patch(terminals, event.terminal, { turn: event.data.turn });
    case 'title':
      return patch(terminals, event.terminal, { title: event.data.title });
    case 'size':
      return patch(terminals, event.terminal, { cols: event.data.cols, rows: event.data.rows });
    case 'foreground':
      return patch(terminals, event.terminal, { foreground: event.data });
    default:
      // doc events, and event types a newer core may add
      return terminals;
  }
}

function upsert(terminals: Terminal[], record: Terminal): Terminal[] {
  return terminals.some((t) => t.address === record.address)
    ? terminals.map((t) => (t.address === record.address ? record : t))
    : [...terminals, record];
}

function patch(terminals: Terminal[], address: string | undefined, changes: Partial<Terminal>): Terminal[] {
  if (!terminals.some((t) => t.address === address)) return terminals;
  return terminals.map((t) => (t.address === address ? { ...t, ...changes } : t));
}

/** Turns the events channel (JSON lines, split anywhere) into notifications. */
export class EventLineParser {
  private readonly decoder = new TextDecoder();
  private rest = '';

  push(bytes: Uint8Array): HcNotification[] {
    this.rest += this.decoder.decode(bytes, { stream: true });
    const lines = this.rest.split('\n');
    this.rest = lines.pop() ?? '';
    const out: HcNotification[] = [];
    for (const line of lines) {
      const message = parseNotification(line);
      if (message) out.push(message);
    }
    return out;
  }
}

function parseNotification(line: string): HcNotification | null {
  if (!line.trim()) return null;
  try {
    const { method, params } = JSON.parse(line) as { method?: string; params?: unknown };
    if ((method === 'event' || method === 'heartbeat' || method === 'missed') && params) {
      return { method, params } as HcNotification;
    }
  } catch {
    // not a notification we understand
  }
  return null;
}
