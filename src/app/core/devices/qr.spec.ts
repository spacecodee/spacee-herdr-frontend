import { qrCode } from './qr';

describe('qrCode', () => {
  it('draws a square with a quiet zone and one SVG path of dark modules', () => {
    const qr = qrCode('https://example.test/login?code=K7M2QX');
    expect(qr.size).toBeGreaterThanOrEqual(29);
    expect(qr.path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
  });

  it('keeps the two-module quiet zone empty', () => {
    const { path } = qrCode('K7M2QX');
    const starts = [...path.matchAll(/M(\d+) (\d+)h/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.min(...starts.map(([x]) => x))).toBeGreaterThanOrEqual(2);
    expect(Math.min(...starts.map(([, y]) => y))).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic and differs per text', () => {
    expect(qrCode('AAAAAA').path).toBe(qrCode('AAAAAA').path);
    expect(qrCode('AAAAAA').path).not.toBe(qrCode('BBBBBB').path);
  });
});
