import {
  FrameDecoder,
  FrameKind,
  MAX_PAYLOAD,
  type DecodedItem,
  encodeCredit,
  encodeFrame,
  encodeResize,
} from './wire';

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (s: string) => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** A decoder already past the hello line. */
function framesDecoder(): FrameDecoder {
  const d = new FrameDecoder();
  d.push(text('{"jsonrpc":"2.0","id":0,"result":{}}\n'));
  return d;
}

describe('encodeFrame', () => {
  it('lays out [channel u32 LE][kind u8][len u32 LE][payload]', () => {
    expect(Array.from(encodeFrame(0x01020304, FrameKind.DATA, bytes(9, 8)))).toEqual([
      4, 3, 2, 1, 0, 2, 0, 0, 0, 9, 8,
    ]);
  });

  it('encodes credit as u32 LE', () => {
    expect(Array.from(encodeCredit(5, 0x00010203))).toEqual([5, 0, 0, 0, 1, 4, 0, 0, 0, 3, 2, 1, 0]);
  });

  it('encodes resize as u16 LE cols then rows', () => {
    expect(Array.from(encodeResize(7, 80, 24))).toEqual([7, 0, 0, 0, 3, 4, 0, 0, 0, 80, 0, 24, 0]);
  });
});

describe('FrameDecoder', () => {
  const hello = '{"jsonrpc":"2.0","id":0,"result":{"framed":true}}\n';

  it('emits the hello line first', () => {
    const d = new FrameDecoder();
    expect(d.push(text(hello))).toEqual([{ type: 'hello', json: hello.trimEnd() }]);
  });

  it('buffers a hello line split across chunks', () => {
    const d = new FrameDecoder();
    const raw = text(hello);
    expect(d.push(raw.subarray(0, 10))).toEqual([]);
    expect(d.push(raw.subarray(10))).toEqual([{ type: 'hello', json: hello.trimEnd() }]);
  });

  it('round-trips a frame', () => {
    const d = framesDecoder();
    const out = d.push(encodeFrame(3, FrameKind.DATA, bytes(1, 2, 3)));
    expect(out).toEqual([{ type: 'frame', channel: 3, kind: FrameKind.DATA, payload: bytes(1, 2, 3) }]);
  });

  it('decodes an empty payload', () => {
    const d = framesDecoder();
    expect(d.push(encodeFrame(3, FrameKind.CLOSE, new Uint8Array(0)))).toEqual([
      { type: 'frame', channel: 3, kind: FrameKind.CLOSE, payload: new Uint8Array(0) },
    ]);
  });

  it('decodes frames split at every byte boundary', () => {
    const stream = concat(
      encodeFrame(0, FrameKind.DATA, text('{"id":1}')),
      encodeFrame(9, FrameKind.DATA, bytes(1, 2, 3, 4)),
      encodeFrame(9, FrameKind.CLOSE, new Uint8Array(0)),
    );
    for (let cut = 0; cut <= stream.length; cut++) {
      const d = framesDecoder();
      const out = [...d.push(stream.subarray(0, cut)), ...d.push(stream.subarray(cut))];
      expect(out.map((i) => i.type === 'frame' && [i.channel, i.kind, i.payload.length])).toEqual([
        [0, FrameKind.DATA, 8],
        [9, FrameKind.DATA, 4],
        [9, FrameKind.CLOSE, 0],
      ]);
    }
  });

  it('decodes one byte at a time', () => {
    const d = framesDecoder();
    const stream = concat(encodeFrame(1, FrameKind.DATA, bytes(5, 6)), encodeFrame(2, FrameKind.DATA, bytes(7)));
    const out: DecodedItem[] = [];
    for (const b of stream) out.push(...d.push(bytes(b)));
    expect(out).toHaveLength(2);
  });

  it('decodes several frames in one chunk', () => {
    const d = framesDecoder();
    const out = d.push(concat(encodeFrame(1, FrameKind.DATA, bytes(1)), encodeFrame(2, FrameKind.DATA, bytes(2))));
    expect(out).toHaveLength(2);
  });

  it('decodes the hello line followed by frames in the same chunk', () => {
    const d = new FrameDecoder();
    const out = d.push(concat(text(hello), encodeFrame(0, FrameKind.DATA, bytes(1))));
    expect(out).toEqual([
      { type: 'hello', json: hello.trimEnd() },
      { type: 'frame', channel: 0, kind: FrameKind.DATA, payload: bytes(1) },
    ]);
  });

  it('rejects a payload over 16 MiB as soon as the header is read', () => {
    const d = framesDecoder();
    const header = encodeFrame(1, FrameKind.DATA, new Uint8Array(0));
    new DataView(header.buffer).setUint32(5, MAX_PAYLOAD + 1, true);
    expect(() => d.push(header)).toThrow(/16 MiB|too large|protocol/i);
  });

  it('accepts a payload of exactly the maximum size header', () => {
    const d = framesDecoder();
    const header = encodeFrame(1, FrameKind.DATA, new Uint8Array(0));
    new DataView(header.buffer).setUint32(5, MAX_PAYLOAD, true);
    expect(d.push(header)).toEqual([]);
  });

  it('stays failed after a protocol error', () => {
    const d = framesDecoder();
    const header = encodeFrame(1, FrameKind.DATA, new Uint8Array(0));
    new DataView(header.buffer).setUint32(5, MAX_PAYLOAD + 1, true);
    expect(() => d.push(header)).toThrow();
    expect(() => d.push(bytes(1))).toThrow();
  });
});
