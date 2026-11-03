import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { APP_VERSION } from '../../core/pwa/app-version';
import { AppUpdates } from '../../core/pwa/app-updates';
import { Devices } from '../../core/devices/devices';
import { Machines } from '../../core/machines/machines';
import { Prompts } from '../../core/prompts/prompts';
import { Push, type PushState } from '../../core/pwa/push';
import { Quota, type MachineQuota } from '../../core/quota/quota';
import { UsageDisplay } from '../../core/quota/usage-display';
import { Settings } from '../../core/settings/settings';
import { SettingsPage } from './settings';

const quotaState = signal<MachineQuota>({ status: 'idle', report: null, at: null, refreshing: false, failed: false, message: '' });
const usageRemaining = signal(false);
const quotaProviders = [
  { provide: Quota, useValue: { view: () => quotaState, track: () => () => undefined } },
  { provide: UsageDisplay, useValue: { remaining: usageRemaining } },
];

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
  const updateReady = signal(false);
  const postponed = signal(false);
  const updates = {
    updateReady,
    postponed,
    cardVisible: signal(false),
    applying: signal(false),
    later: vi.fn(),
    applyUpdate: vi.fn(),
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
    updateReady.set(false);
    postponed.set(false);
    push.error.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Push, useValue: push }, { provide: AppUpdates, useValue: updates },
        { provide: Devices, useValue: { list: signal([]), failed: signal(false), load: vi.fn() } },
        { provide: Machines, useValue: { rows: signal([]), localName: signal('workstation'), load: vi.fn() } },
        ...quotaProviders,
      ],
    });
    settings = TestBed.inject(Settings);
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has a Devices section with an Add a device row', () => {
    expect(el().querySelector('app-devices-section h2')?.textContent).toContain('Devices');
    expect(el().querySelector('app-devices-section')?.textContent).toContain('Add a device');
  });

  it('has a Usage row at the top that opens Usage, with the Claude 5-hour figure', () => {
    const row = el().querySelector<HTMLAnchorElement>('[data-usage-row]')!;
    expect(row.getAttribute('href')).toContain('/usage');
    expect(row.getAttribute('href')).toContain('from=%2Fsettings');
    expect(row.textContent).toContain('Usage');
    expect(el().querySelector('[data-usage-figure]')).toBeNull();
    const session = { id: 'five_hour', kind: 'session' as const, label: '5-hour', percentUsed: 72, resetsAt: null, pace: null };
    quotaState.set({ status: 'ready', report: { generatedAt: 1, providers: [{ provider: 'claude', plan: 'max', status: 'ok', windows: [session] }] }, at: 1, refreshing: false, failed: false, message: '' });
    fixture.detectChanges();
    expect(el().querySelector('[data-usage-figure]')?.textContent).toContain('Claude 72%');
    usageRemaining.set(true);
    fixture.detectChanges();
    expect(el().querySelector('[data-usage-figure]')?.textContent).toContain('Claude 28%');
    usageRemaining.set(false);
    quotaState.update((s) => ({ ...s, status: 'idle', report: null }));
  });

  it('has a Stats row under Usage that opens Stats, with "12 weeks"', () => {
    const row = el().querySelector<HTMLAnchorElement>('[data-stats-row]')!;
    expect(row.getAttribute('href')).toContain('/stats');
    expect(row.getAttribute('href')).toContain('from=%2Fsettings');
    expect(row.textContent).toContain('Stats');
    expect(row.textContent).toContain('12 weeks');
    expect(el().querySelector('[data-usage-row]')!.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has a Saved prompts row under Stats with the count, that opens the list in manage mode', async () => {
    const row = el().querySelector<HTMLButtonElement>('[data-prompts-row]')!;
    expect(row.textContent).toContain('Saved prompts');
    expect(row.querySelector('[data-prompts-count]')?.textContent?.trim()).toBe('0');
    expect(el().querySelector('[data-stats-row]')!.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.querySelector('[data-prompts-sheet]')).toBeNull();
    row.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.body.querySelector('[data-prompts-sheet]')).not.toBeNull();
    expect(document.body.querySelector('[data-prompts-help]')?.textContent?.trim()).toBe('Tap to edit or delete');
    const prompts = TestBed.inject(Prompts);
    prompts.add('prompts', { title: 'A', text: 'a', sendNow: false });
    fixture.detectChanges();
    expect(row.querySelector('[data-prompts-count]')?.textContent?.trim()).toBe('1');
  });

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

  describe('return key', () => {
    const radios = () =>
      Array.from(el().querySelectorAll<HTMLInputElement>('input[type="radio"][name="return-key"]'));

    it('offers Send and New line, Send by default', () => {
      expect(radios().map((r) => r.value)).toEqual(['send', 'newline']);
      expect(radios().map((r) => r.checked)).toEqual([true, false]);
    });

    it('saves the choice', () => {
      radios()[1].click();
      fixture.detectChanges();
      expect(settings.returnKey()).toBe('newline');
    });
  });

  describe('always fit', () => {
    const toggle = () => el().querySelector<HTMLInputElement>('input[type="checkbox"][data-always-fit]')!;

    it('has a labelled "Always fit to this phone" switch, off by default', () => {
      expect(el().textContent).toContain('Always fit to this phone');
      expect(toggle().checked).toBe(false);
      expect(toggle().getAttribute('role')).toBe('switch');
    });

    it('saves the choice', () => {
      toggle().click();
      fixture.detectChanges();
      expect(settings.alwaysFit()).toBe(true);
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
          { provide: AppUpdates, useValue: updates },
          ...quotaProviders,
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

    it('shows the state as a dot and a 13px line, like the other statuses', () => {
      render('on');
      expect(el().querySelector('[data-push-status]')?.classList.contains('text-footnote')).toBe(true);
      expect(el().querySelector('[data-push-dot].bg-status-done')).not.toBeNull();
      render('off');
      expect(el().querySelector('[data-push-dot].bg-status-idle')).not.toBeNull();
      render('denied');
      expect(el().querySelector('[data-push-dot].bg-status-blocked')).not.toBeNull();
    });

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

  it('shows the diagnostics block and a Force update button', () => {
    expect(el().querySelector('[data-diagnostics]')?.textContent).toContain('safe-area:');
    const names = Array.from(el().querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(names).toContain('Force update');
  });

  describe('app updates', () => {
    const row = () => el().querySelector('[data-update-row]');
    const about = () => el().querySelector('[data-about]')!;

    it('has no update row without a postponed update', () => {
      expect(row()).toBeNull();
    });

    it('shows a top row with Reload once the update was postponed', () => {
      updateReady.set(true);
      postponed.set(true);
      fixture.detectChanges();
      expect(row()?.textContent).toContain('Update ready');
      expect(row()?.textContent).toContain('A new version is available.');
      const reload = [...row()!.querySelectorAll('button')].find((b) => b.textContent?.includes('Reload'))!;
      reload.click();
      expect(updates.applyUpdate).toHaveBeenCalledTimes(1);
    });

    it('shows the version and Up to date in About when nothing is waiting', () => {
      expect(about().textContent).toContain('Herdr');
      expect(about().textContent).toContain(`Version ${APP_VERSION}`);
      expect(about().textContent).toContain('Up to date');
      expect(about().textContent).not.toContain('Update ready');
    });

    it('shows an Update ready badge in About while an update waits', () => {
      updateReady.set(true);
      fixture.detectChanges();
      expect(about().textContent).toContain('Update ready');
      expect(about().textContent).not.toContain('Up to date');
    });
  });
});
