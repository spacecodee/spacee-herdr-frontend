import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Devices, type Device } from '../../../core/devices/devices';
import { DevicesSection } from './devices-section';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const phone: Device = {
  id: 'a1',
  name: 'iPhone',
  platform: 'ios',
  created: '2026-10-20T09:00:00Z',
  lastSeen: '2026-11-03T11:59:30Z',
  current: true,
};
const pixel: Device = {
  id: 'b2',
  name: 'Pixel 8',
  platform: 'android',
  created: '2026-10-25T09:00:00Z',
  lastSeen: '2026-11-03T10:00:00Z',
  current: false,
};
const linux: Device = { ...pixel, id: 'c3', name: 'Work laptop', platform: 'other' };

describe('DevicesSection', () => {
  const list = signal<Device[] | null>(null);
  const failed = signal(false);
  let devices: { list: typeof list; failed: typeof failed; load: ReturnType<typeof vi.fn>; rename: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn>; pair: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<DevicesSection>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(sel: string) => document.body.querySelector<T>(sel);
  const buttons = (text: string) =>
    [...document.body.querySelectorAll('button')].filter((b) => b.textContent?.includes(text));
  const button = (text: string) => buttons(text)[0];

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const rows = () => [...el().querySelectorAll<HTMLElement>('[data-device]')];

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    list.set([phone, pixel, linux]);
    failed.set(false);
    devices = {
      list,
      failed,
      load: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(true),
      signOut: vi.fn().mockResolvedValue(true),
      pair: vi.fn().mockResolvedValue({ code: 'K7M2QX', expires: NOW + 299_000 }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Devices, useValue: devices }] });
    fixture = TestBed.createComponent(DevicesSection);
    await settle();
  });

  afterEach(() => {
    fixture.destroy();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((e) => (e.innerHTML = ''));
    vi.useRealTimers();
  });

  it('loads the devices when it appears', () => {
    expect(devices.load).toHaveBeenCalledTimes(1);
  });

  it('lists each device with name, last seen, signed-in date and a platform mark', () => {
    expect(rows()).toHaveLength(3);
    const first = rows()[0];
    expect(first.textContent).toContain('iPhone');
    expect(first.textContent).toContain('This device');
    expect(first.textContent).toContain('Active now');
    expect(first.textContent).toContain('signed in 20 Oct');
    expect(first.querySelector('[data-mark="apple"]')).not.toBeNull();
    expect(rows()[1].textContent).not.toContain('This device');
    expect(rows()[1].textContent).toContain('2h ago');
    expect(rows()[1].querySelector('[data-mark="android"]')).not.toBeNull();
    expect(rows()[2].querySelector('[data-mark="monitor"]')).not.toBeNull();
  });

  it('every row is a button that names the device for screen readers', () => {
    const row = rows()[1].closest('button')!;
    expect(row.getAttribute('aria-label')).toContain('Pixel 8');
  });

  it('shows a retry when the list could not be loaded', async () => {
    list.set(null);
    failed.set(true);
    await settle();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Could not load devices');
    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!.click();
    expect(devices.load).toHaveBeenCalledTimes(2);
  });

  describe('device actions', () => {
    async function openActions(index: number) {
      rows()[index].closest('button')!.click();
      await settle();
    }

    it('opens a sheet with Rename and Sign out device', async () => {
      await openActions(1);
      expect(q('[data-device-actions]')?.textContent).toContain('Pixel 8');
      expect(button('Rename')).toBeTruthy();
      expect(button('Sign out device')).toBeTruthy();
    });

    it('rename: validates, then saves the trimmed name', async () => {
      await openActions(1);
      button('Rename')!.click();
      await settle();
      const input = q<HTMLInputElement>('#device-name')!;
      expect(input.value).toBe('Pixel 8');
      input.value = '   ';
      input.dispatchEvent(new Event('input'));
      q<HTMLFormElement>('[data-device-rename] form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      expect(q('[data-device-rename] [role="alert"]')?.textContent).toContain('Enter a name');
      expect(devices.rename).not.toHaveBeenCalled();
      input.value = ' Work phone ';
      input.dispatchEvent(new Event('input'));
      q<HTMLFormElement>('[data-device-rename] form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      expect(devices.rename).toHaveBeenCalledWith('b2', ' Work phone ');
    });

    it('rename: keeps the sheet and says so when the bridge refuses', async () => {
      devices.rename.mockResolvedValue(false);
      await openActions(1);
      button('Rename')!.click();
      await settle();
      q<HTMLFormElement>('[data-device-rename] form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      expect(q('[data-device-rename] [role="alert"]')?.textContent).toContain('Could not rename');
    });

    it('sign out: asks first, with the explanation, then signs the device out', async () => {
      await openActions(1);
      button('Sign out device')!.click();
      await settle();
      const dialog = q('[data-device-confirm]')!;
      expect(dialog.textContent).toContain('Sign out Pixel 8?');
      expect(dialog.textContent).toContain('It will need a new code to sign in again, and its notifications stop.');
      expect(devices.signOut).not.toHaveBeenCalled();
      [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Sign out')!.click();
      await settle();
      expect(devices.signOut).toHaveBeenCalledWith(pixel);
    });

    it('sign out: Cancel does nothing', async () => {
      await openActions(1);
      button('Sign out device')!.click();
      await settle();
      [...q('[data-device-confirm]')!.querySelectorAll('button')].find((b) => b.textContent?.includes('Cancel'))!.click();
      await settle();
      expect(devices.signOut).not.toHaveBeenCalled();
    });

    it('sign out: says so when it failed', async () => {
      devices.signOut.mockResolvedValue(false);
      await openActions(1);
      button('Sign out device')!.click();
      await settle();
      [...q('[data-device-confirm]')!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Sign out')!.click();
      await settle();
      expect(q('[data-device-confirm] [role="alert"]')?.textContent).toContain('Could not sign out');
    });
  });

  it('"Add a device" opens the pairing sheet', async () => {
    expect(q('[data-pairing-sheet]')).toBeNull();
    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes('Add a device'))!.click();
    await settle();
    expect(q('[data-pairing-sheet]')).not.toBeNull();
    expect(devices.pair).toHaveBeenCalled();
  });
});
