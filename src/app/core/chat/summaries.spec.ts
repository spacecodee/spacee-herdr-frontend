import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HcClient } from '../hc/hc-client';
import { TerminalStore } from '../hc/terminal-store';
import type { Terminal } from '../hc/types';
import type { Summary } from '../list/conversations';
import { SUMMARIES_FETCH, Summaries } from './summaries';

const term = (address: string, extra: Partial<Terminal> = {}): Terminal => ({
  address,
  labels: {},
  argv: ['sh'],
  cwd: '/',
  state: 'live',
  created_ms: 1,
  screen: 'exact',
  cols: 80,
  rows: 24,
  ...extra,
});

const summary = (terminal: string, text = 'hi'): Summary => ({
  terminal,
  agent: 'claude',
  session: 's',
  title: 'T',
  last: { role: 'assistant', text, time: 1 },
  messages: 1,
});

const ok = (summaries: Summary[]) =>
  new Response(JSON.stringify({ summaries }), { status: 200 });

describe('Summaries', () => {
  const epoch = signal(1);
  const terminals = signal<Terminal[]>([]);
  let fetchFake: ReturnType<typeof vi.fn>;
  let visibility: ReturnType<typeof vi.spyOn>;

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: SUMMARIES_FETCH, useValue: fetchFake },
        { provide: HcClient, useValue: { epoch } },
        { provide: TerminalStore, useValue: { terminals } },
      ],
    });
    const service = TestBed.inject(Summaries);
    TestBed.tick();
    return service;
  }

  /** Runs the timers and promises that `ms` of time would run. */
  const advance = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.tick();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    epoch.set(1);
    terminals.set([term('t1', { status: { state: 'idle' }, turn: 1 })]);
    fetchFake = vi.fn(async () => ok([summary('t1')]));
    visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });

  afterEach(() => {
    visibility.mockRestore();
    vi.useRealTimers();
  });

  it('fetches on start and exposes the summaries', async () => {
    const service = setup();
    expect(service.loaded()).toBe(false);
    service.start();
    await advance(0);
    expect(fetchFake).toHaveBeenCalledTimes(1);
    expect(fetchFake.mock.calls[0][0]).toBe('/api/chat/summaries');
    expect(fetchFake.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin' });
    expect(service.list().map((s) => s.terminal)).toEqual(['t1']);
    expect(service.loaded()).toBe(true);
    service.stop();
  });

  it('keeps the last good data when a later fetch fails or answers badly', async () => {
    const service = setup();
    service.start();
    await advance(0);
    fetchFake.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await service.refresh();
    expect(service.list()).toHaveLength(1);
    fetchFake.mockRejectedValueOnce(new Error('offline'));
    await service.refresh();
    expect(service.list()).toHaveLength(1);
    fetchFake.mockResolvedValueOnce(new Response('{"summaries":"x"}', { status: 200 }));
    await service.refresh();
    expect(service.list()).toHaveLength(1);
    expect(service.loaded()).toBe(true);
    service.stop();
  });

  it('is not loaded while the first fetch keeps failing', async () => {
    fetchFake.mockRejectedValue(new Error('offline'));
    const service = setup();
    service.start();
    await advance(0);
    expect(service.loaded()).toBe(false);
    expect(service.list()).toEqual([]);
    service.stop();
  });

  it('refreshes every 30 s while visible and skips ticks while hidden', async () => {
    const service = setup();
    service.start();
    await advance(0);
    await advance(30_000);
    expect(fetchFake).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('hidden');
    await advance(30_000);
    expect(fetchFake).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it('refreshes when the tab becomes visible again', async () => {
    const service = setup();
    service.start();
    await advance(0);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);
    expect(fetchFake).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);
    expect(fetchFake).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it('refreshes after each reconnect', async () => {
    const service = setup();
    service.start();
    await advance(0);
    epoch.set(2);
    TestBed.tick();
    await advance(0);
    expect(fetchFake).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it('refreshes once, 1 s after a status or turn change, however many arrive', async () => {
    const service = setup();
    service.start();
    await advance(0);
    terminals.set([term('t1', { status: { state: 'working' }, turn: 1 })]);
    TestBed.tick();
    await advance(400);
    terminals.set([term('t1', { status: { state: 'working' }, turn: 2 })]);
    TestBed.tick();
    await advance(999);
    expect(fetchFake).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchFake).toHaveBeenCalledTimes(2);
    await advance(900);
    expect(fetchFake).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it('ignores changes that are not a status or a turn', async () => {
    const service = setup();
    service.start();
    await advance(0);
    terminals.set([term('t1', { status: { state: 'idle' }, turn: 1, title: 'new', cols: 100 })]);
    TestBed.tick();
    await advance(2000);
    expect(fetchFake).toHaveBeenCalledTimes(1);
    service.stop();
  });

  it('does not let a slower, older answer overwrite a newer one', async () => {
    const service = setup();
    let release!: (r: Response) => void;
    fetchFake.mockImplementationOnce(() => new Promise<Response>((r) => (release = r)));
    service.start();
    await advance(0);
    fetchFake.mockResolvedValueOnce(ok([summary('t1', 'new')]));
    await service.refresh();
    release(ok([summary('t1', 'old')]));
    await advance(0);
    expect(service.list()[0].last?.text).toBe('new');
    service.stop();
  });

  it('stops all timers and triggers on stop', async () => {
    const service = setup();
    service.start();
    await advance(0);
    service.stop();
    await advance(60_000);
    epoch.set(5);
    TestBed.tick();
    terminals.set([term('t1', { status: { state: 'blocked' } })]);
    TestBed.tick();
    await advance(2000);
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it('moves the clock on every tick so relative times stay fresh', async () => {
    const service = setup();
    service.start();
    await advance(0);
    const first = service.now();
    await advance(30_000);
    expect(service.now()).toBeGreaterThan(first);
    service.stop();
  });
});
