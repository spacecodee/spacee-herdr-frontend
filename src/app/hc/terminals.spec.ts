import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HcClient } from './hc-client';
import {
  EventLineParser,
  TerminalStore,
  applyMessage,
  type Snapshot,
} from './terminals';
import type { HcEvent, HcNotification, HelloResult, MachineView, SubscribeResult, Terminal } from './types';

const term = (address: string, extra: Partial<Terminal> = {}): Terminal => ({
  address,
  labels: {},
  argv: ['sh'],
  cwd: '/',
  state: 'live',
  created_ms: 1,
  screen: 'exact',
  cols: 80,
  rows: 24,
  ...extra,
});

const snap = (seq: number, ...terminals: Terminal[]): Snapshot => ({ seq, terminals });
const ev = (e: HcEvent): HcNotification => ({ method: 'event', params: e });
const apply = (s: Snapshot, e: HcEvent) => applyMessage(s, ev(e));
const find = (s: Snapshot, address: string) => s.terminals.find((t) => t.address === address);

describe('applyMessage', () => {
  it('created adds the record', () => {
    const s = apply(snap(1, term('t1')), { seq: 2, type: 'created', terminal: 't2', data: term('t2') });
    expect(s.terminals.map((t) => t.address)).toEqual(['t1', 't2']);
    expect(s.seq).toBe(2);
  });

  it('created for a known address replaces the record (machine reconnect)', () => {
    const s = apply(snap(1, term('rohan/t7', { title: 'old' })), {
      seq: 2,
      type: 'created',
      terminal: 'rohan/t7',
      data: term('rohan/t7', { title: 'new' }),
    });
    expect(s.terminals).toHaveLength(1);
    expect(s.terminals[0].title).toBe('new');
  });

  it('restarted replaces the record', () => {
    const s = apply(snap(1, term('t1', { pid: 1, state: 'live', reason: 'signaled' })), {
      seq: 2,
      type: 'restarted',
      terminal: 't1',
      data: term('t1', { pid: 99 }),
    });
    expect(find(s, 't1')).toMatchObject({ pid: 99 });
    expect(find(s, 't1')?.reason).toBeUndefined();
  });

  it('lost sets the end data, clears pid, drops foreground and stays live', () => {
    const s = apply(
      snap(1, term('t1', { pid: 5, foreground: { pid: 5, name: 'sh', argv: ['sh'], cwd: '/' } })),
      {
        seq: 2,
        type: 'lost',
        terminal: 't1',
        data: { reason: 'signaled', exit_code: null, signal: 'SIGKILL', finished_ms: null },
      },
    );
    expect(find(s, 't1')).toMatchObject({
      state: 'live',
      reason: 'signaled',
      exit_code: null,
      signal: 'SIGKILL',
      finished_ms: null,
      pid: null,
      foreground: null,
    });
  });

  it('keep sets keep', () => {
    const s = apply(snap(1, term('t1')), { seq: 2, type: 'keep', terminal: 't1', data: { keep: true } });
    expect(find(s, 't1')?.keep).toBe(true);
  });

  it('finished sets state finished and the end data, and drops foreground', () => {
    const s = apply(
      snap(1, term('t1', { foreground: { pid: 5, name: 'sh', argv: ['sh'], cwd: '/' } })),
      {
        seq: 2,
        type: 'finished',
        terminal: 't1',
        data: { reason: 'exited', exit_code: 0, signal: null, finished_ms: 123 },
      },
    );
    expect(find(s, 't1')).toMatchObject({
      state: 'finished',
      reason: 'exited',
      exit_code: 0,
      signal: null,
      finished_ms: 123,
      foreground: null,
    });
  });

  it('removed drops the record', () => {
    const s = apply(snap(1, term('t1'), term('t2')), { seq: 2, type: 'removed', terminal: 't1', data: {} });
    expect(s.terminals.map((t) => t.address)).toEqual(['t2']);
  });

  it('status replaces status, records and reported', () => {
    const s = apply(snap(1, term('t1', { status: { state: 'idle' }, records: { a: { state: 'idle' } } })), {
      seq: 2,
      type: 'status',
      terminal: 't1',
      data: { status: { state: 'blocked', kind: 'permission' }, records: { b: { state: 'working' } }, reported: true },
    });
    expect(find(s, 't1')).toMatchObject({
      status: { state: 'blocked', kind: 'permission' },
      records: { b: { state: 'working' } },
      reported: true,
    });
  });

  it('status with null clears the root status', () => {
    const s = apply(snap(1, term('t1', { status: { state: 'working' } })), {
      seq: 2,
      type: 'status',
      terminal: 't1',
      data: { status: null, records: {}, reported: true },
    });
    expect(find(s, 't1')?.status).toBeNull();
  });

  it('turn sets turn', () => {
    const s = apply(snap(1, term('t1', { turn: 1 })), {
      seq: 2,
      type: 'turn',
      terminal: 't1',
      data: { turn: 2, state: 'done' },
    });
    expect(find(s, 't1')?.turn).toBe(2);
  });

  it('title sets title', () => {
    const s = apply(snap(1, term('t1')), { seq: 2, type: 'title', terminal: 't1', data: { title: 'vim' } });
    expect(find(s, 't1')?.title).toBe('vim');
  });

  it('labels replaces labels', () => {
    const s = apply(snap(1, term('t1', { labels: { a: '1' } })), {
      seq: 2,
      type: 'labels',
      terminal: 't1',
      data: { labels: { b: '2' } },
    });
    expect(find(s, 't1')?.labels).toEqual({ b: '2' });
  });

  it('labels with record adds a terminal that newly matches', () => {
    const s = apply(snap(1), {
      seq: 2,
      type: 'labels',
      terminal: 't1',
      data: { labels: { a: '1' }, record: term('t1', { labels: { a: '1' } }) },
    });
    expect(find(s, 't1')?.labels).toEqual({ a: '1' });
  });

  it('size sets cols and rows', () => {
    const s = apply(snap(1, term('t1')), { seq: 2, type: 'size', terminal: 't1', data: { cols: 100, rows: 30 } });
    expect(find(s, 't1')).toMatchObject({ cols: 100, rows: 30 });
  });

  it('foreground sets and clears foreground', () => {
    const fg = { pid: 9, name: 'vim', argv: ['vim'], cwd: '/tmp' };
    const set = apply(snap(1, term('t1')), { seq: 2, type: 'foreground', terminal: 't1', data: fg });
    expect(find(set, 't1')?.foreground).toEqual(fg);
    const cleared = apply(set, { seq: 3, type: 'foreground', terminal: 't1', data: null });
    expect(find(cleared, 't1')?.foreground).toBeNull();
  });

  it('ignores doc events but keeps terminals', () => {
    const before = snap(1, term('t1'));
    const s = apply(before, { seq: 2, type: 'doc', data: { name: 'herdr-app', version: 2 } });
    expect(s.terminals).toBe(before.terminals);
  });

  it('ignores unknown event types', () => {
    const before = snap(1, term('t1'));
    const s = apply(before, { seq: 2, type: 'future', terminal: 't1', data: {} } as unknown as HcEvent);
    expect(s.terminals).toBe(before.terminals);
  });

  it('ignores events for unknown terminals', () => {
    const s = apply(snap(1, term('t1')), { seq: 2, type: 'title', terminal: 't9', data: { title: 'x' } });
    expect(s.terminals.map((t) => t.address)).toEqual(['t1']);
  });

  it('ignores events with seq <= current seq', () => {
    const before = snap(5, term('t1'));
    for (const seq of [5, 4, 1]) {
      const s = apply(before, { seq, type: 'title', terminal: 't1', data: { title: 'x' } });
      expect(s).toBe(before);
    }
  });

  it('does not mutate the previous snapshot', () => {
    const before = snap(1, term('t1'));
    apply(before, { seq: 2, type: 'title', terminal: 't1', data: { title: 'x' } });
    expect(before.terminals[0].title).toBeUndefined();
  });

  it('missed replaces terminals and seq', () => {
    const s = applyMessage(snap(5, term('t1')), {
      method: 'missed',
      params: { seq: 57, terminals: [term('t8')] },
    });
    expect(s).toEqual({ seq: 57, terminals: [term('t8')] });
  });

  it('events after a missed snapshot are filtered against its seq', () => {
    let s = applyMessage(snap(5), { method: 'missed', params: { seq: 57, terminals: [term('t1')] } });
    s = apply(s, { seq: 56, type: 'title', terminal: 't1', data: { title: 'stale' } });
    expect(find(s, 't1')?.title).toBeUndefined();
    s = apply(s, { seq: 58, type: 'title', terminal: 't1', data: { title: 'fresh' } });
    expect(find(s, 't1')?.title).toBe('fresh');
  });

  it('heartbeat never changes terminals', () => {
    const before = snap(5, term('t1'));
    const s = applyMessage(before, { method: 'heartbeat', params: { seq: 9 } });
    expect(s.terminals).toBe(before.terminals);
  });
});

