import { TestBed } from '@angular/core/testing';
import { HcClient, HcError } from '../hc/hc-client';
import { CONFIG_ARGV } from './stats-load';
import { CACHE_MS, Stats, cacheKey } from './stats';

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const out = (over: Record<string, unknown> = {}) => ({ code: 0, stdout: b64(''), stderr: b64(''), truncated: false, timed_out: false, ...over });
const data = (d: unknown) => out({ stdout: b64(JSON.stringify({ data: d })) });
const empty = { search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } };

/** A core where gh answers every query with nothing, so a load ends in zeros. */
function quiet(params: { argv: string[] }) {
  if (params.argv[2] === CONFIG_ARGV[2]) return out({ code: 1 });
  const query = params.argv.find((a) => a.startsWith('query='))!;
  if (query.includes('viewer')) return data({ viewer: { login: 'me' } });
  if (query.includes('issueCount')) return data({ last: { issueCount: 3 }, prev: { issueCount: 1 }, open: { nodes: [] } });
  return data(empty);
}

/** In-memory localStorage: the test environment's own one is not reliable. */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  } as Storage;
}

describe('Stats', () => {
  let call: ReturnType<typeof vi.fn>;
  let stats: Stats;

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    call = vi.fn((_m: string, params: { argv: string[] }) => Promise.resolve(quiet(params)));
    TestBed.configureTestingModule({ providers: [{ provide: HcClient, useValue: { call } }] });
    stats = TestBed.inject(Stats);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is idle, then loading, then ready with the numbers and the time', async () => {
    expect(stats.view('')().status).toBe('idle');
    const pending = stats.load('');
    expect(stats.view('')().status).toBe('loading');
    await vi.runAllTimersAsync();
    await pending;
    const v = stats.view('')();
    expect(v.status).toBe('ready');
    expect(v.stats?.reviews).toEqual({ last30: 3, prev30: 1 });
    expect(v.stats?.weeks).toHaveLength(12);
    expect(v.at).toBe(Date.now());
  });

  it('runs on the machine asked for, with a timeout', async () => {
    await stats.load('gandalf');
    const params = call.mock.calls.find(([m, p]) => m === 'machine.exec' && p.argv[2] !== CONFIG_ARGV[2])![1];
    expect(params).toMatchObject({ on: 'gandalf', timeout: expect.any(Number) });
    expect(call.mock.calls.every(([, p]) => p.on === 'gandalf')).toBe(true);
    await stats.load('');
    expect(call.mock.calls.at(-1)![1]).not.toHaveProperty('on');
  });

  it('keeps only the numbers, per machine, in localStorage', async () => {
    await stats.load('gandalf');
    const raw = localStorage.getItem(cacheKey('gandalf'))!;
    const saved = JSON.parse(raw);
    expect(saved.at).toBe(Date.now());
    expect(saved.stats.reviews).toEqual({ last30: 3, prev30: 1 });
    expect(localStorage.getItem(cacheKey(''))).toBeNull();
    expect(cacheKey('')).not.toBe(cacheKey('gandalf'));
  });

  it('opens at once from a cache younger than 30 minutes, without asking gh', async () => {
    await stats.load('');
    const calls = call.mock.calls.length;
    vi.setSystemTime(Date.now() + CACHE_MS - 60_000);
    const fresh = TestBed.runInInjectionContext(() => new Stats());
    await fresh.load('');
    expect(call.mock.calls.length).toBe(calls);
    expect(fresh.view('')()).toMatchObject({ status: 'ready' });
    expect(fresh.view('')().stats?.reviews.last30).toBe(3);
  });

  it('reloads when the cache is 30 minutes old, showing the old numbers meanwhile', async () => {
    await stats.load('');
    const calls = call.mock.calls.length;
    vi.setSystemTime(Date.now() + CACHE_MS + 1);
    const fresh = TestBed.runInInjectionContext(() => new Stats());
    const pending = fresh.load('');
    expect(fresh.view('')()).toMatchObject({ status: 'ready', refreshing: true });
    await vi.runAllTimersAsync();
    await pending;
    expect(call.mock.calls.length).toBeGreaterThan(calls);
  });

  it('Refresh reloads now even with a fresh cache', async () => {
    await stats.load('');
    const calls = call.mock.calls.length;
    await stats.load('', true);
    expect(call.mock.calls.length).toBeGreaterThan(calls);
  });

  it('ignores a damaged cache', async () => {
    localStorage.setItem(cacheKey(''), '{"at":1,"stats":{"weeks":"no"}}');
    await stats.load('');
    expect(call).toHaveBeenCalled();
    expect(stats.view('')().status).toBe('ready');
  });

  it('shares one run between callers', async () => {
    const a = stats.load('');
    const b = stats.load('');
    expect(b).toBe(a);
    await a;
  });

  it('gh not logged in is its own state', async () => {
    call.mockResolvedValue(out({ code: 4, stderr: b64('To get started with GitHub CLI, please run:  gh auth login') }));
    await stats.load('');
    expect(stats.view('')()).toMatchObject({ status: 'not-logged-in', stats: null });
  });

  it('gh missing, a timeout and an offline machine are errors with a sentence', async () => {
    call.mockResolvedValue(out({ code: 127, stderr: b64('gh: not found') }));
    await stats.load('');
    expect(stats.view('')()).toMatchObject({ status: 'error', message: expect.stringContaining('not installed') });
    call.mockRejectedValue(new HcError('x', 'machine_unknown'));
    await stats.load('rohan', true);
    expect(stats.view('rohan')()).toMatchObject({ status: 'error', message: 'rohan is offline.' });
    call.mockResolvedValue(out({ timed_out: true, code: null }));
    await stats.load('', true);
    expect(stats.view('')().status).toBe('error');
  });

  it('a failed refresh keeps the last numbers and says so', async () => {
    await stats.load('');
    call.mockResolvedValue(out({ code: 1, stderr: b64('HTTP 502') }));
    await stats.load('', true);
    expect(stats.view('')()).toMatchObject({ status: 'ready', failed: true, message: expect.any(String) });
    expect(stats.view('')().stats).not.toBeNull();
  });
});
