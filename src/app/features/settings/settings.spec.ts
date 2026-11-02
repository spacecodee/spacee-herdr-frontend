import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Settings } from '../../core/settings/settings';
import { SettingsPage } from './settings';

describe('SettingsPage', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<SettingsPage>>;
  let settings: Settings;
  const el = () => fixture.nativeElement as HTMLElement;
  const range = () => el().querySelector<HTMLInputElement>('input[type="range"]')!;
  const button = (name: string) =>
    el().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
    });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    settings = TestBed.inject(Settings);
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has a back link and a title', () => {
    expect(el().querySelector('a[href="/"]')?.getAttribute('aria-label')).toBe(
      'Back to terminals',
    );
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
});