describe('EventLineParser', () => {
  const line = (o: unknown) => JSON.stringify(o) + '\n';
  const hb = { jsonrpc: '2.0', method: 'heartbeat', params: { seq: 1 } };
  const enc = (s: string) => new TextEncoder().encode(s);

  it('parses several notifications in one payload', () => {
    const p = new EventLineParser();
    expect(p.push(enc(line(hb) + line({ ...hb, params: { seq: 2 } })))).toEqual([
      { method: 'heartbeat', params: { seq: 1 } },
      { method: 'heartbeat', params: { seq: 2 } },
    ]);
  });

  it('buffers a line split across payloads at every byte', () => {
    const raw = enc(line(hb) + line({ ...hb, params: { seq: 2 } }));
    for (let cut = 0; cut <= raw.length; cut++) {
      const p = new EventLineParser();
      const out = [...p.push(raw.subarray(0, cut)), ...p.push(raw.subarray(cut))];
      expect(out).toHaveLength(2);
    }
  });

  it('keeps a split multi-byte character intact', () => {
    const msg = { jsonrpc: '2.0', method: 'event', params: { seq: 1, type: 'title', terminal: 't1', data: { title: 'héllo ✓' } } };
    const raw = enc(line(msg));
    const cut = raw.indexOf(0xc3) + 1;
    const p = new EventLineParser();
    const out = [...p.push(raw.subarray(0, cut)), ...p.push(raw.subarray(cut))];
    expect(out).toEqual([{ method: 'event', params: msg.params }]);
  });

  it('skips blank lines, malformed JSON and non-notifications', () => {
    const p = new EventLineParser();
    const out = p.push(enc('\nnot json\n' + line({ jsonrpc: '2.0', id: 3, result: {} }) + line(hb)));
    expect(out).toEqual([{ method: 'heartbeat', params: { seq: 1 } }]);
  });
});

