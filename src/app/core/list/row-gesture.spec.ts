import type { Mock } from 'vitest';
import { SWIPE_TRAVEL, LONG_PRESS_MS, RowGesture } from './row-gesture';

describe('RowGesture', () => {
  let drag: Mock<(offset: number) => void>;
  let release: Mock<(open: boolean) => void>;
  let longPress: Mock<() => void>;
  let gesture: RowGesture;

  beforeEach(() => {
    vi.useFakeTimers();
    drag = vi.fn<(offset: number) => void>();
    release = vi.fn<(open: boolean) => void>();
    longPress = vi.fn<() => void>();
    gesture = new RowGesture({ drag, release, longPress });
  });
  afterEach(() => vi.useRealTimers());

  it('opens a long press after 450 ms of holding still', () => {
    expect(LONG_PRESS_MS).toBe(450);
    gesture.down(100, 100, false);
    vi.advanceTimersByTime(449);
    expect(longPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(longPress).toHaveBeenCalledTimes(1);
    expect(gesture.up()).toEqual({ swiped: false, longPressed: true });
  });

  it('does not long press when the finger moves (a scroll or a swipe) or lifts early', () => {
    gesture.down(100, 100, false);
    gesture.move(100, 120);
    vi.advanceTimersByTime(1000);
    expect(longPress).not.toHaveBeenCalled();
    gesture.cancel();
    gesture.down(100, 100, false);
    vi.advanceTimersByTime(200);
    expect(gesture.up()).toEqual({ swiped: false, longPressed: false });
    vi.advanceTimersByTime(1000);
    expect(longPress).not.toHaveBeenCalled();
  });

  it('tolerates a little jitter under the slop while holding', () => {
    gesture.down(100, 100, false);
    gesture.move(103, 102);
    vi.advanceTimersByTime(450);
    expect(longPress).toHaveBeenCalledTimes(1);
  });

  it('follows a horizontal drag, clamped to the actions width, and opens past half', () => {
    gesture.down(200, 100, false);
    expect(gesture.move(150, 102)).toBe(true);
    expect(drag).toHaveBeenLastCalledWith(-50);
    gesture.move(0, 102);
    expect(drag).toHaveBeenLastCalledWith(-SWIPE_TRAVEL);
    gesture.move(190, 102);
    expect(gesture.up()).toEqual({ swiped: true, longPressed: false });
    expect(release).toHaveBeenLastCalledWith(false);
    gesture.down(200, 100, false);
    gesture.move(160, 100);
    gesture.up();
    expect(release).toHaveBeenLastCalledWith(true);
  });

  it('starts from the open position and cannot be dragged right of closed', () => {
    gesture.down(100, 100, true);
    gesture.move(110, 100);
    expect(drag).toHaveBeenLastCalledWith(-SWIPE_TRAVEL + 10);
    gesture.move(400, 100);
    expect(drag).toHaveBeenLastCalledWith(0);
  });

  it('leaves a vertical drag to the browser scroll', () => {
    gesture.down(100, 100, false);
    expect(gesture.move(102, 140)).toBe(false);
    expect(drag).not.toHaveBeenCalled();
    expect(gesture.up()).toEqual({ swiped: false, longPressed: false });
    expect(release).not.toHaveBeenCalled();
  });

  it('settles a dragged row when the pointer is cancelled', () => {
    gesture.down(200, 100, false);
    gesture.move(150, 100);
    gesture.cancel();
    expect(release).toHaveBeenLastCalledWith(true);
  });
});
