import { DOCUMENT } from '@angular/common';
import { InjectionToken, Service, inject, signal } from '@angular/core';
import type { ChannelCloseReason, HelloResult } from './types';
import {
  FrameDecoder,
  FrameKind,
  ProtocolError,
  encodeCredit,
  encodeFrame,
  encodeResize,
  type DecodedItem,
} from './wire';

export type HcState = 'connecting' | 'open' | 'closed';

/** The slice of `WebSocket` the client needs, so specs can swap in a fake. */
export interface HcSocket {
  binaryType: BinaryType;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: Uint8Array<ArrayBuffer>): void;
  close(): void;
}

export const HC_SOCKET_FACTORY = new InjectionToken<(url: string) => HcSocket>(
  'HC_SOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => (url) => new WebSocket(url),
  },
);

/** A JSON-RPC error from core (`kind` is `data.kind`) or a local transport failure. */
export class HcError extends Error {
  constructor(
    message: string,
    readonly kind: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'HcError';
  }
}

interface RpcMessage {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string; data?: { kind?: string } };
}

type Frame = Extract<DecodedItem, { type: 'frame' }>;

interface ChannelHandlers {
  /** May return a promise: CREDIT goes out once it settles (the viewer has really consumed the bytes). */
  onData: (bytes: Uint8Array) => void | Promise<void>;
  onClose: (reason: ChannelCloseReason | null) => void;
}

interface Pending {
  resolve: (value: never) => void;
  reject: (error: HcError) => void;
}

/** Largest DATA frame we send; a big paste must stay far below the bridge's 1 MiB message limit. */
const MAX_SEND_CHUNK = 64 * 1024;

const HELLO = '{"jsonrpc":"2.0","id":0,"method":"hello","params":{"framed":true,"generation":1}}\n';

function rpcError(error: NonNullable<RpcMessage['error']>): HcError {
  return new HcError(
    error.message ?? 'rpc error',
    error.data?.kind ?? 'unknown',
    error.code,
    error.data,
  );
}

@Service()
export class HcClient {
  private readonly createSocket = inject(HC_SOCKET_FACTORY);
  private readonly location = inject(DOCUMENT).location;

  private readonly stateSignal = signal<HcState>('closed');
  private readonly helloSignal = signal<HelloResult | null>(null);
  readonly state = this.stateSignal.asReadonly();
  readonly hello = this.helloSignal.asReadonly();

  private socket: HcSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private decoder = new FrameDecoder();
  private helloWaiter: { resolve: () => void; reject: (error: HcError) => void } | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly channels = new Map<number, ChannelHandlers>();
  /** Frames for channels nobody opened yet (a reply and its stream can share one message). */
  private readonly early = new Map<number, Frame[]>();
  /** Channels we closed: late frames and core's answering CLOSE are dropped. */
  private readonly closing = new Set<number>();

  connect(): Promise<void> {
    if (this.socket)
      return Promise.reject(new HcError('already connecting or open', 'invalid_state'));
    const scheme = this.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = this.createSocket(`${scheme}//${this.location.host}/ws`);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.decoder = new FrameDecoder();
    this.nextId = 1;
    this.helloSignal.set(null);
    this.stateSignal.set('connecting');

    const promise = new Promise<void>((resolve, reject) => {
      this.helloWaiter = { resolve, reject };
      socket.onopen = () => socket.send(new TextEncoder().encode(HELLO));
      socket.onmessage = (ev) => this.onMessage(ev.data);
      socket.onclose = () => this.teardown(null);
      // An error is always followed by a close, which does the cleanup.
      socket.onerror = null;
    });
    this.connectPromise = promise;
    const clear = () => {
      if (this.connectPromise === promise) this.connectPromise = null;
    };
    promise.then(clear, clear);
    return promise;
  }

  /** Open already: resolves. Connecting: waits for that attempt. Closed: connects. */
  ensureOpen(): Promise<void> {
    if (this.stateSignal() === 'open') return Promise.resolve();
    return this.connectPromise ?? this.connect();
  }

