import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { authGuard } from './auth-guard';
import { Session } from './session';

const response = (status: number) => ({ status, ok: status >= 200 && status < 300 }) as Response;

describe('authGuard', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let session: Session;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    session = TestBed.inject(Session);
  });

  afterEach(() => vi.unstubAllGlobals());

  const run = () => TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));

  it('checks the session when unknown and lets an authenticated user in', async () => {
    fetchMock.mockResolvedValue(response(204));
    expect(await run()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-check a known session', async () => {
    fetchMock.mockResolvedValue(response(204));
    await session.check();
    fetchMock.mockClear();
    expect(await run()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redirects anonymous users to /login', async () => {
    fetchMock.mockResolvedValue(response(401));
    const result = await run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('lets the cached shell open when the bridge is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    expect(await run()).toBe(true);
  });

  it('checks again on the next navigation after an unreachable answer', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    await run();
    fetchMock.mockResolvedValue(response(401));
    const result = await run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
