import {
  MAX_IMAGE_SIDE,
  MAX_UPLOAD_BYTES,
  fitSize,
  hasAlpha,
  outputType,
  prepareImage,
} from './image-prepare';

describe('fitSize', () => {
  it('keeps small images', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('scales the long side down to 2048', () => {
    expect(fitSize(4096, 2048)).toEqual({ width: MAX_IMAGE_SIDE, height: 1024 });
    expect(fitSize(1500, 3000)).toEqual({ width: 1024, height: MAX_IMAGE_SIDE });
  });
  it('never returns a zero side', () => {
    expect(fitSize(20000, 1)).toEqual({ width: MAX_IMAGE_SIDE, height: 1 });
  });
});

describe('hasAlpha', () => {
  it('is false for opaque pixels', () => {
    expect(hasAlpha(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
  });
  it('is true when any pixel is not opaque', () => {
    expect(hasAlpha(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 10]))).toBe(true);
  });
});

describe('outputType', () => {
  it('keeps PNG and JPEG', () => {
    expect(outputType('image/png', false)).toBe('image/png');
    expect(outputType('image/jpeg', true)).toBe('image/jpeg');
  });
  it('uses PNG for other types with alpha, JPEG without', () => {
    expect(outputType('image/webp', true)).toBe('image/png');
    expect(outputType('image/heic', false)).toBe('image/jpeg');
  });
});

describe('prepareImage', () => {
  it('passes a small GIF through untouched', async () => {
    const gif = new File([new Uint8Array(10)], 'a.gif', { type: 'image/gif' });
    expect(await prepareImage(gif)).toBe(gif);
  });
  it('rejects a GIF over the limit', async () => {
    const gif = { type: 'image/gif', size: MAX_UPLOAD_BYTES + 1 } as File;
    await expect(prepareImage(gif)).rejects.toMatchObject({ reason: 'too-big' });
  });
  it('rejects a non-image', async () => {
    const f = new File(['x'], 'a.txt', { type: 'text/plain' });
    await expect(prepareImage(f)).rejects.toMatchObject({ reason: 'not-image' });
  });
});
