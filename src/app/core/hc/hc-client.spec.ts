import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Session } from '../session/session';
import { HC_SOCKET_FACTORY, HcClient, HcError, type HcSocket } from './hc-client';
import { FrameDecoder, FrameKind, encodeFrame, type DecodedItem } from './wire';

const enc = new TextEncoder();
const dec = new TextDecoder();

class FakeSocket implements HcSocket {
  binaryType: BinaryType = 'blob';
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sent: Uint8Array<ArrayBuffer>[] = [];
  closed = false;

  constructor(readonly url: string) {}

  send(data: Uint8Array<ArrayBuffer>): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.onclose?.({} as CloseEvent);
  }

  open(): void {
    this.onopen?.({} as Event);
  }
  receive(data: Uint8Array): void {
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.onmessage?.({ data: buffer } as MessageEvent);
  }
  /** Frames the client sent after the hello line. */
  frames(): Extract<DecodedItem, { type: 'frame' }>[] {
    const d = new FrameDecoder();
    const out: DecodedItem[] = [];
    out.push(...d.push(this.sent[0]));
    for (const chunk of this.sent.slice(1)) out.push(...d.push(chunk));
    return out.filter((i) => i.type === 'frame');
  }
}

const helloResult = {
  generation: 1,
  version: '0.1.0',
  core: { id: 'abc', name: 'gandalf' },
  framed: true,
  methods: [],
  features: [],
};
const helloReply = (result: unknown = helloResult) =>
  enc.encode(JSON.stringify({ jsonrpc: '2.0', id: 0, result }) + '\n');
const rpc = (msg: unknown, channel = 0) =>
  encodeFrame(channel, FrameKind.DATA, enc.encode(JSON.stringify(msg)));

