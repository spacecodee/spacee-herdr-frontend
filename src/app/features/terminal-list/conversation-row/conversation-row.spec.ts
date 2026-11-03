import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Conversation } from '../../../core/list/conversations';
import { RowSwipe } from '../../../core/list/row-swipe';
import { ConversationRow } from './conversation-row';

const NOW = new Date(2026, 10, 2, 14, 30).getTime();
const base: Conversation = {
  kind: 'chat',
  address: 'rohan/t7',
  title: 'Fix login',
  preview: 'You: please retry',
  program: null,
  agent: 'claude',
  status: 'idle',
  time: NOW - 5 * 60_000,
};

async function setup(extra: Partial<Conversation> = {}, isStatic = false) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ConversationRow);
  fixture.componentRef.setInput('conversation', { ...base, ...extra });
  fixture.componentRef.setInput('now', NOW);
  fixture.componentRef.setInput('static', isStatic);
  const events = { rename: vi.fn(), close: vi.fn(), menu: vi.fn() };
  fixture.componentInstance.rename.subscribe(events.rename);
  fixture.componentInstance.close.subscribe(events.close);
  fixture.componentInstance.menu.subscribe(events.menu);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, events, navigate, swipe: TestBed.inject(RowSwipe) };
}
const render = async (extra: Partial<Conversation> = {}) => (await setup(extra)).el;

function pointer(target: Element, type: string, x: number, y = 100): void {
  target.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      clientX: x,
      clientY: y,
      button: 0,
      pointerType: 'touch',
      pointerId: 1,
    }),
  );
}

