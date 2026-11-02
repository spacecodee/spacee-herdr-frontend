import { TestBed } from '@angular/core/testing';
import { Session } from './session';

const response = (status: number) => ({ status, ok: status >= 200 && status < 300 }) as Response;

describe('Session', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let session: Session;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    session = TestBed.inject(Session);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('starts unknown', () => {
    expect(session.state()).toBe('unknown');
  });

  describe('check', () => {
    it('is authenticated on 204', async () => {
      fetchMock.mockResolvedValue(response(204));
      expect(await session.check()).toBe('authenticated');
      expect(session.state()).toBe('authenticated');
      expect(fetchMock).toHaveBeenCalledWith('/api/session', { credentials: 'same-origin' });
    });

    it('is anonymous on 401', async () => {
      fetchMock.mockResolvedValue(response(401));
      expect(await session.check()).toBe('anonymous');
      expect(session.state()).toBe('anonymous');
    });

    it('is anonymous when the bridge is unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('network'));
      expect(await session.check()).toBe('anonymous');
    });
  });

  describe('login', () => {
    it('posts the token as JSON and authenticates on 204', async () => {
      fetchMock.mockResolvedValue(response(204));
      expect(await session.login('s3cret')).toBe('ok');
      expect(session.state()).toBe('authenticated');
      expect(fetchMock).toHaveBeenCalledWith('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"token":"s3cret"}',
        credentials: 'same-origin',
      });
    });

    it('is invalid and anonymous on 401', async () => {
      fetchMock.mockResolvedValue(response(401));
      expect(await session.login('nope')).toBe('invalid');
      expect(session.state()).toBe('anonymous');
    });

    it('is unreachable when fetch fails or the status is unexpected', async () => {
      fetchMock.mockRejectedValue(new TypeError('network'));
      expect(await session.login('x')).toBe('unreachable');
      fetchMock.mockResolvedValue(response(500));
      expect(await session.login('x')).toBe('unreachable');
      expect(session.state()).not.toBe('authenticated');
    });
  });
});