describe('HcClient', () => {
  let socket: FakeSocket;
  let sockets: FakeSocket[];
  let client: HcClient;
  let check: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sockets = [];
    check = vi.fn(async () => 'authenticated');
    TestBed.configureTestingModule({
      providers: [
        { provide: Session, useValue: { check } },
        {
          provide: HC_SOCKET_FACTORY,
          useValue: (url: string) => sockets[sockets.push((socket = new FakeSocket(url))) - 1],
        },
      ],
    });
    client = TestBed.inject(HcClient);
  });

  /** Connects and completes the handshake. */
  async function connected(): Promise<void> {
    const p = client.connect();
    socket.open();
    socket.receive(helloReply());
    await p;
  }

  /** Parsed JSON-RPC requests sent on channel 0. */
  const requests = () =>
    socket
      .frames()
      .filter((f) => f.channel === 0 && f.kind === FrameKind.DATA)
      .map((f) => JSON.parse(dec.decode(f.payload)));

  describe('connect', () => {
    it('starts closed, goes connecting, then open with the hello result', async () => {
      expect(client.state()).toBe('closed');
      const p = client.connect();
      expect(client.state()).toBe('connecting');
      socket.open();
      socket.receive(helloReply());
      await p;
      expect(client.state()).toBe('open');
      expect(client.hello()).toEqual(helloResult);
    });

    it('opens a same-origin /ws socket with arraybuffer binary type', () => {
      void client.connect();
      expect(socket.url).toMatch(/^wss?:\/\/[^/]+\/ws$/);
      expect(socket.binaryType).toBe('arraybuffer');
    });

    it('sends the framed hello as raw bytes when the socket opens', () => {
      void client.connect();
      expect(socket.sent).toHaveLength(0);
      socket.open();
      expect(dec.decode(socket.sent[0])).toBe(
        '{"jsonrpc":"2.0","id":0,"method":"hello","params":{"framed":true,"generation":1}}\n',
      );
    });

    it('rejects and closes when the core does not switch to framed mode', async () => {
      const p = client.connect();
      socket.open();
      socket.receive(helloReply({ ...helloResult, framed: false }));
      await expect(p).rejects.toThrow(/framed/);
      expect(client.state()).toBe('closed');
      expect(socket.closed).toBe(true);
    });

    it('rejects when the socket closes before the hello reply', async () => {
      const p = client.connect();
      socket.close();
      await expect(p).rejects.toThrow();
      expect(client.state()).toBe('closed');
    });

    it('first connect with the bridge unreachable keeps retrying instead of failing', async () => {
      vi.useFakeTimers();
      try {
        check.mockResolvedValue('unreachable');
        const p = client.ensureOpen();
        let settled = false;
        p.then(
          () => (settled = true),
          () => (settled = true),
        );
        socket.close(); // the dead bridge refuses the upgrade
        await vi.advanceTimersByTimeAsync(0);
        expect(client.state()).toBe('reconnecting');
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(500);
        expect(sockets).toHaveLength(2);
        socket.close(); // still down
        await vi.advanceTimersByTimeAsync(5_000);
        expect(sockets.length).toBeGreaterThan(2);
        socket.open(); // the bridge is back
        socket.receive(helloReply());
        await p;
        expect(client.state()).toBe('open');
      } finally {
        vi.useRealTimers();
      }
    });

    it('first connect refused as anonymous still rejects and goes to closed', async () => {
      check.mockResolvedValue('anonymous');
      const p = client.connect();
      socket.close();
      await expect(p).rejects.toThrow();
      expect(client.state()).toBe('closed');
      expect(sockets).toHaveLength(1);
    });

    it('rejects when the hello reply is an error', async () => {
      const p = client.connect();
      socket.open();
      socket.receive(
        enc.encode(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 0,
            error: { code: -32000, message: 'nope', data: { kind: 'bad' } },
          }) + '\n',
        ),
      );
      await expect(p).rejects.toMatchObject({ kind: 'bad' });
      expect(client.state()).toBe('closed');
    });
  });

  describe('call', () => {
    it('sends JSON-RPC on channel 0 DATA with incrementing ids starting at 1', async () => {
      await connected();
      void client.call('terminal.list', {});
      void client.call('machine.list', {});
      expect(requests()).toEqual([
        { jsonrpc: '2.0', id: 1, method: 'terminal.list', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'machine.list', params: {} },
      ]);
    });

    it('resolves each call by id, whatever order replies arrive in', async () => {
      await connected();
      const a = client.call<string>('a', {});
      const b = client.call<string>('b', {});
      socket.receive(rpc({ jsonrpc: '2.0', id: 2, result: 'B' }));
      socket.receive(rpc({ jsonrpc: '2.0', id: 1, result: 'A' }));
      expect(await a).toBe('A');
      expect(await b).toBe('B');
    });

    it('rejects with an error carrying data.kind', async () => {
      await connected();
      const p = client.call('terminal.get', { terminal: 't9' });
      socket.receive(
        rpc({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32000,
            message: 'no terminal t9',
            data: { kind: 'not_found', hint: 'h' },
          },
        }),
      );
      const err = await p.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HcError);
      expect(err).toMatchObject({ kind: 'not_found', message: 'no terminal t9', code: -32000 });
    });

    it('rejects when not connected', async () => {
      await expect(client.call('x', {})).rejects.toThrow(/not connected|closed/i);
    });

    it('rejects all pending calls when the socket closes', async () => {
      await connected();
      const a = client.call('a', {});
      const b = client.call('b', {});
      socket.close();
      await expect(a).rejects.toBeInstanceOf(HcError);
      await expect(b).rejects.toMatchObject({ kind: 'connection_closed' });
      expect(client.state()).toBe('reconnecting');
    });

    it('handles a reply split across WebSocket messages', async () => {
      await connected();
      const p = client.call<number>('a', {});
      const frame = rpc({ jsonrpc: '2.0', id: 1, result: 42 });
      socket.receive(frame.subarray(0, 6));
      socket.receive(frame.subarray(6));
      expect(await p).toBe(42);
    });
  });

  describe('stream channels', () => {
    it('delivers DATA and sends CREDIT with its byte length after the handler ran', async () => {
      await connected();
      const order: string[] = [];
      client.openChannel(
        7,
        () => {
          order.push(
            `handler:${socket.frames().filter((f) => f.kind === FrameKind.CREDIT).length}`,
          );
        },
        () => undefined,
      );
      socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array(100)));
      const credits = socket.frames().filter((f) => f.kind === FrameKind.CREDIT);
      expect(order).toEqual(['handler:0']);
      expect(credits).toHaveLength(1);
      expect(credits[0].channel).toBe(7);
      expect(
        new DataView(credits[0].payload.buffer, credits[0].payload.byteOffset).getUint32(0, true),
      ).toBe(100);
    });

    it('still sends CREDIT when the handler throws', async () => {
      await connected();
      client.openChannel(
        7,
        () => {
          throw new Error('boom');
        },
        () => undefined,
      );
      try {
        socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array(10)));
      } catch {
        // surfaced or swallowed; either way credit must go out
      }
      expect(socket.frames().filter((f) => f.kind === FrameKind.CREDIT)).toHaveLength(1);
    });

    it('delivers frames that arrived before openChannel', async () => {
      await connected();
      socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array([1, 2, 3])));
      const got: number[][] = [];
      client.openChannel(
        7,
        (b) => void got.push(Array.from(b)),
        () => undefined,
      );
      expect(got).toEqual([[1, 2, 3]]);
      expect(socket.frames().filter((f) => f.kind === FrameKind.CREDIT)).toHaveLength(1);
    });

    it('delivers a frame in the same WebSocket message as the reply that names its channel', async () => {
      await connected();
      const got: number[][] = [];
      const p = client.call<{ channel: number }>('terminal.attach', {}).then((r) => {
        client.openChannel(
          r.channel,
          (b) => void got.push(Array.from(b)),
          () => undefined,
        );
      });
      const reply = rpc({ jsonrpc: '2.0', id: 1, result: { channel: 4 } });
      const data = encodeFrame(4, FrameKind.DATA, new Uint8Array([9]));
      const both = new Uint8Array(reply.length + data.length);
      both.set(reply);
      both.set(data, reply.length);
      socket.receive(both);
      await p;
      expect(got).toEqual([[9]]);
    });

    it('does not send CREDIT for empty DATA', async () => {
      await connected();
      client.openChannel(
        7,
        () => undefined,
        () => undefined,
      );
      socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array(0)));
      expect(socket.frames().filter((f) => f.kind === FrameKind.CREDIT)).toHaveLength(0);
    });

    it('calls onClose with the parsed reason when the core closes the channel', async () => {
      await connected();
      const onClose = vi.fn();
      client.openChannel(7, () => undefined, onClose);
      socket.receive(
        encodeFrame(
          7,
          FrameKind.CLOSE,
          enc.encode('{"reason":"exited","exit_code":0,"signal":null}'),
        ),
      );
      expect(onClose).toHaveBeenCalledWith({ reason: 'exited', exit_code: 0, signal: null });
    });

    it('calls onClose with null for an empty CLOSE', async () => {
      await connected();
      const onClose = vi.fn();
      client.openChannel(7, () => undefined, onClose);
      socket.receive(encodeFrame(7, FrameKind.CLOSE, new Uint8Array(0)));
      expect(onClose).toHaveBeenCalledWith(null);
    });

    it('closeChannel sends CLOSE and stops delivering, ignoring the core answer', async () => {
      await connected();
      const onData = vi.fn();
      const onClose = vi.fn();
      client.openChannel(7, onData, onClose);
      client.closeChannel(7);
      expect(socket.frames().some((f) => f.channel === 7 && f.kind === FrameKind.CLOSE)).toBe(true);
      socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array([1])));
      socket.receive(encodeFrame(7, FrameKind.CLOSE, new Uint8Array(0)));
      expect(onData).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('notifies open channels when the socket closes', async () => {
      await connected();
      const onClose = vi.fn();
      client.openChannel(7, () => undefined, onClose);
      socket.close();
      expect(onClose).toHaveBeenCalledWith({ reason: 'connection_closed' });
    });

    it('sends frames on a channel with send()', async () => {
      await connected();
      client.send(7, FrameKind.DATA, new Uint8Array([65]));
      const f = socket.frames().find((x) => x.channel === 7);
      expect(f).toMatchObject({ kind: FrameKind.DATA, payload: new Uint8Array([65]) });
    });
  });

  describe('ensureOpen', () => {
    it('connects when closed', async () => {
      const p = client.ensureOpen();
      expect(client.state()).toBe('connecting');
      socket.open();
      socket.receive(helloReply());
      await p;
      expect(client.state()).toBe('open');
    });

    it('resolves immediately when already open, without a second socket', async () => {
      await connected();
      const first = socket;
      await client.ensureOpen();
      expect(socket).toBe(first);
    });

    it('waits for a connect in progress instead of opening another socket', async () => {
      const p = client.connect();
      const first = socket;
      const waiter = client.ensureOpen();
      socket.open();
      socket.receive(helloReply());
      await Promise.all([p, waiter]);
      expect(socket).toBe(first);
      expect(client.state()).toBe('open');
    });

    it('rejects every waiter when the connect in progress fails', async () => {
      const p = client.connect();
      const waiter = client.ensureOpen();
      socket.close();
      await expect(p).rejects.toBeInstanceOf(HcError);
      await expect(waiter).rejects.toBeInstanceOf(HcError);
    });
  });

  describe('async credit', () => {
    const credits = () => socket.frames().filter((f) => f.kind === FrameKind.CREDIT);
    const flush = () => new Promise((resolve) => setTimeout(resolve));

    it('sends CREDIT only after the handler promise settles', async () => {
      await connected();
      let finish!: () => void;
      client.openChannel(
        7,
        () => new Promise<void>((resolve) => (finish = resolve)),
        () => undefined,
      );
      socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array(42)));
      await flush();
      expect(credits()).toHaveLength(0);
      finish();
      await flush();
      expect(credits()).toHaveLength(1);
      expect(
        new DataView(credits()[0].payload.buffer, credits()[0].payload.byteOffset).getUint32(
          0,
          true,
        ),
      ).toBe(42);
    });

    it('still sends CREDIT when the handler promise rejects', async () => {
      await connected();
      client.openChannel(
        7,
        () => Promise.reject(new Error('boom')),
        () => undefined,
      );
      socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array(5)));
      await flush();
      expect(credits()).toHaveLength(1);
    });

    it('sends no CREDIT for a channel closed while the write was pending', async () => {
      await connected();
      let finish!: () => void;
      client.openChannel(
        7,
        () => new Promise<void>((resolve) => (finish = resolve)),
        () => undefined,
      );
      socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array(5)));
      client.closeChannel(7);
      finish();
      await flush();
      expect(credits()).toHaveLength(0);
    });
  });

  describe('viewer frames', () => {
    const framesOn = (channel: number) => socket.frames().filter((f) => f.channel === channel);

    it('sendData splits into DATA frames of at most 64 KiB, in order', async () => {
      await connected();
      const big = new Uint8Array(64 * 1024 * 2 + 10).map((_, i) => i % 251);
      client.sendData(7, big);
      const frames = framesOn(7);
      expect(frames.map((f) => [f.kind, f.payload.length])).toEqual([
        [FrameKind.DATA, 65536],
        [FrameKind.DATA, 65536],
        [FrameKind.DATA, 10],
      ]);
      const joined = new Uint8Array(big.length);
      let o = 0;
      for (const f of frames) {
        joined.set(f.payload, o);
        o += f.payload.length;
      }
      expect(joined).toEqual(big);
    });

    it('sendData sends one frame for small input and nothing for empty input', async () => {
      await connected();
      client.sendData(7, new Uint8Array([1, 2]));
      client.sendData(7, new Uint8Array(0));
      expect(framesOn(7)).toHaveLength(1);
    });

    it('sendResize encodes u16 LE cols then rows', async () => {
      await connected();
      client.sendResize(7, 120, 40);
      const f = framesOn(7)[0];
      expect(f.kind).toBe(FrameKind.RESIZE);
      expect(Array.from(f.payload)).toEqual([120, 0, 40, 0]);
    });

    it('sendFocus encodes 1 / 0', async () => {
      await connected();
      client.sendFocus(7, true);
      client.sendFocus(7, false);
      expect(framesOn(7).map((f) => [f.kind, Array.from(f.payload)])).toEqual([
        [FrameKind.FOCUS, [1]],
        [FrameKind.FOCUS, [0]],
      ]);
    });
  });

  it('closes the socket on a protocol error and rejects pending calls', async () => {
    await connected();
    const p = client.call('a', {});
    const bad = encodeFrame(1, FrameKind.DATA, new Uint8Array(0));
    new DataView(bad.buffer).setUint32(5, 0xffffffff, true);
    socket.receive(bad);
    await expect(p).rejects.toBeInstanceOf(HcError);
    expect(client.state()).toBe('reconnecting');
    expect(socket.closed).toBe(true);
  });

  describe('reconnect', () => {
    const setVisibility = (state: 'visible' | 'hidden') => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    /** Drops the live socket the way the network does: a close event, nothing else. */
    const drop = () => socket.onclose?.({} as CloseEvent);
    async function handshake(): Promise<void> {
      socket.open();
      socket.receive(helloReply());
      await vi.advanceTimersByTimeAsync(0);
    }

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.useRealTimers();
      Reflect.deleteProperty(document, 'visibilityState');
    });

    it('goes reconnecting on a drop, retries with backoff and says hello again', async () => {
      await connected();
      expect(client.epoch()).toBe(1);
      drop();
      expect(client.state()).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(499);
      expect(sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(2);
      expect(client.state()).toBe('reconnecting');
      // the attempt fails: the next one waits twice as long
      drop();
      await vi.advanceTimersByTimeAsync(999);
      expect(sockets).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(3);
      await handshake();
      expect(client.state()).toBe('open');
      expect(client.epoch()).toBe(2);
      expect(dec.decode(socket.sent[0])).toContain('"method":"hello"');
    });

    it('starts the backoff over after a successful reconnect', async () => {
      await connected();
      drop();
      await vi.advanceTimersByTimeAsync(500);
      drop();
      await vi.advanceTimersByTimeAsync(1000);
      await handshake();
      drop();
      await vi.advanceTimersByTimeAsync(499);
      expect(sockets).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(4);
    });

    it('closes open channels with connection_closed and drops keys while disconnected', async () => {
      await connected();
      const onClose = vi.fn();
      client.openChannel(7, () => undefined, onClose);
      drop();
      expect(onClose).toHaveBeenCalledWith({ reason: 'connection_closed' });
      client.sendData(7, new Uint8Array([97]));
      expect(sockets[0].sent).toHaveLength(1); // only the hello
      await expect(client.call('server.status', {})).rejects.toMatchObject({
        kind: 'not_connected',
      });
    });

    it('ensureOpen waits for the reconnect instead of failing', async () => {
      await connected();
      drop();
      let done = false;
      void client.ensureOpen().then(() => (done = true));
      await vi.advanceTimersByTimeAsync(500);
      expect(done).toBe(false);
      await handshake();
      expect(done).toBe(true);
    });

    it('pauses while hidden and retries at once when visible again', async () => {
      await connected();
      setVisibility('hidden');
      drop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sockets).toHaveLength(1);
      setVisibility('visible');
      expect(sockets).toHaveLength(2);
    });

    it('a timer that was waiting when the page hid does not fire while hidden', async () => {
      await connected();
      drop();
      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sockets).toHaveLength(1);
    });

    it('on resume, an open socket that never answers server.status is dropped and replaced', async () => {
      await connected();
      setVisibility('hidden');
      setVisibility('visible');
      expect(requests().some((r) => r.method === 'server.status')).toBe(true);
      await vi.advanceTimersByTimeAsync(2999);
      expect(client.state()).toBe('open');
      await vi.advanceTimersByTimeAsync(1);
      expect(client.state()).toBe('reconnecting');
      expect(socket.closed).toBe(true);
      await vi.advanceTimersByTimeAsync(500);
      expect(sockets).toHaveLength(2);
    });

    it('on resume, a socket that answers the probe stays', async () => {
      await connected();
      setVisibility('visible');
      const probe = requests().find((r) => r.method === 'server.status');
      socket.receive(rpc({ jsonrpc: '2.0', id: probe.id, result: {} }));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(client.state()).toBe('open');
      expect(sockets).toHaveLength(1);
    });

    it('probes on pageshow from the back/forward cache and on online', async () => {
      await connected();
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      const probes = () => requests().filter((r) => r.method === 'server.status');
      expect(probes()).toHaveLength(1);
      socket.receive(rpc({ jsonrpc: '2.0', id: probes()[0].id, result: {} }));
      await vi.advanceTimersByTimeAsync(0);
      window.dispatchEvent(new Event('pageshow')); // an ordinary load is not a resume
      expect(requests().filter((r) => r.method === 'server.status')).toHaveLength(1);
      window.dispatchEvent(new Event('online'));
      expect(requests().filter((r) => r.method === 'server.status')).toHaveLength(2);
    });

    it('online retries a waiting reconnect immediately', async () => {
      await connected();
      drop();
      window.dispatchEvent(new Event('online'));
      expect(sockets).toHaveLength(2);
    });

    it('stops and goes to /login when the session is gone', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      check.mockResolvedValue('anonymous');
      await connected();
      drop();
      await vi.advanceTimersByTimeAsync(500);
      drop(); // the upgrade was rejected
      await vi.advanceTimersByTimeAsync(0);
      expect(client.state()).toBe('closed');
      expect(navigate).toHaveBeenCalledWith('/login');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sockets).toHaveLength(2);
      void client.ensureOpen().catch(() => undefined); // a fresh login can connect again
      expect(sockets).toHaveLength(3);
    });

    it('abandons an attempt whose hello never comes and tries again', async () => {
      await connected();
      drop();
      await vi.advanceTimersByTimeAsync(500);
      expect(sockets).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(10_000); // connect timeout
      expect(sockets[1].closed).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(sockets).toHaveLength(3);
    });

    it('keeps retrying while the bridge is merely down', async () => {
      await connected();
      drop();
      for (let i = 0; i < 8; i++) {
        await vi.advanceTimersByTimeAsync(10_000);
        drop();
      }
      expect(sockets.length).toBeGreaterThan(8);
      expect(client.state()).toBe('reconnecting');
    });

    it('does not retry a first connect that failed', async () => {
      const p = client.connect();
      p.catch(() => undefined);
      drop();
      await expect(p).rejects.toBeInstanceOf(HcError);
      expect(client.state()).toBe('closed');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sockets).toHaveLength(1);
    });
  });
});
