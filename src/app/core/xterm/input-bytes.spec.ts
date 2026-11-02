import { binaryToBytes, textToBytes } from './input-bytes';

describe('input-bytes', () => {
  it('encodes typed text as UTF-8', () => {
    expect(Array.from(textToBytes('aé✓'))).toEqual([0x61, 0xc3, 0xa9, 0xe2, 0x9c, 0x93]);
  });

  it('encodes binary input as one byte per char code, masked to 8 bits', () => {
    expect(Array.from(binaryToBytes('\x1b[M\xe9Ł'))).toEqual([0x1b, 0x5b, 0x4d, 0xe9, 0x41]);
  });

  it('handles empty input', () => {
    expect(textToBytes('')).toHaveLength(0);
    expect(binaryToBytes('')).toHaveLength(0);
  });
});
