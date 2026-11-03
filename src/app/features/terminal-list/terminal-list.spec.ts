import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HcClient, HcError, type HcState } from '../../core/hc/hc-client';
import { TerminalStore, type MachineGroup, type StreamState } from '../../core/hc/terminal-store';
import type { Space } from '../../core/hc/spaces';
import type { Terminal } from '../../core/hc/types';
import { Session, type SessionState } from '../../core/session/session';
import { COLLAPSED_KEY } from '../../core/list/collapsed-groups';
import { Summaries } from '../../core/chat/summaries';
import type { Summary } from '../../core/list/conversations';
import { TerminalList } from './terminal-list';

const NOW = new Date(2026, 10, 2, 14, 30).getTime();
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

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
const group = (
  name: string,
  terminals: Terminal[],
  extra: Partial<MachineGroup> = {},
): MachineGroup => ({
  name,
  local: false,
  state: 'connected',
  terminals,
  ...extra,
});
const local = (terminals: Terminal[]) =>
  group('gandalf', terminals, { local: true, state: 'local' });

/** Lets pending promises finish, then renders what they changed. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

describe('TerminalList', () => {
  const groups = signal<MachineGroup[]>([]);
  const stream = signal<StreamState>('idle');
  const clientState = signal<HcState>('closed');
  const syncing = signal(false);
  const spaces = signal<Space[]>([]);
  const summaryList = signal<Summary[]>([]);
  const summariesLoaded = signal(true);
  const summariesNow = signal(NOW);
  const summariesStart = vi.fn();
  const summariesStop = vi.fn();
  let connect: ReturnType<typeof vi.fn>;
  let start: ReturnType<typeof vi.fn>;
  let check: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  afterEach(() => vi.unstubAllGlobals());

  async function setup() {
    TestBed.configureTestingModule({
      imports: [TerminalList],
      providers: [
        provideRouter([]),
        { provide: HcClient, useValue: { state: clientState, ensureOpen: connect } },
        { provide: TerminalStore, useValue: { groups, spaces, stream, syncing, ensureStarted: start } },
        { provide: Session, useValue: { check } },
        {
          provide: Summaries,
          useValue: {
            list: summaryList,
            loaded: summariesLoaded,
            now: summariesNow,
            start: summariesStart,
            stop: summariesStop,
          },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TerminalList);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    groups.set([]);
    stream.set('idle');
    syncing.set(false);
    spaces.set([]);
    summaryList.set([]);
    summariesLoaded.set(true);
    summariesStart.mockClear();
    summariesStop.mockClear();
    clientState.set('closed');
    connect = vi.fn(async () => clientState.set('open'));
    start = vi.fn(async () => stream.set('live'));
    check = vi.fn(async () => 'authenticated' as SessionState);
  });

  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[data-address]'));
  const addresses = (el: HTMLElement) => rows(el).map((r) => r.dataset['address']);

  describe('connection', () => {
    it('links to the settings page with an accessible name', async () => {
    const { el } = await setup();
    const link = el.querySelector('header a[href^="/settings"]')!;
    expect(link.getAttribute('aria-label')).toBe('Settings');
    expect(link.getAttribute('href')).toBe('/settings?from=%2F');
  });

  it('connects then starts the store on enter, and shows live', async () => {
      const { el } = await setup();
      expect(connect).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
      expect(connect.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Live');
    });

    it('shows connecting while the handshake is pending', async () => {
      connect = vi.fn(() => new Promise<void>(() => undefined));
      const { el } = await setup();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Connecting');
    });

    it('shows Reconnecting… while a first connect is retrying because the bridge is down', async () => {
      connect = vi.fn(() => new Promise<void>(() => undefined));
      clientState.set('reconnecting');
      const { el } = await setup();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Reconnecting…');
    });

    it('shows disconnected with Reconnect when the events channel closes, and reconnects', async () => {
      const { fixture, el } = await setup();
      stream.set('closed');
      clientState.set('closed');
      await settle(fixture);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Disconnected');
      const button = Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Reconnect'),
      );
      expect(button).toBeTruthy();
      button?.click();
      await settle(fixture);
      expect(connect).toHaveBeenCalledTimes(2);
      expect(start).toHaveBeenCalledTimes(2);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Live');
    });

    it('shows Reconnecting… without a Reconnect button while the client retries by itself', async () => {
      const { fixture, el } = await setup();
      stream.set('closed');
      clientState.set('reconnecting');
      await settle(fixture);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Reconnecting…');
      expect(
        Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.includes('Reconnect')),
      ).toBe(false);
      // and it is live again on its own once the client and the store are back
      clientState.set('open');
      stream.set('live');
      await settle(fixture);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Live');
    });

    it('never flashes Disconnected or Reconnect while the store resubscribes on an open socket', async () => {
      const { fixture, el } = await setup();
      const status = () => el.querySelector('[role="status"]')?.textContent;
      const reconnect = () =>
        Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.includes('Reconnect'));
      // the socket is back, the events channel is not yet
      stream.set('closed');
      clientState.set('open');
      syncing.set(true);
      await settle(fixture);
      expect(status()).toContain('Reconnecting…');
      expect(reconnect()).toBe(false);
      syncing.set(false);
      stream.set('live');
      await settle(fixture);
      expect(status()).toContain('Live');
    });

    it('says Connecting… while the store subscribes for the first time', async () => {
      const { fixture, el } = await setup();
      stream.set('idle');
      clientState.set('open');
      syncing.set(true);
      await settle(fixture);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Connecting…');
    });

    it('still offers Reconnect when the resubscribe finished and failed', async () => {
      const { fixture, el } = await setup();
      stream.set('closed');
      clientState.set('open');
      syncing.set(false);
      await settle(fixture);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Disconnected');
    });

    it('leaves the socket logic to ensureOpen when only the events channel closed', async () => {
      const { fixture, el } = await setup();
      stream.set('closed');
      await settle(fixture);
      Array.from(el.querySelectorAll('button'))
        .find((b) => b.textContent?.includes('Reconnect'))
        ?.click();
      await settle(fixture);
      expect(connect).toHaveBeenCalledTimes(2);
      expect(start).toHaveBeenCalledTimes(2);
    });

    it('goes back to /login when the connection fails and the session is no longer valid', async () => {
      connect = vi.fn().mockRejectedValue(new HcError('closed', 'connection_closed'));
      check = vi.fn(async () => 'anonymous' as SessionState);
      await setup();
      expect(navigate).toHaveBeenCalledWith('/login');
    });

    it('shows disconnected when the connection fails but the session is valid', async () => {
      connect = vi.fn().mockRejectedValue(new HcError('closed', 'connection_closed'));
      const { el } = await setup();
      expect(navigate).not.toHaveBeenCalled();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Disconnected');
    });
  });

  describe('conversations', () => {
    const space = (id: string, name: string, tabs: [string, string[]][]): Space => ({
      id,
      name,
      tabs: tabs.map(([tab, addresses]) => ({ id: `${id}-${tab}`, name: tab, addresses })),
    });
    const sum = (terminal: string, minutesAgo: number, extra: Partial<Summary> = {}): Summary => ({
      terminal,
      agent: 'claude',
      session: 's',
      title: `Title ${terminal}`,
      last: { role: 'assistant', text: `Last ${terminal}`, time: iso(minutesAgo) },
      messages: 3,
      ...extra,
    });
    const headings = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('h2')).map((h) => h.querySelector('[data-name]')?.textContent?.trim());
    const click = (el: HTMLElement, name: string) =>
      Array.from(el.querySelectorAll('button'))
        .find((b) => b.textContent?.includes(name))
        ?.click();

    beforeEach(() => {
      groups.set([
        local([
          term('t1', { name: 'api', status: { state: 'idle' } }),
          term('t2', { name: 'web', status: { state: 'working' } }),
          term('t3', { name: 'shell', cwd: '/home/me/code/app' }),
          term('t4', { state: 'finished' }),
        ]),
        group('rohan', [term('rohan/t7', { name: 'ops' })]),
      ]);
      spaces.set([space('s1', 'Work', [['Backend', ['t1']], ['Frontend', ['t2', 't3']]])]);
      summaryList.set([sum('t1', 90), sum('t2', 1), sum('rohan/t7', 400, { agent: 'codex' })]);
    });

    it('starts the summaries on enter and stops them when the screen is destroyed', async () => {
      const { fixture } = await setup();
      expect(summariesStart).toHaveBeenCalledTimes(1);
      fixture.destroy();
      expect(summariesStop).toHaveBeenCalledTimes(1);
    });

    it('titles the page Herdr', async () => {
      const { el } = await setup();
      expect(el.querySelector('h1')?.textContent).toBe('Herdr');
    });

    it('groups conversations by space, then machine, newest first, ignoring tabs', async () => {
      const { el } = await setup();
      expect(headings(el)).toEqual(['Work', 'rohan', 'Terminals']);
      expect(addresses(el)).toEqual(['t2', 't1', 'rohan/t7', 't3']);
    });

    it('puts terminals without a transcript in a Terminals section, closed by default', async () => {
      const { fixture, el } = await setup();
      const section = Array.from(el.querySelectorAll('app-list-section')).find((s) =>
        s.textContent?.includes('Terminals'),
      ) as HTMLElement;
      expect(section.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
      click(section, 'Terminals');
      await settle(fixture);
      expect(section.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
      expect(section.querySelector('[data-address="t3"]')?.textContent).toContain('code/app');
    });

    it('renders title, preview, time, agent and link of a conversation row', async () => {
      const { el } = await setup();
      const row = el.querySelector('[data-address="t1"]')!;
      expect(row.querySelector('[data-title]')?.textContent).toContain('Title t1');
      expect(row.querySelector('[data-preview]')?.textContent).toContain('Last t1');
      expect(row.querySelector('[data-time]')?.textContent?.trim()).toBe('13:00');
      expect(row.querySelector('a')?.getAttribute('href')).toBe('/t/t1');
      expect(row.querySelector('.mark-claude')).not.toBeNull();
    });

    it('shows Working… for a working agent and the blocked tint for a blocked one', async () => {
      groups.set([
        local([
          term('t1', { status: { state: 'working' } }),
          term('t2', { status: { state: 'blocked', app: 'claude' } }),
        ]),
      ]);
      spaces.set([]);
      summaryList.set([sum('t1', 1), sum('t2', 2)]);
      const { el } = await setup();
      expect(el.querySelector('[data-address="t1"] [data-preview]')?.textContent).toContain('Working');
      expect(el.querySelector('[data-address="t2"]')?.classList.contains('blocked-row')).toBe(true);
    });

    it('shows a Needs attention strip with a card per blocked terminal, hidden when none', async () => {
      groups.set([local([term('t1', { name: 'api', status: { state: 'blocked', app: 'claude' } }), term('t2')])]);
      spaces.set([]);
      summaryList.set([sum('t1', 1)]);
      const { fixture, el } = await setup();
      const cards = el.querySelectorAll('[data-attention] a');
      expect(cards).toHaveLength(1);
      expect(cards[0].getAttribute('href')).toBe('/t/t1');
      expect(cards[0].textContent).toContain('api');
      expect(cards[0].textContent).toContain('Needs your answer');
      groups.set([local([term('t1', { status: { state: 'idle' } })])]);
      await settle(fixture);
      expect(el.querySelector('[data-attention]')).toBeNull();
    });

    it('falls back to the machine grouping without a layout and lists unplaced terminals by machine', async () => {
      spaces.set([]);
      const { el } = await setup();
      expect(headings(el)).toEqual(['gandalf', 'rohan', 'Terminals']);
      spaces.set([space('s1', 'Work', [['Backend', ['t1']]])]);
    });

    it('shows the state of a remote machine only when it is not connected', async () => {
      groups.set([local([]), group('rohan', [term('rohan/t7')], { state: 'unreachable' })]);
      spaces.set([]);
      summaryList.set([sum('rohan/t7', 5)]);
      const { el } = await setup();
      expect(el.querySelector('app-list-section .note')?.textContent).toContain('unreachable');
    });

    it('filters by search over space, tab, name, title and last message', async () => {
      const { fixture, el } = await setup();
      const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
      expect(search.getAttribute('aria-label')).toBe('Search conversations');
      const type = async (value: string) => {
        search.value = value;
        search.dispatchEvent(new Event('input'));
        await settle(fixture);
      };
      await type('title t1');
      expect(addresses(el)).toEqual(['t1']);
      await type('LAST T2');
      expect(addresses(el)).toEqual(['t2']);
      await type('frontend');
      expect(addresses(el)).toEqual(['t2', 't3']);
      await type('rohan');
      expect(addresses(el)).toEqual(['rohan/t7']);
      await type('zzz');
      expect(addresses(el)).toEqual([]);
      expect(el.querySelector('[data-no-matches]')?.textContent).toContain('zzz');
      await type('');
      expect(addresses(el)).toHaveLength(4);
      expect(el.querySelector('[data-no-matches]')).toBeNull();
    });

    it('shows skeletons until the first summaries arrive, then the conversations', async () => {
      summariesLoaded.set(false);
      const { fixture, el } = await setup();
      expect(el.querySelector('[data-skeleton]')).not.toBeNull();
      expect(el.querySelector('[data-address="t1"]')).toBeNull();
      summariesLoaded.set(true);
      await settle(fixture);
      expect(el.querySelector('[data-skeleton]')).toBeNull();
      expect(el.querySelector('[data-address="t1"]')).not.toBeNull();
    });

    it('hides finished terminals', async () => {
      const { el } = await setup();
      expect(addresses(el)).not.toContain('t4');
    });

    it('updates when the store changes', async () => {
      const { fixture, el } = await setup();
      groups.set([local([term('t1', { status: { state: 'idle' } })])]);
      spaces.set([]);
      await settle(fixture);
      expect(addresses(el)).toEqual(['t1']);
    });

    it('opens a collapsed space when one of its conversations becomes blocked, never closes any', async () => {
      localStorage.setItem(COLLAPSED_KEY, '["space:s1"]');
      const { fixture, el } = await setup();
      const work = () => el.querySelector('app-list-section button')!;
      expect(work().getAttribute('aria-expanded')).toBe('false');
      groups.set([
        local([
          term('t1', { name: 'api', status: { state: 'blocked' } }),
          term('t2', { name: 'web' }),
        ]),
      ]);
      await settle(fixture);
      expect(work().getAttribute('aria-expanded')).toBe('true');
    });

    it('collapses a space and remembers it', async () => {
      const { fixture, el } = await setup();
      click(el, 'Work');
      await settle(fixture);
      expect(JSON.parse(localStorage.getItem(COLLAPSED_KEY)!)).toEqual(['space:s1']);
    });

    it('shows the empty state when live with no terminals, not before live', async () => {
      groups.set([local([])]);
      spaces.set([]);
      summaryList.set([]);
      const { fixture, el } = await setup();
      expect(el.textContent).toContain('No terminals');
      stream.set('closed');
      await settle(fixture);
      expect(el.textContent).not.toContain('No terminals');
    });
  });
});
