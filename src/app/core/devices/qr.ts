import { encode } from 'uqr';

const QUIET_ZONE = 2;

/**
 * A QR code as one SVG path: `size` is the side in modules (quiet zone included), `path` has one
 * horizontal run of dark modules per segment. Generated in the browser, so it works offline.
 */
export function qrCode(text: string): { size: number; path: string } {
  const { data, size } = encode(text, { ecc: 'M', border: QUIET_ZONE });
  let path = '';
  data.forEach((row, y) => {
    let x = 0;
    while (x < size) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && row[x]) x++;
      path += `M${start} ${y}h${x - start}v1h-${x - start}z`;
    }
  });
  return { size, path };
}
