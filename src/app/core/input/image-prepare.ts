export const MAX_IMAGE_SIDE = 2048;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

export type PrepareFailure = 'too-big' | 'not-image';

export class ImageError extends Error {
  constructor(readonly reason: PrepareFailure) {
    super(reason);
  }
}

/** Scales so the long side is at most 2048 px, keeping the ratio. */
export function fitSize(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= MAX_IMAGE_SIDE) return { width, height };
  const scale = MAX_IMAGE_SIDE / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** RGBA pixel data with any non-opaque pixel. */
export function hasAlpha(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

export function outputType(source: string, alpha: boolean): 'image/png' | 'image/jpeg' {
  if (source === 'image/png') return 'image/png';
  if (source === 'image/jpeg') return 'image/jpeg';
  return alpha ? 'image/png' : 'image/jpeg';
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bmp = await createImageBitmap(file);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new ImageError('not-image');
    }
  }
}

/**
 * Makes a picked or pasted image uploadable: decoded, downscaled to 2048 px and re-encoded (PNG
 * for PNG or transparent sources, else JPEG), which also turns iOS HEIC into a supported type.
 * GIFs go as they are, since re-encoding would drop the animation.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif') {
    if (file.size > MAX_UPLOAD_BYTES) throw new ImageError('too-big');
    return file;
  }
  if (!file.type.startsWith('image/')) throw new ImageError('not-image');
  const img = await decode(file);
  try {
    const { width, height } = fitSize(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ImageError('not-image');
    const mayHaveAlpha = file.type !== 'image/png' && file.type !== 'image/jpeg';
    ctx.drawImage(img.source, 0, 0, width, height);
    const alpha = mayHaveAlpha && hasAlpha(ctx.getImageData(0, 0, width, height).data);
    const type = outputType(file.type, alpha);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, JPEG_QUALITY),
    );
    if (!blob) throw new ImageError('not-image');
    if (blob.size > MAX_UPLOAD_BYTES) throw new ImageError('too-big');
    return blob;
  } finally {
    img.close();
  }
}
