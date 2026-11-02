/** herdr-core framed wire format: `[channel u32 LE][kind u8][len u32 LE][payload]`. Pure, no Angular. */

export const FrameKind = {
  DATA: 0,
  CREDIT: 1,
  CLOSE: 2,
  RESIZE: 3,
  FOCUS: 4,
  FACTS: 5,
} as const;
export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind];

export const HEADER_SIZE = 9;
/** Largest payload the protocol allows: 16 MiB. */
export const MAX_PAYLOAD = 16 * 1024 * 1024;

export type DecodedItem =
  | { type: 'hello'; json: string }
  | { type: 'frame'; channel: number; kind: number; payload: Uint8Array };

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export function encodeFrame(channel: number, kind: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(HEADER_SIZE + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, channel, true);
  view.setUint8(4, kind);
  view.setUint32(5, payload.length, true);
  out.set(payload, HEADER_SIZE);
  return out;
}

/** CREDIT: the number of bytes the viewer consumed. */
export function encodeCredit(channel: number, bytes: number): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setUint32(0, bytes, true);
  return encodeFrame(channel, FrameKind.CREDIT, payload);
}

export function encodeResize(channel: number, cols: number, rows: number): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(4);
  const view = new DataView(payload.buffer);
  view.setUint16(0, cols, true);
  view.setUint16(2, rows, true);
  return encodeFrame(channel, FrameKind.RESIZE, payload);
}

const NEWLINE = 0x0a;

/**
 * Streaming decoder. Starts in line mode: the first message from core is the plain JSON-RPC
 * hello reply ending in `\n`. Everything after it is frames. Buffers at most one frame.
 */
export class FrameDecoder {
  private buffer: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private framed = false;
  private failed: ProtocolError | null = null;

  push(chunk: Uint8Array): DecodedItem[] {
    if (this.failed) throw this.failed;
    this.buffer = this.buffer.length === 0 ? chunk.slice() : concat(this.buffer, chunk);
    const out: DecodedItem[] = [];
    let offset = 0;

    if (!this.framed) {
      const end = this.buffer.indexOf(NEWLINE);
      if (end === -1) return out;
      out.push({ type: 'hello', json: new TextDecoder().decode(this.buffer.subarray(0, end)).trimEnd() });
      offset = end + 1;
      this.framed = true;
    }

    while (this.buffer.length - offset >= HEADER_SIZE) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + offset, HEADER_SIZE);
      const len = view.getUint32(5, true);
      if (len > MAX_PAYLOAD) {
        this.failed = new ProtocolError(`frame payload of ${len} bytes exceeds the 16 MiB protocol limit`);
        this.buffer = new Uint8Array(0);
        throw this.failed;
      }
      if (this.buffer.length - offset < HEADER_SIZE + len) break;
      const start = offset + HEADER_SIZE;
      out.push({
        type: 'frame',
        channel: view.getUint32(0, true),
        kind: view.getUint8(4),
        payload: this.buffer.slice(start, start + len),
      });
      offset = start + len;
    }

    this.buffer = offset === 0 ? this.buffer : this.buffer.slice(offset);
    return out;
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
