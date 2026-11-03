import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Session } from '../session/session';
import { UploadError, Uploads } from './uploads';

describe('Uploads', () => {
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let check: ReturnType<typeof vi.fn>;
  const blob = new Blob(['png'], { type: 'image/png' });

  function service(): Uploads {
    router = { navigateByUrl: vi.fn() };
    check = vi.fn().mockResolvedValue('anonymous');
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: Session, useValue: { check } },
      ],
    });
    return TestBed.inject(Uploads);
  }
  afterEach(() => vi.unstubAllGlobals());

  it('posts the raw bytes with the cookie and returns the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ path: '/home/me/up/a.png' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await service().upload(blob)).toBe('/home/me/up/a.png');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/upload');
    expect(init).toMatchObject({ method: 'POST', body: blob, credentials: 'same-origin' });
    expect(init.headers).toMatchObject({ 'Content-Type': 'image/png' });
  });

  it.each([
    [413, 'too-big'],
    [415, 'not-image'],
    [401, 'session'],
    [502, 'unreachable'],
    [500, 'failed'],
  ])('maps %i to %s', async (status, reason) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await expect(service().upload(blob)).rejects.toMatchObject({ reason });
  });

  it('sends a 401 to the login flow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(service().upload(blob)).rejects.toBeInstanceOf(UploadError);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('maps a network failure to unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(service().upload(blob)).rejects.toMatchObject({ reason: 'unreachable' });
  });

  it('rejects a response without a path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 201 })));
    await expect(service().upload(blob)).rejects.toMatchObject({ reason: 'failed' });
  });
});
