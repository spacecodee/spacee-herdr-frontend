import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { HcClient, type HcState } from './hc-client';
import { TerminalStore } from './terminal-store';
import type { HcEvent, HelloResult, MachineView, SubscribeResult, Terminal } from './types';

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
  const evLine = (e: HcEvent) =>
    enc(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: e }) + '\n');

  const spaceDoc = (terminal: string, version = 1) => ({
    version,
    value: {
      spaces: [
        {
          id: 's1',
          name: 'Work',
          tabs: [{ id: 'tb1', name: 'Claude', root: { children: [{ type: 'block', content: { terminal } }] } }],
        },
      ],
    },
  });

  let machines: MachineView[];
  let docResult: unknown;
  let subscribe: SubscribeResult;
  let calls: string[];
  let onData: (b: Uint8Array) => void;
  let onClose: () => void;
  let openedChannel: number | undefined;
  let store: TerminalStore;
  let clientState: WritableSignal<HcState>;
  let epoch: WritableSignal<number>;
  let closeChannel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    machines = [machine('rohan'), machine('edoras', 'unreachable')];
    subscribe = {
      seq: 10,
      channel: 5,
      terminals: [term('t1'), term('rohan/t7'), term('rohan/t8')],
    };
    calls = [];
    docResult = spaceDoc('t1');
    clientState = signal<HcState>('open');
    epoch = signal(1);
    closeChannel = vi.fn();
    openedChannel = undefined;
    const client = {
      hello: signal<HelloResult | null>(hello),
      state: clientState,
      epoch,
      closeChannel,
      call: vi.fn(async (method: string) => {
        calls.push(method);
        if (method === 'events.subscribe') return subscribe;
        if (method === 'machine.list') return { machines };
        if (method === 'doc.get') return docResult;
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
    expect(calls.sort()).toEqual(['doc.get', 'events.subscribe', 'machine.list']);
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
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'missed',
          params: { seq: 40, terminals: [term('t9')] },
        }) + '\n',
      ),
    );
    expect(store.terminals().map((t) => t.address)).toEqual(['t9']);
    await vi.waitFor(() =>
      expect(store.machines().map((m) => m.name)).toEqual(['rohan', 'edoras', 'gondor']),
    );
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

  it('start closes the previous events channel instead of leaking it', async () => {
    await store.start();
    expect(closeChannel).not.toHaveBeenCalled();
    await store.start();
    expect(closeChannel).toHaveBeenCalledWith(5);
  });

  describe('ensureStarted', () => {
    it('starts when idle', async () => {
      await store.ensureStarted();
      expect(calls).toContain('events.subscribe');
      expect(store.stream()).toBe('live');
    });

    it('does nothing when already live on an open socket', async () => {
      await store.start();
      calls.length = 0;
      await store.ensureStarted();
      expect(calls).toEqual([]);
    });

    it('starts again after the events channel closed', async () => {
      await store.start();
      onClose();
      calls.length = 0;
      await store.ensureStarted();
      expect(calls).toContain('events.subscribe');
      expect(store.stream()).toBe('live');
    });

    it('starts again when the socket was replaced even if the stream still says live', async () => {
      await store.start();
      clientState.set('closed');
      calls.length = 0;
      await store.ensureStarted();
      expect(calls).toContain('events.subscribe');
    });
  });

  it('fails when the core returns no event channel', async () => {
    subscribe = { seq: 1, terminals: [] };
    await expect(store.start()).rejects.toThrow(/channel/);
  });

  describe('after a reconnect', () => {
    it('resubscribes and refreshes the machines without being asked', async () => {
      await store.start();
      calls.length = 0;
      subscribe = { seq: 40, channel: 9, terminals: [term('t9')] };
      epoch.set(2);
      TestBed.tick();
      await vi.waitFor(() =>
        expect([...calls].sort()).toEqual(['doc.get', 'events.subscribe', 'machine.list']),
      );
      expect(openedChannel).toBe(9);
      expect(store.terminals().map((t) => t.address)).toEqual(['t9']);
      expect(store.stream()).toBe('live');
    });

    it('does nothing when nobody started the store', async () => {
      epoch.set(2);
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
      expect(calls).toEqual([]);
    });

    it('shares one subscription between the reconnect and a view asking for it', async () => {
      await store.start();
      calls.length = 0;
      clientState.set('closed');
      onClose(); // the socket died: the events channel closed with it
      clientState.set('open');
      epoch.set(2);
      TestBed.tick();
      await store.ensureStarted();
      expect(calls.filter((c) => c === 'events.subscribe')).toHaveLength(1);
    });

    it('survives a failed resubscribe: the next reconnect tries again', async () => {
      await store.start();
      const original = subscribe;
      subscribe = undefined as unknown as SubscribeResult;
      epoch.set(2);
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
      subscribe = original;
      calls.length = 0;
      epoch.set(3);
      TestBed.tick();
      await vi.waitFor(() => expect(calls).toContain('events.subscribe'));
    });
  });

  describe('spaces', () => {
    const docEvent = (seq: number, name = 'herdr-app') =>
      evLine({ seq, type: 'doc', data: { name, version: 2 } });

    it('loads the herdr-app document on start', async () => {
      await store.start();
      expect(store.spaces().map((s) => s.name)).toEqual(['Work']);
      expect(store.spaces()[0].tabs[0].addresses).toEqual(['t1']);
    });

    it('is empty when the document does not exist or the call fails', async () => {
      docResult = { value: null, version: 0 };
      await store.start();
      expect(store.spaces()).toEqual([]);
    });

    it('reloads on a doc event for herdr-app, not for other documents', async () => {
      await store.start();
      docResult = spaceDoc('t7', 2);
      onData(docEvent(11, 'other'));
      expect(calls.filter((c) => c === 'doc.get')).toHaveLength(1);
      onData(docEvent(12));
      await vi.waitFor(() => expect(store.spaces()[0].tabs[0].addresses).toEqual(['t7']));
    });

    it('reloads on every resubscribe', async () => {
      await store.start();
      docResult = spaceDoc('t8', 3);
      epoch.set(2);
      TestBed.tick();
      await vi.waitFor(() => expect(store.spaces()[0].tabs[0].addresses).toEqual(['t8']));
    });

    it('keeps the last document when a reload fails', async () => {
      await store.start();
      docResult = Promise.reject(new Error('boom'));
      (docResult as Promise<unknown>).catch(() => undefined);
      onData(docEvent(11));
      await Promise.resolve();
      expect(store.spaces()).toHaveLength(1);
    });
  });

  describe('syncing', () => {
    it('is false until started, true while subscribing, false once live', async () => {
      expect(store.syncing()).toBe(false);
      const done = store.start();
      expect(store.syncing()).toBe(true);
      await done;
      expect(store.syncing()).toBe(false);
    });

    it('is true from the moment a reconnect lands until the resubscribe settles', async () => {
      await store.start();
      epoch.set(2); // the effect has not run yet: still a sync in waiting
      expect(store.syncing()).toBe(true);
      TestBed.tick();
      await vi.waitFor(() => expect(store.syncing()).toBe(false));
      expect(store.stream()).toBe('live');
    });

    it('is false again when the subscribe failed', async () => {
      await store.start();
      subscribe = undefined as unknown as SubscribeResult;
      epoch.set(2);
      TestBed.tick();
      await vi.waitFor(() => expect(store.syncing()).toBe(false));
    });
  });
});
