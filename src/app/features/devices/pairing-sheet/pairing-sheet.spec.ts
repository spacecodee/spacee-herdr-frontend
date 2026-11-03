import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Devices, type Pairing } from '../../../core/devices/devices';
import { PairingSheet } from './pairing-sheet';

const NOW = Date.parse('2026-11-03T12:00:00Z');

describe('PairingSheet', () => {
  let pair: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<PairingSheet>;
  let ref: ComponentRef<PairingSheet>;
  const q = <T extends Element>(sel: string) => document.body.querySelector<T>(sel);
  const button = (text: string) =>
    [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

  const pairing = (secondsLeft: number, code = 'K7M2QX'): Pairing => ({ code, expires: NOW + secondsLeft * 1000 });

  async function open() {
    ref.setInput('open', true);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  async function tick(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    pair = vi.fn().mockResolvedValue(pairing(299));
    TestBed.configureTestingModule({ providers: [{ provide: Devices, useValue: { pair } }] });
    fixture = TestBed.createComponent(PairingSheet);
    ref = fixture.componentRef;
    ref.setInput('open', false);
    fixture.detectChanges();
  });

  afterEach(() => {
    ref.setInput('open', false);
    fixture.detectChanges();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((e) => (e.innerHTML = ''));
    vi.useRealTimers();
  });

  it('asks for no code while closed', () => {
    expect(pair).not.toHaveBeenCalled();
    expect(q('[data-pairing-sheet]')).toBeNull();
  });

  it('asks for a code when it opens and shows it large as K7M 2QX', async () => {
    await open();
    expect(pair).toHaveBeenCalledTimes(1);
    expect(q('[data-pairing-code]')?.textContent?.trim()).toBe('K7M 2QX');
  });

  it('shows a QR of the login link on this host', async () => {
    await open();
    const svg = q<SVGElement>('[data-pairing-qr]');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('path')?.getAttribute('d')).toMatch(/^M\d+ \d+h/);
    expect(svg?.getAttribute('aria-label')).toContain('/login?code=K7M2QX');
  });

  it('counts down to expiry', async () => {
    await open();
    expect(q('[data-pairing-expiry]')?.textContent).toContain('Expires in 4:59');
    await tick(60_000);
    expect(q('[data-pairing-expiry]')?.textContent).toContain('Expires in 3:59');
  });

  it('greys the code out at 0:00 and offers a new one', async () => {
    await open();
    await tick(299_000);
    expect(q('[data-pairing-code]')?.hasAttribute('data-expired')).toBe(true);
    expect(q('[data-pairing-expiry]')?.textContent).toContain('Expired');
    expect(q('[data-pairing-qr]')).toBeNull();
    pair.mockResolvedValue({ code: 'ABC234', expires: Date.now() + 299_000 });
    button('Get a new code')!.click();
    await tick(0);
    expect(pair).toHaveBeenCalledTimes(2);
    expect(q('[data-pairing-code]')?.textContent?.trim()).toBe('ABC 234');
    expect(q('[data-pairing-code]')?.hasAttribute('data-expired')).toBe(false);
  });

  it('copies the code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await open();
    button('Copy code')!.click();
    await tick(0);
    expect(writeText).toHaveBeenCalledWith('K7M2QX');
    expect(button('Copied')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('offers a retry when no code could be made', async () => {
    pair.mockResolvedValue(null);
    await open();
    expect(q('[role="alert"]')?.textContent).toContain('Could not get a code');
    pair.mockResolvedValue(pairing(299));
    button('Get a new code')!.click();
    await tick(0);
    expect(q('[data-pairing-code]')?.textContent?.trim()).toBe('K7M 2QX');
  });

  it('asks for a fresh code every time it opens', async () => {
    await open();
    ref.setInput('open', false);
    fixture.detectChanges();
    await open();
    expect(pair).toHaveBeenCalledTimes(2);
  });
});