  call<T>(method: string, params: unknown): Promise<T> {
    if (this.stateSignal() !== 'open') {
      return Promise.reject(new HcError('not connected', 'not_connected'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: never) => void, reject });
      const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.send(0, FrameKind.DATA, new TextEncoder().encode(body));
    });
  }

  /** Registers a stream channel (from `events.subscribe` / `terminal.attach`). */
  openChannel(
    channel: number,
    onData: (bytes: Uint8Array) => void | Promise<void>,
    onClose: (reason: ChannelCloseReason | null) => void,
  ): void {
    this.closing.delete(channel);
    this.channels.set(channel, { onData, onClose });
    const buffered = this.early.get(channel);
    this.early.delete(channel);
    for (const frame of buffered ?? []) {
      if (!this.channels.has(channel)) break;
      this.deliver(frame);
    }
  }

  /** Detaches: sends CLOSE and ignores anything else core still sends on the channel. */
  closeChannel(channel: number): void {
    this.early.delete(channel);
    if (!this.channels.delete(channel)) return;
    this.closing.add(channel);
    this.send(channel, FrameKind.CLOSE, new Uint8Array(0));
  }

  /** Sends one frame; a no-op when the socket is gone. */
  send(channel: number, kind: number, payload: Uint8Array): void {
    this.socket?.send(encodeFrame(channel, kind, payload));
  }

  /** Viewer input (keys, paste) as DATA, in frames small enough for the bridge. */
  sendData(channel: number, bytes: Uint8Array): void {
    for (let offset = 0; offset < bytes.length; offset += MAX_SEND_CHUNK) {
      this.send(channel, FrameKind.DATA, bytes.subarray(offset, offset + MAX_SEND_CHUNK));
    }
  }

  sendResize(channel: number, cols: number, rows: number): void {
    this.socket?.send(encodeResize(channel, cols, rows));
  }

  sendFocus(channel: number, focused: boolean): void {
    this.send(channel, FrameKind.FOCUS, new Uint8Array([focused ? 1 : 0]));
  }

  private onMessage(data: unknown): void {
    // Text messages are not part of the protocol. (No `instanceof`: it fails across realms.)
    if (typeof data === 'string' || data == null) return;
    let items: DecodedItem[];
    try {
      items = this.decoder.push(new Uint8Array(data as ArrayBuffer));
    } catch (e) {
      const message = e instanceof ProtocolError ? e.message : 'bad frame stream';
      this.teardown(new HcError(message, 'protocol_error'));
      return;
    }
    let failure: unknown;
    for (const item of items) {
      try {
        if (item.type === 'hello') this.onHello(item.json);
        else this.onFrame(item);
      } catch (e) {
        failure ??= e;
      }
    }
    // A throwing handler must not drop the frames that came after it.
    if (failure !== undefined) throw failure;
  }

  private onHello(json: string): void {
    let msg: RpcMessage;
    try {
      msg = JSON.parse(json) as RpcMessage;
    } catch {
      this.teardown(new HcError('unreadable hello reply', 'protocol_error'));
      return;
    }
    if (msg.error) return this.teardown(rpcError(msg.error));
    const hello = msg.result as HelloResult | undefined;
    if (hello?.framed !== true) {
      return this.teardown(new HcError('core did not switch to framed mode', 'protocol_error'));
    }
    this.helloSignal.set(hello);
    this.stateSignal.set('open');
    const waiter = this.helloWaiter;
    this.helloWaiter = null;
    waiter?.resolve();
  }

  private onFrame(frame: Frame): void {
    if (frame.channel === 0) {
      if (frame.kind === FrameKind.DATA) this.onReply(frame.payload);
      return;
    }
    if (this.closing.has(frame.channel)) {
      if (frame.kind === FrameKind.CLOSE) this.closing.delete(frame.channel);
      return;
    }
    if (!this.channels.has(frame.channel)) {
      const queue = this.early.get(frame.channel) ?? [];
      queue.push(frame);
      this.early.set(frame.channel, queue);
      return;
    }
    this.deliver(frame);
  }

  private onReply(payload: Uint8Array): void {
    let msg: RpcMessage;
    try {
      msg = JSON.parse(new TextDecoder().decode(payload)) as RpcMessage;
    } catch {
      return;
    }
    if (typeof msg.id !== 'number') return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) pending.reject(rpcError(msg.error));
    else pending.resolve(msg.result as never);
  }

  private deliver(frame: Frame): void {
    const handlers = this.channels.get(frame.channel);
    if (!handlers) return;
    if (frame.kind === FrameKind.DATA) {
      const credit = () => {
        // Nothing to credit once the viewer detached (or the socket is gone).
        if (frame.payload.length > 0 && this.channels.get(frame.channel) === handlers) {
          this.socket?.send(encodeCredit(frame.channel, frame.payload.length));
        }
      };
      let result: void | Promise<void>;
      try {
        result = handlers.onData(frame.payload);
      } catch (e) {
        credit();
        throw e;
      }
      if (result) result.then(credit, credit);
      else credit();
    } else if (frame.kind === FrameKind.CLOSE) {
      this.channels.delete(frame.channel);
      handlers.onClose(parseCloseReason(frame.payload));
    }
  }

  /** Single exit for every way a connection ends; idempotent. */
  private teardown(cause: HcError | null): void {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    socket.close();
    this.stateSignal.set('closed');

    const error = cause ?? new HcError('connection closed', 'connection_closed');
    const waiter = this.helloWaiter;
    this.helloWaiter = null;
    waiter?.reject(error);
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) p.reject(error);
    const channels = [...this.channels.values()];
    this.channels.clear();
    this.early.clear();
    this.closing.clear();
    for (const c of channels) c.onClose({ reason: error.kind });
  }
}

function parseCloseReason(payload: Uint8Array): ChannelCloseReason | null {
  if (payload.length === 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as ChannelCloseReason;
  } catch {
    return null;
  }
}
