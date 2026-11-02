import { attachTouchScroll } from './touch-scroll';

function touch(target: EventTarget, type: string, points: [number, number][]): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as {
    touches: unknown;
  };
  const list = points.map(([clientX, clientY], identifier) => ({ identifier, clientX, clientY }));
  event.touches = list;
  target.dispatchEvent(event as unknown as Event);
  return event as unknown as TouchEvent;
}

describe('attachTouchScroll', () => {
  let area: HTMLElement;
  let wheelTarget: HTMLElement;
  let wheels: WheelEvent[];
  let dispose: () => void;

  beforeEach(() => {
    area = document.createElement('div');
    wheelTarget = document.createElement('div');
    wheels = [];
    wheelTarget.addEventListener('wheel', (e) => wheels.push(e));
    dispose = attachTouchScroll(area, () => wheelTarget);
  });

  afterEach(() => dispose());

  const total = () => wheels.reduce((sum, w) => sum + w.deltaY, 0);

  it('turns an upward drag into positive wheel deltas (towards newer output) and prevents default', () => {
    touch(area, 'touchstart', [[10, 200]]);
    const moves = [touch(area, 'touchmove', [[10, 150]]), touch(area, 'touchmove', [[10, 100]])];
    expect(wheels.length).toBeGreaterThan(0);
    expect(wheels.every((w) => w.deltaMode === WheelEvent.DOM_DELTA_PIXEL)).toBe(true);
    expect(total()).toBe(100);
    expect(moves.every((m) => m.defaultPrevented)).toBe(true);
  });

  it('gives the legacy wheelDeltaY the sign of a real wheel, which xterm 6 reads', () => {
    touch(area, 'touchstart', [[10, 200]]);
    touch(area, 'touchmove', [[10, 150]]);
    const legacy = wheels.map((w) => (w as unknown as { wheelDeltaY: number }).wheelDeltaY);
    expect(legacy.reduce((a, b) => a + b, 0)).toBe(-50);
  });

  it('turns a downward drag into negative deltas', () => {
    touch(area, 'touchstart', [[10, 100]]);
    touch(area, 'touchmove', [[10, 160]]);
    expect(total()).toBe(-60);
  });

  it('does not preventDefault touchstart', () => {
    expect(touch(area, 'touchstart', [[10, 100]]).defaultPrevented).toBe(false);
  });

  it('keeps a tap a tap', () => {
    const start = touch(area, 'touchstart', [[10, 100]]);
    const move = touch(area, 'touchmove', [[12, 104]]);
    const end = touch(area, 'touchend', []);
    expect(wheels).toHaveLength(0);
    expect([start, move, end].some((e) => e.defaultPrevented)).toBe(false);
  });

  it('ignores multi-touch', () => {
    touch(area, 'touchstart', [
      [10, 100],
      [50, 100],
    ]);
    const move = touch(area, 'touchmove', [
      [10, 20],
      [50, 20],
    ]);
    expect(wheels).toHaveLength(0);
    expect(move.defaultPrevented).toBe(false);
  });

  it('stops scrolling when a second finger lands mid-drag', () => {
    touch(area, 'touchstart', [[10, 200]]);
    touch(area, 'touchmove', [[10, 100]]);
    const before = wheels.length;
    touch(area, 'touchstart', [
      [10, 100],
      [50, 100],
    ]);
    touch(area, 'touchmove', [
      [10, 50],
      [50, 50],
    ]);
    expect(wheels).toHaveLength(before);
  });

  it('dispatches nothing when there is no wheel target yet', () => {
    dispose();
    dispose = attachTouchScroll(area, () => null);
    touch(area, 'touchstart', [[10, 200]]);
    expect(() => touch(area, 'touchmove', [[10, 100]])).not.toThrow();
  });

  it('removes its listeners on dispose', () => {
    dispose();
    touch(area, 'touchstart', [[10, 200]]);
    const move = touch(area, 'touchmove', [[10, 100]]);
    expect(wheels).toHaveLength(0);
    expect(move.defaultPrevented).toBe(false);
  });
});
