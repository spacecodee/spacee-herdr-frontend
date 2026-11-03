import { attachTouchSelection } from './touch-selection';

function touch(target: EventTarget, type: string, points: [number, number][]): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as { touches: unknown; changedTouches: unknown };
  const list = points.map(([clientX, clientY], identifier) => ({ identifier, clientX, clientY }));
  event.touches = type === 'touchend' ? [] : list;
  event.changedTouches = list;
  target.dispatchEvent(event as unknown as Event);
}

describe('attachTouchSelection', () => {
  let area: HTMLElement;
  let selected: boolean;
  let cleared: number;
  let dispose: () => void;
  let now: number;

  beforeEach(() => {
    area = document.createElement('div');
    document.body.append(area);
    selected = true;
    cleared = 0;
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    dispose = attachTouchSelection(area, {
      hasSelection: () => selected,
      clearSelection: () => {
        cleared++;
        selected = false;
      },
    });
  });

  afterEach(() => {
    dispose();
    area.remove();
    vi.restoreAllMocks();
  });

  const tap = (target: EventTarget, at: [number, number] = [10, 10]) => {
    touch(target, 'touchstart', [at]);
    now += 80;
    touch(target, 'touchend', [at]);
  };

  it('clears a selection when the user taps, inside the terminal or outside it', () => {
    tap(area);
    expect(cleared).toBe(1);
    selected = true;
    tap(document.body);
    expect(cleared).toBe(2);
  });

  it('also clears the browser own text selection', () => {
    const spy = vi.spyOn(window, 'getSelection').mockReturnValue({ removeAllRanges: vi.fn(), rangeCount: 1 } as unknown as Selection);
    tap(area);
    expect(spy.mock.results[0].value.removeAllRanges).toHaveBeenCalled();
  });

  it('leaves a long press alone, so selecting by long press still works', () => {
    touch(area, 'touchstart', [[10, 10]]);
    now += 700;
    touch(area, 'touchend', [[10, 10]]);
    expect(cleared).toBe(0);
  });

  it('leaves a drag alone: scrolling must not drop the selection', () => {
    touch(area, 'touchstart', [[10, 10]]);
    now += 100;
    touch(area, 'touchend', [[10, 80]]);
    expect(cleared).toBe(0);
  });

  it('has nothing to clear without a selection', () => {
    selected = false;
    tap(area);
    expect(cleared).toBe(0);
  });

  it('keeps a double or triple tap from selecting a word or a line', () => {
    touch(area, 'touchstart', [[10, 10]]);
    const single = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 });
    const double = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 });
    const reached: number[] = [];
    area.addEventListener('mousedown', (e) => reached.push(e.detail));
    area.dispatchEvent(single);
    area.dispatchEvent(double);
    expect(reached).toEqual([1]);
    expect(double.defaultPrevented).toBe(true);
  });

  it('does not touch a real mouse double click', () => {
    const reached: number[] = [];
    area.addEventListener('mousedown', (e) => reached.push(e.detail));
    area.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 2 }));
    expect(reached).toEqual([2]);
  });

  it('stops listening once disposed', () => {
    dispose();
    tap(area);
    expect(cleared).toBe(0);
  });
});
