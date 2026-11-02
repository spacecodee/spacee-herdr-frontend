import { TestBed } from '@angular/core/testing';
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
const rpc = (msg: unknown, channel = 0) => encodeFrame(channel, FrameKind.DATA, enc.encode(JSON.stringify(msg)));

describe('HcClient', () => {
  let socket: FakeSocket;
  let client: HcClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: HC_SOCKET_FACTORY,
          useValue: (url: string) => (socket = new FakeSocket(url)),
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

    it('rejects when the hello reply is an error', async () => {
      const p = client.connect();
      socket.open();
      socket.receive(
        enc.encode(
          JSON.stringify({ jsonrpc: '2.0', id: 0, error: { code: -32000, message: 'nope', data: { kind: 'bad' } } }) +
            '\n',
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
          error: { code: -32000, message: 'no terminal t9', data: { kind: 'not_found', hint: 'h' } },
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
      expect(client.state()).toBe('closed');
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
          order.push(`handler:${socket.frames().filter((f) => f.kind === FrameKind.CREDIT).length}`);
        },
        () => undefined,
      );
      socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array(100)));
      const credits = socket.frames().filter((f) => f.kind === FrameKind.CREDIT);
      expect(order).toEqual(['handler:0']);
      expect(credits).toHaveLength(1);
      expect(credits[0].channel).toBe(7);
      expect(new DataView(credits[0].payload.buffer, credits[0].payload.byteOffset).getUint32(0, true)).toBe(100);
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
      client.openChannel(7, (b) => got.push(Array.from(b)), () => undefined);
      expect(got).toEqual([[1, 2, 3]]);
      expect(socket.frames().filter((f) => f.kind === FrameKind.CREDIT)).toHaveLength(1);
    });

    it('delivers a frame in the same WebSocket message as the reply that names its channel', async () => {
      await connected();
      const got: number[][] = [];
      const p = client.call<{ channel: number }>('terminal.attach', {}).then((r) => {
        client.openChannel(r.channel, (b) => got.push(Array.from(b)), () => undefined);
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
      client.openChannel(7, () => undefined, () => undefined);
      socket.receive(encodeFrame(7, FrameKind.DATA, new Uint8Array(0)));
      expect(socket.frames().filter((f) => f.kind === FrameKind.CREDIT)).toHaveLength(0);
    });

    it('calls onClose with the parsed reason when the core closes the channel', async () => {
      await connected();
      const onClose = vi.fn();
      client.openChannel(7, () => undefined, onClose);
      socket.receive(
        encodeFrame(7, FrameKind.CLOSE, enc.encode('{"reason":"exited","exit_code":0,"signal":null}')),
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

  it('closes the socket on a protocol error and rejects pending calls', async () => {
    await connected();
    const p = client.call('a', {});
    const bad = encodeFrame(1, FrameKind.DATA, new Uint8Array(0));
    new DataView(bad.buffer).setUint32(5, 0xffffffff, true);
    socket.receive(bad);
    await expect(p).rejects.toBeInstanceOf(HcError);
    expect(client.state()).toBe('closed');
    expect(socket.closed).toBe(true);
  });
});
