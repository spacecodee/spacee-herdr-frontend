import { barKeyBytes, ctrlBytes, type BarKey } from './key-bytes';

const arr = (b: Uint8Array | null) => (b ? Array.from(b) : null);
const plain = { ctrl: false, appCursor: false };

describe('barKeyBytes', () => {
  it('sends Esc and Tab the same in every mode', () => {
    for (const opts of [
      plain,
      { ctrl: false, appCursor: true },
      { ctrl: true, appCursor: false },
      { ctrl: true, appCursor: true },
    ]) {
      expect(arr(barKeyBytes('esc', opts))).toEqual([0x1b]);
      expect(arr(barKeyBytes('tab', opts))).toEqual([0x09]);
    }
  });

  const arrows: [BarKey, string][] = [
    ['up', 'A'],
    ['down', 'B'],
    ['right', 'C'],
    ['left', 'D'],
  ];
  const codes = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

  it.each(arrows)('sends %s as CSI normally', (key, letter) => {
    expect(arr(barKeyBytes(key, plain))).toEqual(codes(`\x1b[${letter}`));
  });

  it.each(arrows)('sends %s as SS3 in application cursor mode', (key, letter) => {
    expect(arr(barKeyBytes(key, { ctrl: false, appCursor: true }))).toEqual(
      codes(`\x1bO${letter}`),
    );
  });

  it.each(arrows)('sends %s with the Ctrl modifier in either mode', (key, letter) => {
    for (const appCursor of [false, true])
      expect(arr(barKeyBytes(key, { ctrl: true, appCursor }))).toEqual(
        codes(`\x1b[1;5${letter}`),
      );
  });
});

describe('ctrlBytes', () => {
  const enc = new TextEncoder();
  it('maps letters and control symbols', () => {
    expect(arr(ctrlBytes(enc.encode('c')))).toEqual([0x03]);
    expect(arr(ctrlBytes(enc.encode('C')))).toEqual([0x03]);
    expect(arr(ctrlBytes(enc.encode('[')))).toEqual([0x1b]);
    expect(arr(ctrlBytes(enc.encode('@')))).toEqual([0x00]);
    expect(arr(ctrlBytes(enc.encode('_')))).toEqual([0x1f]);
  });
  it('maps space and ?', () => {
    expect(arr(ctrlBytes(enc.encode(' ')))).toEqual([0x00]);
    expect(arr(ctrlBytes(enc.encode('?')))).toEqual([0x7f]);
  });
  it('has no form for digits, multi-byte or non-ASCII input', () => {
    expect(ctrlBytes(enc.encode('1'))).toBeNull();
    expect(ctrlBytes(enc.encode('ab'))).toBeNull();
    expect(ctrlBytes(enc.encode('é'))).toBeNull();
    expect(ctrlBytes(new Uint8Array())).toBeNull();
  });
});
