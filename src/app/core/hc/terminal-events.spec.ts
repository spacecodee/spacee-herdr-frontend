import { EventLineParser, applyMessage, type Snapshot } from './terminal-events';
import type { HcEvent, HcNotification, Terminal } from './types';

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
