/** Typed or pasted text (xterm `onData`) as the UTF-8 bytes core expects. */
export function textToBytes(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

/** xterm `onBinary` (mouse reports above 223): one byte per char code. */
export function binaryToBytes(data: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
  return out;
}
