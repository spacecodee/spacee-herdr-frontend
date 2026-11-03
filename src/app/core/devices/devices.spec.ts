import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Session } from '../session/session';
import { Devices, type Device } from './devices';

const reply = (status: number, body?: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as Response;

const phone: Device = {
  id: 'a1',
  name: 'iPhone',
  platform: 'ios',
  created: '2026-10-20T09:00:00Z',
  lastSeen: '2026-11-03T11:59:00Z',
  current: true,
};
const pixel: Device = { ...phone, id: 'b2', name: 'Pixel 8', platform: 'android', current: false };

describe('Devices', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let devices: Devices;
  let session: { check: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    session = { check: vi.fn().mockResolvedValue('anonymous'), logout: vi.fn().mockResolvedValue(true) };
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: Session, useValue: session },
        { provide: Router, useValue: { navigateByUrl: navigate } },
      ],
    });
    devices = TestBed.inject(Devices);
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('load', () => {
    it('lists the devices from the bridge', async () => {
      fetchMock.mockResolvedValue(reply(200, [phone, pixel]));
      await devices.load();
      expect(devices.list()).toEqual([phone, pixel]);
      expect(devices.failed()).toBe(false);
      expect(fetchMock).toHaveBeenCalledWith('/api/devices', { credentials: 'same-origin' });
    });

    it('marks a failed load and keeps the previous list', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, [phone]));
      await devices.load();
      fetchMock.mockRejectedValueOnce(new TypeError('network'));
      await devices.load();
      expect(devices.failed()).toBe(true);
      expect(devices.list()).toEqual([phone]);
    });

    it('goes to login on 401, once, without a failure state', async () => {
      fetchMock.mockResolvedValue(reply(401));
      await devices.load();
      expect(session.check).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/login');
      expect(devices.failed()).toBe(false);
    });
  });

  describe('pair', () => {
    it('posts and returns the code with its expiry in milliseconds', async () => {
      fetchMock.mockResolvedValue(reply(200, { code: 'K7M2QX', expires: '2026-11-03T12:05:00Z' }));
      const pairing = await devices.pair();
      expect(pairing).toEqual({ code: 'K7M2QX', expires: Date.parse('2026-11-03T12:05:00Z') });
      expect(fetchMock).toHaveBeenCalledWith('/api/devices/pair', {
        method: 'POST',
        credentials: 'same-origin',
      });
    });

    it('is null when the bridge fails', async () => {
      fetchMock.mockResolvedValue(reply(500));
      expect(await devices.pair()).toBeNull();
    });
  });

  describe('rename', () => {
    it('patches the trimmed name and updates the list', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, [phone, pixel]));
      await devices.load();
      fetchMock.mockResolvedValueOnce(reply(204));
      expect(await devices.rename('b2', '  Work phone ')).toBe(true);
      expect(fetchMock).toHaveBeenLastCalledWith('/api/devices/b2', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{"name":"Work phone"}',
        credentials: 'same-origin',
      });
      expect(devices.list()?.find((d) => d.id === 'b2')?.name).toBe('Work phone');
    });

    it('is false on 400 and 404', async () => {
      fetchMock.mockResolvedValue(reply(400));
      expect(await devices.rename('b2', 'x')).toBe(false);
      fetchMock.mockResolvedValue(reply(404));
      expect(await devices.rename('b2', 'x')).toBe(false);
    });
  });

  describe('signOut', () => {
    it('deletes another device and drops it from the list', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, [phone, pixel]));
      await devices.load();
      fetchMock.mockResolvedValueOnce(reply(204));
      expect(await devices.signOut(pixel)).toBe(true);
      expect(fetchMock).toHaveBeenLastCalledWith('/api/devices/b2', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      expect(devices.list()).toEqual([phone]);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('treats a device that is already gone (404) as signed out', async () => {
      fetchMock.mockResolvedValue(reply(404));
      expect(await devices.signOut(pixel)).toBe(true);
    });

    it('signs this device out through the session and goes to login', async () => {
      expect(await devices.signOut(phone)).toBe(true);
      expect(session.logout).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('/login');
    });

    it('stays put when this device could not be signed out', async () => {
      session.logout.mockResolvedValue(false);
      expect(await devices.signOut(phone)).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('is false on a server error', async () => {
      fetchMock.mockResolvedValue(reply(500));
      expect(await devices.signOut(pixel)).toBe(false);
    });
  });
});
