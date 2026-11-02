import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { Push, type PushState } from '../../core/pwa/push';
import { Settings } from '../../core/settings/settings';
import { SettingsPage } from './settings';

describe('SettingsPage', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<SettingsPage>>;
  let settings: Settings;
  const pushState = signal<PushState>('off');
  const push = {
    state: pushState,
    busy: signal(false),
    error: signal<string | null>(null),
    enable: vi.fn(),
    disable: vi.fn(),
    test: vi.fn(),
  };
  const el = () => fixture.nativeElement as HTMLElement;
  const range = () => el().querySelector<HTMLInputElement>('input[type="range"]')!;
  const button = (name: string) =>
    el().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
    });
    pushState.set('off');
    push.error.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Push, useValue: push }],
    });
    settings = TestBed.inject(Settings);
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has a back link and a title', () => {
    expect(el().querySelector('a[href="/"]')?.getAttribute('aria-label')).toBe('Back to terminals');
    expect(el().querySelector('h1')?.textContent).toBe('Settings');
  });

  it('renders a labelled native range 9..20 at the current size', () => {
    expect(range().min).toBe('9');
    expect(range().max).toBe('20');
    expect(range().step).toBe('1');
    expect(range().value).toBe('12');
    expect(el().querySelector('label[for="font-size"]')?.textContent).toContain(
      'Terminal text size',
    );
    const out = el().querySelector('output')!;
    expect(out.textContent?.trim()).toBe('12 px');
    expect(out.getAttribute('aria-live')).toBe('polite');
  });

  it('applies range changes immediately', () => {
    range().value = '16';
    range().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(settings.terminalFontSize()).toBe(16);
    expect(el().querySelector('output')?.textContent?.trim()).toBe('16 px');
  });

  it('steps with the − and + buttons and stops at the ends', () => {
    button('Larger text').click();
    fixture.detectChanges();
    expect(settings.terminalFontSize()).toBe(13);
    button('Smaller text').click();
    button('Smaller text').click();
    expect(settings.terminalFontSize()).toBe(11);
    settings.setTerminalFontSize(9);
    fixture.detectChanges();
    expect(button('Smaller text').disabled).toBe(true);
    settings.setTerminalFontSize(20);
    fixture.detectChanges();
    expect(button('Larger text').disabled).toBe(true);
  });

  it('previews at the chosen size', () => {
    settings.setTerminalFontSize(18);
    fixture.detectChanges();
    const preview = el().querySelector<HTMLElement>('[data-preview]')!;
    expect(preview.style.fontSize).toBe('18px');
  });

  describe('scroll speed', () => {
    const speedRange = () => el().querySelector<HTMLInputElement>('input#scroll-speed')!;

    it('renders a labelled native range 0.5..5 step 0.5 at the current speed', () => {
      expect(speedRange().type).toBe('range');
      expect(speedRange().min).toBe('0.5');
      expect(speedRange().max).toBe('5');
      expect(speedRange().step).toBe('0.5');
      expect(speedRange().value).toBe('2');
      expect(el().querySelector('label[for="scroll-speed"]')?.textContent).toContain(
        'Scroll speed',
      );
      const out = el().querySelector('output[for="scroll-speed"]')!;
      expect(out.textContent?.trim()).toBe('2×');
      expect(out.getAttribute('aria-live')).toBe('polite');
    });

    it('applies range changes immediately', () => {
      speedRange().value = '3.5';
      speedRange().dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(settings.scrollSpeed()).toBe(3.5);
      expect(el().querySelector('output[for="scroll-speed"]')?.textContent?.trim()).toBe('3.5×');
    });

    it('steps by 0.5 with the buttons and stops at the ends', () => {
      button('Faster scrolling').click();
      expect(settings.scrollSpeed()).toBe(2.5);
      button('Slower scrolling').click();
      button('Slower scrolling').click();
      expect(settings.scrollSpeed()).toBe(1.5);
      settings.setScrollSpeed(0.5);
      fixture.detectChanges();
      expect(button('Slower scrolling').disabled).toBe(true);
      settings.setScrollSpeed(5);
      fixture.detectChanges();
      expect(button('Faster scrolling').disabled).toBe(true);
    });
  });

  describe('default input', () => {
    const radios = () =>
      Array.from(el().querySelectorAll<HTMLInputElement>('input[type="radio"][name="input-mode"]'));

    it('offers Message and Direct typing, Message selected by default', () => {
      expect(el().querySelector('fieldset legend')?.textContent?.trim()).toBe('Default input');
      expect(radios().map((r) => r.value)).toEqual(['compose', 'direct']);
      expect(radios().map((r) => r.checked)).toEqual([true, false]);
      expect(
        radios().map((r) => el().querySelector(`label[for="${r.id}"]`)?.textContent?.trim()),
      ).toEqual(['Message field', 'Direct typing']);
    });

    it('saves the choice', () => {
      radios()[1].click();
      fixture.detectChanges();
      expect(settings.inputMode()).toBe('direct');
      expect(radios().map((r) => r.checked)).toEqual([false, true]);
    });
  });

  it('previews with the Nerd Font family first', () => {
    const preview = el().querySelector<HTMLElement>('[data-preview]')!;
    expect(getComputedStyle(preview).fontFamily).toContain('JetBrainsMono NFM');
  });

  describe('back link', () => {
    let navigate: ReturnType<typeof vi.spyOn>;

    async function openFrom(from?: string): Promise<HTMLAnchorElement> {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'settings', component: SettingsPage }]),
          { provide: Push, useValue: push },
        ],
      });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(
        from === undefined ? '/settings' : `/settings?from=${encodeURIComponent(from)}`,
        SettingsPage,
      );
      navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      return (harness.routeNativeElement as HTMLElement).querySelector(
        'a[aria-label="Back to terminals"]',
      )!;
    }

    it('returns to the terminal the user came from, replacing the settings entry', async () => {
      const back = await openFrom('/t/rohan%2Ft7');
      expect(back.getAttribute('href')).toBe('/t/rohan%2Ft7');
      back.click();
      expect(navigate).toHaveBeenCalledWith('/t/rohan%2Ft7', { replaceUrl: true });
    });

    it.each(['https://x', '//x'])('goes to / when from is unsafe (%s)', async (from) => {
      const back = await openFrom(from);
      back.click();
      expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    });

    it('goes to / when from is missing', async () => {
      const back = await openFrom();
      back.click();
      expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    });
  });
  describe('notifications', () => {
    const buttons = () => Array.from(el().querySelectorAll('section[aria-labelledby="notifications-heading"] button')).map((b) => b.textContent!.trim());
    const status = () => el().querySelector('[data-push-status]')?.textContent?.trim();
    const render = (state: PushState) => {
      pushState.set(state);
      fixture.detectChanges();
    };
    const click = (label: string) =>
      Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim() === label)!.click();

    it('explains what triggers them', () => {
      expect(el().querySelector('#notifications-heading')?.textContent).toBe('Notifications');
      expect(el().textContent).toContain('blocked or done');
      expect(el().textContent).toContain('finishes or is lost');
    });

    it('offers Enable only when off, and enabling is the only thing that asks', () => {
      render('off');
      expect(buttons()).toEqual(['Enable notifications']);
      expect(push.enable).not.toHaveBeenCalled();
      click('Enable notifications');
      expect(push.enable).toHaveBeenCalledOnce();
    });

    it('offers test and disable when on', () => {
      render('on');
      expect(buttons()).toEqual(['Send test notification', 'Disable notifications']);
      click('Send test notification');
      click('Disable notifications');
      expect(push.test).toHaveBeenCalledOnce();
      expect(push.disable).toHaveBeenCalledOnce();
    });

    it('tells iOS Safari to add the app to the Home Screen first, with no button', () => {
      render('needs-install');
      expect(status()).toContain('Add to Home Screen first');
      expect(buttons()).toEqual([]);
    });

    it('explains denied and unsupported without buttons', () => {
      render('denied');
      expect(status()).toContain('blocked');
      render('unsupported');
      expect(status()).toContain('cannot show notifications');
      expect(buttons()).toEqual([]);
    });

    it('shows an error as an alert', () => {
      push.error.set('Something went wrong.');
      render('off');
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('Something went wrong.');
    });
  });
});