describe('TerminalStore', () => {
  const hello: HelloResult = {
    generation: 1,
    version: '0.1.0',
    core: { id: 'c', name: 'gandalf' },
    framed: true,
    methods: [],
    features: [],
  };
  const machine = (name: string, state = 'connected'): MachineView => ({
    name,
    target: name,
    id: name,
    host: name,
    version: '0.1.0',
    state,
  });
  const enc = (s: string) => new TextEncoder().encode(s);
  const evLine = (e: HcEvent) => enc(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: e }) + '\n');

  let machines: MachineView[];
  let subscribe: SubscribeResult;
  let calls: string[];
  let onData: (b: Uint8Array) => void;
  let onClose: () => void;
  let openedChannel: number | undefined;
  let store: TerminalStore;

  beforeEach(() => {
    machines = [machine('rohan'), machine('edoras', 'unreachable')];
    subscribe = { seq: 10, channel: 5, terminals: [term('t1'), term('rohan/t7'), term('rohan/t8')] };
    calls = [];
    openedChannel = undefined;
    const client = {
      hello: signal<HelloResult | null>(hello),
      call: vi.fn(async (method: string) => {
        calls.push(method);
        if (method === 'events.subscribe') return subscribe;
        if (method === 'machine.list') return { machines };
        throw new Error(`unexpected ${method}`);
      }),
      openChannel: vi.fn((channel: number, data: (b: Uint8Array) => void, close: () => void) => {
        openedChannel = channel;
        onData = data;
        onClose = close;
      }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: HcClient, useValue: client }] });
    store = TestBed.inject(TerminalStore);
  });

  it('start subscribes, loads the snapshot, opens the channel and lists machines', async () => {
    await store.start();
    expect(calls).toEqual(['events.subscribe', 'machine.list']);
    expect(openedChannel).toBe(5);
    expect(store.terminals().map((t) => t.address)).toEqual(['t1', 'rohan/t7', 'rohan/t8']);
    expect(store.machines().map((m) => m.name)).toEqual(['rohan', 'edoras']);
  });

  it('applies events arriving on the channel, even several or split', async () => {
    await store.start();
    const a = evLine({ seq: 11, type: 'title', terminal: 't1', data: { title: 'one' } });
    const b = evLine({ seq: 12, type: 'removed', terminal: 'rohan/t8', data: {} });
    const all = new Uint8Array([...a, ...b]);
    onData(all.subarray(0, 20));
    onData(all.subarray(20));
    expect(store.terminals().map((t) => t.address)).toEqual(['t1', 'rohan/t7']);
    expect(store.terminals()[0].title).toBe('one');
  });

  it('ignores events at or below the snapshot seq', async () => {
    await store.start();
    onData(evLine({ seq: 10, type: 'title', terminal: 't1', data: { title: 'stale' } }));
    expect(store.terminals()[0].title).toBeUndefined();
  });

  it('missed replaces the snapshot and refreshes machines', async () => {
    await store.start();
    machines = [machine('rohan'), machine('edoras', 'connected'), machine('gondor')];
    onData(
      enc(
        JSON.stringify({ jsonrpc: '2.0', method: 'missed', params: { seq: 40, terminals: [term('t9')] } }) + '\n',
      ),
    );
    expect(store.terminals().map((t) => t.address)).toEqual(['t9']);
    await vi.waitFor(() => expect(store.machines().map((m) => m.name)).toEqual(['rohan', 'edoras', 'gondor']));
    expect(calls.filter((c) => c === 'machine.list')).toHaveLength(2);
  });

  it('groups terminals by machine; no slash means the local core', async () => {
    await store.start();
    const groups = store.groups();
    expect(groups.map((g) => g.name)).toEqual(['gandalf', 'rohan', 'edoras']);
    expect(groups[0]).toMatchObject({ local: true });
    expect(groups[0].terminals.map((t) => t.address)).toEqual(['t1']);
    expect(groups[1].terminals.map((t) => t.address)).toEqual(['rohan/t7', 'rohan/t8']);
  });

  it('includes machines without terminals with their state', async () => {
    await store.start();
    const edoras = store.groups().find((g) => g.name === 'edoras');
    expect(edoras).toMatchObject({ state: 'unreachable', terminals: [], local: false });
  });

  it('keeps terminals of a machine missing from machine.list in their own group', async () => {
    subscribe.terminals = [term('mordor/t1')];
    await store.start();
    expect(store.groups().find((g) => g.name === 'mordor')).toMatchObject({
      terminals: [expect.objectContaining({ address: 'mordor/t1' })],
    });
  });

  it('keeps going when machine.list fails', async () => {
    const client = TestBed.inject(HcClient) as unknown as { call: ReturnType<typeof vi.fn> };
    client.call.mockImplementation(async (method: string) => {
      if (method === 'events.subscribe') return subscribe;
      throw new Error('boom');
    });
    await store.start();
    expect(store.terminals()).toHaveLength(3);
    expect(store.machines()).toEqual([]);
  });

  it('stream is idle, then live once started, then closed when the events channel closes', async () => {
    expect(store.stream()).toBe('idle');
    await store.start();
    expect(store.stream()).toBe('live');
    onClose();
    expect(store.stream()).toBe('closed');
    await store.start();
    expect(store.stream()).toBe('live');
  });

  it('fails when the core returns no event channel', async () => {
    subscribe = { seq: 1, terminals: [] };
    await expect(store.start()).rejects.toThrow(/channel/);
  });
});