describe('ConversationRow', () => {
  it('shows title, relative time and the preview; no address or agent line', async () => {
    const el = await render();
    expect(el.querySelector('[data-title]')?.textContent?.trim()).toBe('Fix login');
    expect(el.querySelector('[data-time]')?.textContent?.trim()).toBe('5m');
    expect(el.querySelector('[data-preview]')?.textContent?.trim()).toBe('You: please retry');
    expect(el.querySelector('[data-meta]')).toBeNull();
    expect(el.textContent).not.toContain('rohan/t7');
  });

  it('keeps a preview to one line', async () => {
    expect((await render()).querySelector('[data-preview]')?.classList.contains('truncate')).toBe(true);
  });

  it('links to the terminal with the address as one path segment', async () => {
    const link = (await render()).querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/t/rohan%2Ft7');
  });

  it('names the link after the title, agent and any non-idle status', async () => {
    expect((await render()).querySelector('a')?.getAttribute('aria-label')).toBe('Fix login, Claude Code');
    const blocked = await render({ status: 'blocked', agent: 'pi' });
    expect(blocked.querySelector('a')?.getAttribute('aria-label')).toBe('Fix login, pi, blocked');
  });

  it('shows a muted Working… instead of the preview while the agent works', async () => {
    const el = await render({ status: 'working' });
    const preview = el.querySelector('[data-preview]')!;
    expect(preview.textContent?.replace(/\s/g, '')).toBe('Working...');
    expect(preview.classList.contains('text-muted-foreground')).toBe(true);
    expect(el.textContent).not.toContain('please retry');
  });

  it('says it waits for the answer when blocked, keeping the preview muted', async () => {
    const el = await render({ status: 'blocked' });
    const preview = el.querySelector('[data-preview]')!;
    expect(preview.textContent?.trim()).toBe('Waiting for your answer');
    expect(preview.classList.contains('text-muted-foreground')).toBe(true);
  });

  it('says "Asked you 3 questions" in the blocked colour when the agent asks, singular for one', async () => {
    const el = await render({ status: 'blocked', asking: 3 });
    const preview = el.querySelector('[data-preview]')!;
    expect(preview.textContent?.trim()).toBe('Asked you 3 questions');
    expect(preview.classList.contains('text-status-blocked-text')).toBe(true);
    expect((await render({ status: 'blocked', asking: 1 })).querySelector('[data-preview]')?.textContent?.trim()).toBe('Asked you 1 question');
  });

  it('leaves out the time and the preview when there are none', async () => {
    const el = await render({ time: null, preview: '' });
    expect(el.querySelector('[data-time]')).toBeNull();
    expect(el.querySelector('[data-preview]')).toBeNull();
  });

  it('gives a shell running a known program its glyph and name, on one line', async () => {
    const el = await render({ kind: 'shell', agent: 'shell', preview: 'nvim', program: 'editor', time: null });
    expect(el.querySelector('[data-program]')).not.toBeNull();
    expect(el.querySelector('[data-preview]')?.textContent?.trim()).toBe('nvim');
    expect(el.querySelector('[data-preview]')?.classList.contains('truncate')).toBe(true);
  });

  it('shows a shell as a lighter row: tab title, cwd line, no time, never Working…', async () => {
    const el = await render({
      kind: 'shell',
      agent: 'shell',
      title: 'Frontend',
      preview: 'code/app',
      time: null,
      status: 'working',
    });
    expect(el.querySelector('[data-title]')?.textContent?.trim()).toBe('Frontend');
    expect(el.querySelector('[data-preview]')?.textContent?.trim()).toBe('code/app');
    expect(el.querySelector('[data-time]')).toBeNull();
    expect(el.querySelector('.mark-shell')).not.toBeNull();
    expect(el.querySelector('[data-title]')?.classList.contains('font-semibold')).toBe(false);
    expect(el.querySelector('a')?.getAttribute('aria-label')).toBe('Frontend, Shell, working');
  });

  describe('actions', () => {
    it('has Rename and Close behind the row, out of reach until the row is swiped open', async () => {
      const { el } = await setup();
      const actions = el.querySelector('[data-swipe-actions]')!;
      expect(actions.hasAttribute('inert')).toBe(true);
      expect(Array.from(actions.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Rename', 'Close']);
    });

    it('opens on a left swipe past half, closes on a right swipe, and tells the others to close', async () => {
      const { fixture, el, swipe } = await setup();
      const slide = el.querySelector<HTMLElement>('[data-slide]')!;
      swipe.set('other');
      pointer(slide, 'pointerdown', 300);
      expect(swipe.open()).toBeNull();
      pointer(slide, 'pointermove', 250);
      pointer(slide, 'pointermove', 150);
      pointer(slide, 'pointerup', 150);
      await fixture.whenStable();
      expect(swipe.open()).toBe('rohan/t7');
      expect(el.querySelector('[data-swipe-actions]')?.hasAttribute('inert')).toBe(false);
      expect(el.querySelector<HTMLElement>('[data-slide]')?.style.transform).toBe('translateX(-56px)');
      pointer(slide, 'pointerdown', 100);
      pointer(slide, 'pointermove', 200);
      pointer(slide, 'pointerup', 200);
      await fixture.whenStable();
      expect(swipe.open()).toBeNull();
    });

    it('emits rename and close from the revealed buttons', async () => {
      const { fixture, el, events, swipe } = await setup();
      swipe.set('rohan/t7');
      await fixture.whenStable();
      const [rename, close] = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-swipe-actions] button'));
      rename.click();
      close.click();
      expect(events.rename).toHaveBeenCalledTimes(1);
      expect(events.close).toHaveBeenCalledTimes(1);
      expect(swipe.open()).toBeNull();
    });

    it('a tap on an open row closes it instead of opening the conversation', async () => {
      const { fixture, el, swipe, navigate } = await setup();
      swipe.set('rohan/t7');
      await fixture.whenStable();
      el.querySelector('a')!.click();
      expect(navigate).not.toHaveBeenCalled();
      expect(swipe.open()).toBeNull();
      el.querySelector('a')!.click();
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('does not open the menu on a scroll or a short press', async () => {
      const { el, events } = await setup();
      vi.useFakeTimers();
      try {
        const slide = el.querySelector<HTMLElement>('[data-slide]')!;
        pointer(slide, 'pointerdown', 100);
        pointer(slide, 'pointermove', 100, 160);
        vi.advanceTimersByTime(600);
        pointer(slide, 'pointerup', 100, 160);
        pointer(slide, 'pointerdown', 100);
        vi.advanceTimersByTime(200);
        pointer(slide, 'pointerup', 100);
        expect(events.menu).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('opens the menu after a 450 ms long press and swallows the click that follows', async () => {
      const { el, events, navigate } = await setup();
      vi.useFakeTimers();
      try {
        const slide = el.querySelector<HTMLElement>('[data-slide]')!;
        pointer(slide, 'pointerdown', 100);
        vi.advanceTimersByTime(450);
        expect(events.menu).toHaveBeenCalledTimes(1);
        pointer(slide, 'pointerup', 100);
        el.querySelector('a')!.click();
        expect(navigate).not.toHaveBeenCalled();
        el.querySelector('a')!.click();
        expect(navigate).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('opens the menu from a right click or the context menu key', async () => {
      const { el, events } = await setup();
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.querySelector('[data-slide]')!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(events.menu).toHaveBeenCalledTimes(1);
    });

    it('offers the same actions to keyboards and screen readers through a named button', async () => {
      const { el, events } = await setup();
      const button = el.querySelector<HTMLButtonElement>('[data-row-actions]')!;
      expect(button.getAttribute('aria-label')).toBe('Actions for Fix login');
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      button.click();
      expect(events.menu).toHaveBeenCalledTimes(1);
    });

    it('a static copy has no link, no actions and no gestures', async () => {
      const { el } = await setup({}, true);
      expect(el.querySelector('a')).toBeNull();
      expect(el.querySelector('button')).toBeNull();
      expect(el.querySelector('[data-title]')?.textContent?.trim()).toBe('Fix login');
    });
  });
});
