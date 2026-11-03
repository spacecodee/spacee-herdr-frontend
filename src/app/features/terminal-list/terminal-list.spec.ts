import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { parsePermission, type PermissionPrompt } from '../../core/answers/permission';
import { CLAUDE_LIVE_SCREEN } from '../../core/answers/testing/claude-live-screen';
import { Permissions, type PermissionState } from '../../core/answers/permissions';
import { HcClient, HcError, type HcState } from '../../core/hc/hc-client';
import { TerminalStore, type MachineGroup, type StreamState } from '../../core/hc/terminal-store';
import type { Space } from '../../core/hc/spaces';
import type { Terminal } from '../../core/hc/types';
import { AppUpdates } from '../../core/pwa/app-updates';
import { Session, type SessionState } from '../../core/session/session';
import { COLLAPSED_KEY } from '../../core/list/collapsed-groups';
import { Summaries } from '../../core/chat/summaries';
import { LayoutActions } from '../../core/layout/layout-actions';
import { Quota } from '../../core/quota/quota';
import { UsageDisplay } from '../../core/quota/usage-display';
import { RowSwipe } from '../../core/list/row-swipe';
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
  const postponed = signal(false);
  const summariesStart = vi.fn();
  const summariesStop = vi.fn();
  const prompts = signal<Record<string, PermissionPrompt>>({});
  const permissionStates = signal<Record<string, PermissionState>>({});
  const probe = vi.fn(async (..._args: unknown[]) => undefined);
  const settlePrompt = vi.fn();
  const answer = vi.fn(async (..._args: unknown[]) => undefined);
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
        {
          provide: Permissions,
          useValue: { promptOf: (a: string) => prompts()[a] ?? null, stateOf: (a: string) => permissionStates()[a], probe, settle: settlePrompt, answer },
        },
        { provide: Session, useValue: { check } },
        { provide: Quota, useValue: { view: () => signal({ status: 'idle', report: null }), track: () => () => undefined } },
        { provide: UsageDisplay, useValue: { remaining: signal(false) } },
        { provide: AppUpdates, useValue: { postponed, cardVisible: signal(false), applying: signal(false), later: vi.fn() } },
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
    postponed.set(false);
    groups.set([]);
    stream.set('idle');
    syncing.set(false);
    spaces.set([]);
    summaryList.set([]);
    summariesLoaded.set(true);
    summariesStart.mockClear();
    summariesStop.mockClear();
    prompts.set({});
    permissionStates.set({});
    probe.mockClear();
    settlePrompt.mockClear();
    answer.mockClear();
    clientState.set('closed');
    connect = vi.fn(async () => clientState.set('open'));
    start = vi.fn(async () => stream.set('live'));
    check = vi.fn(async () => 'authenticated' as SessionState);
  });

  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[data-address]'));
  const addresses = (el: HTMLElement) => rows(el).map((r) => r.dataset['address']);

  describe('layout', () => {
    it('opens the new project sheet from the + button', async () => {
      const { el } = await setup();
      const button = el.querySelector<HTMLButtonElement>('header [data-new-project]')!;
      expect(button.getAttribute('aria-label')).toBe('New project');
      button.click();
      expect(TestBed.inject(LayoutActions).request()).toEqual({ kind: 'new-project' });
    });

    it('gives each project header and each placed row a menu, and a machine section none', async () => {
      groups.set([
        { name: 'gandalf', local: true, state: 'local', terminals: [term('t1'), term('t2')] },
        { name: 'rohan', local: false, state: 'connected', terminals: [term('rohan/t7')] },
      ]);
      spaces.set([
        {
          id: 's1',
          name: 'Work',
          tabs: [{ id: 'a', name: 'one', addresses: ['t1'], panes: [{ id: 'p1', address: 't1' }] }],
        },
      ]);
      const { el } = await setup();
      const menus = Array.from(el.querySelectorAll('[data-layout-menu]')).map((m) => m.getAttribute('aria-label'));
      // only the Work header has a "…"; rows reach their actions by swipe, long press or the Actions button
      expect(menus).toEqual(['More actions for Work']);
      expect(el.querySelectorAll('[data-row-actions]')).toHaveLength(3);
    });
  });

  describe('connection', () => {
    it('links to the settings page with an accessible name', async () => {
    const { el } = await setup();
    const link = el.querySelector('header a[href^="/settings"]')!;
    expect(link.getAttribute('aria-label')).toBe('Settings');
    expect(link.getAttribute('href')).toBe('/settings?from=%2F');
  });

  it('marks the settings gear with a dot while a postponed update waits', async () => {
    const { fixture, el } = await setup();
    const link = () => el.querySelector('header a[href^="/settings"]')!;
    expect(link().querySelector('[data-update-dot]')).toBeNull();
    postponed.set(true);
    fixture.detectChanges();
    expect(link().querySelector('[data-update-dot]')).not.toBeNull();
    expect(link().getAttribute('aria-label')).toBe('Settings, update ready');
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

    it('shows only the dot when live (the word is for screen readers) and the usage indicator', async () => {
      const { el } = await setup();
      expect(el.querySelector('[data-connection-label]')?.classList.contains('sr-only')).toBe(true);
      expect(el.querySelector('app-usage-indicator')).not.toBeNull();
    });

    it('still says the word when not live', async () => {
      connect = vi.fn(() => new Promise<void>(() => undefined));
      const { el } = await setup();
      expect(el.querySelector('[data-connection-label]')?.classList.contains('sr-only')).toBe(false);
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

  describe('row actions and header', () => {
    beforeEach(() => {
      groups.set([local([term('t1'), term('t2')])]);
      spaces.set([
        {
          id: 's1',
          name: 'Work',
          tabs: [
            { id: 'a', name: 'one', addresses: ['t1'], panes: [{ id: 'p1', address: 't1' }] },
            { id: 'b', name: 'two', addresses: ['t2'], panes: [{ id: 'p2', address: 't2' }] },
          ],
        },
      ]);
    });
    const slide = (el: HTMLElement, address: string) =>
      el.querySelector<HTMLElement>(`[data-address="${address}"] [data-slide]`)!;

    it('opens the lifted row and its menu on a context menu, dimmed list behind, and closes on the scrim', async () => {
      const { fixture, el } = await setup();
      slide(el, 't1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await settle(fixture);
      expect(el.querySelector('app-row-menu [role="dialog"]')?.getAttribute('aria-label')).toBe('Actions for one');
      expect(el.querySelector('app-row-menu [data-scrim]')).not.toBeNull();
      el.querySelector<HTMLElement>('app-row-menu [data-scrim]')!.click();
      await settle(fixture);
      expect(el.querySelector('app-row-menu')).toBeNull();
    });

    it('renames the tab from the menu', async () => {
      const { fixture, el } = await setup();
      slide(el, 't2').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await settle(fixture);
      Array.from(el.querySelectorAll<HTMLButtonElement>('app-row-menu [role="group"] button'))
        .find((b) => b.textContent?.includes('Rename'))!
        .click();
      await settle(fixture);
      expect(TestBed.inject(LayoutActions).request()).toEqual({ kind: 'rename', target: 'tab', id: 'b', name: 'two' });
      expect(el.querySelector('app-row-menu')).toBeNull();
    });

    it('closes through the confirmation from the swipe actions', async () => {
      const { fixture, el } = await setup();
      TestBed.inject(RowSwipe).set('t1');
      await settle(fixture);
      Array.from(el.querySelectorAll<HTMLButtonElement>('[data-address="t1"] [data-swipe-actions] button'))
        .find((b) => b.textContent?.includes('Close'))!
        .click();
      expect(TestBed.inject(LayoutActions).request()).toMatchObject({ kind: 'close', target: { kind: 'tab', id: 'a' } });
    });

    it('keeps one row open at a time, and a tap elsewhere or a scroll closes it', async () => {
      const { fixture, el } = await setup();
      const swipe = TestBed.inject(RowSwipe);
      swipe.set('t1');
      swipe.set('t2');
      expect(swipe.open()).toBe('t2');
      await settle(fixture);
      expect(el.querySelectorAll('[data-swipe-open]')).toHaveLength(1);
      slide(el, 't2').dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(swipe.open()).toBe('t2');
      el.querySelector('header')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(swipe.open()).toBeNull();
      swipe.set('t1');
      window.dispatchEvent(new Event('scroll'));
      expect(swipe.open()).toBeNull();
    });

    it('collapses the large title into the bar once the page scrolls', async () => {
      const { fixture, el } = await setup();
      const title = el.querySelector('[data-title]')!;
      expect(title.classList.contains('text-display')).toBe(true);
      Object.defineProperty(window, 'scrollY', { value: 120, configurable: true });
      try {
        window.dispatchEvent(new Event('scroll'));
        await settle(fixture);
        expect(title.classList.contains('text-headline')).toBe(true);
        expect(el.querySelector('header')?.classList.contains('border-border')).toBe(true);
      } finally {
        Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      }
    });

    it('centres the empty state with a New project button', async () => {
      groups.set([local([])]);
      spaces.set([]);
      const { el } = await setup();
      const empty = el.querySelector<HTMLElement>('[data-empty]')!;
      expect(empty.textContent).toContain('No projects yet');
      empty.querySelector('button')!.click();
      expect(TestBed.inject(LayoutActions).request()).toEqual({ kind: 'new-project' });
    });
  });

  describe('conversations', () => {
    const space = (id: string, name: string, tabs: [string, string[]][]): Space => ({
      id,
      name,
      tabs: tabs.map(([tab, addresses]) => ({ id: `${id}-${tab}`, name: tab, addresses, panes: addresses.map((a) => ({ id: `p${a}`, address: a })) })),
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

    it('groups by space in desktop order, tab after tab, then the other machines', async () => {
      const { el } = await setup();
      expect(headings(el)).toEqual(['Work', 'rohan']);
      // t2 is newer than t1 but the tab order of the layout wins
      expect(addresses(el)).toEqual(['t1', 't2', 't3', 'rohan/t7']);
    });

    it('keeps shells inside their space as compact rows, without a Terminals section', async () => {
      const { el } = await setup();
      expect(headings(el)).not.toContain('Terminals');
      const shell = el.querySelector('[data-address="t3"]')!;
      expect(shell.closest('app-list-section')?.textContent).toContain('Work');
      expect(shell.querySelector('[data-title]')?.textContent?.trim()).toBe('Frontend');
      expect(shell.querySelector('[data-preview]')?.textContent?.trim()).toBe('app');
      expect(shell.querySelector('[data-time]')).toBeNull();
      expect(shell.querySelector('.mark-shell')).not.toBeNull();
      expect(shell.querySelector('a')?.getAttribute('href')).toBe('/t/t3');
    });

    it('counts shells in the space header', async () => {
      const { el } = await setup();
      expect(el.querySelector('app-list-section [data-count]')?.textContent?.trim()).toBe('3');
    });

    it('renders title, preview, time, agent and link of a conversation row', async () => {
      const { el } = await setup();
      const row = el.querySelector('[data-address="t1"]')!;
      expect(row.querySelector('[data-title]')?.textContent).toContain('Backend');
      expect(row.querySelector('[data-preview]')?.textContent).toContain('Last t1');
      expect(row.querySelector('[data-time]')?.textContent?.trim()).toBe('13:00');
      expect(row.querySelector('a')?.getAttribute('href')).toBe('/t/t1');
      expect(row.querySelector('.mark-claude')).not.toBeNull();
    });

    it('shows Working… for a working agent and the wait for a blocked one, with no tint or bar', async () => {
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
      expect(el.querySelector('[data-address="t2"] [data-preview]')?.textContent).toContain('Waiting for your answer');
      expect(el.querySelector('[data-address="t2"] [data-dot].bg-status-blocked')).not.toBeNull();
      expect(el.querySelector('.blocked-row')).toBeNull();
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
      expect(cards[0].textContent).toContain('Needs attention');
      expect(cards[0].textContent).toContain('api (Claude Code) is waiting for you');
      groups.set([local([term('t1', { status: { state: 'idle' } })])]);
      await settle(fixture);
      expect(el.querySelector('[data-attention]')).toBeNull();
    });

    describe('permission prompts', () => {
      const prompt: PermissionPrompt = {
        agent: 'claude',
        title: 'Do you want to proceed?',
        request: ['pnpm test --watch=false', 'Run the unit tests', 'third'],
        choices: [
          { label: 'Yes', kind: 'approve' },
          { label: "Yes, and don't ask again", kind: 'approve-remember' },
          { label: 'No, and tell Claude what to do differently', kind: 'deny-text' },
        ],
        cursor: 0,
      };
      const blocked = (address: string, app = 'claude') => term(address, { name: 'api', status: { state: 'blocked', app } });

      it('reads the prompt of the one blocked agent, and only that one', async () => {
        groups.set([local([blocked('t1'), term('t2')])]);
        summaryList.set([sum('t1', 1)]);
        await setup();
        expect(probe).toHaveBeenCalledWith('t1', 'claude');
      });

      it('reads nothing when two agents are blocked, or when the agent asks a question', async () => {
        groups.set([local([blocked('t1'), blocked('t2', 'pi')])]);
        summaryList.set([sum('t1', 1), sum('t2', 1, { agent: 'pi' })]);
        await setup();
        expect(probe).not.toHaveBeenCalled();
      });

      it('does not read a question card', async () => {
        groups.set([local([blocked('t1', 'pi')])]);
        summaryList.set([sum('t1', 1, { agent: 'pi', asking: { count: 1, question: 'Which?' } })]);
        await setup();
        expect(probe).not.toHaveBeenCalled();
      });

      it('shows the request and two inline choices with More to the chat', async () => {
        groups.set([local([blocked('t1')])]);
        summaryList.set([sum('t1', 1)]);
        prompts.set({ t1: prompt });
        const { el } = await setup();
        const card = el.querySelector('[data-permission-inline]')!;
        expect(card.textContent).toContain('(Claude Code) needs you');
        expect(card.querySelector('[data-title]')?.textContent).toContain('Do you want to proceed?');
        expect(card.querySelector('[data-request]')?.textContent).toContain('pnpm test --watch=false');
        expect(card.querySelector('[data-request]')?.textContent).not.toContain('Run the unit tests');
        expect(card.querySelector('[data-inline-approve]')?.textContent?.trim()).toBe('Yes');
        expect(card.querySelector('[data-inline-deny]')?.textContent?.trim()).toBe('Deny');
        expect(card.querySelector('a')?.getAttribute('href')).toBe('/t/t1');
        expect(card.querySelector('a')?.textContent).toContain('More');
      });

      it('shows the real captured prompt: Yes and No, no panel text, no auto-mode switch', async () => {
        groups.set([local([blocked('t1')])]);
        summaryList.set([sum('t1', 1)]);
        prompts.set({ t1: parsePermission(CLAUDE_LIVE_SCREEN, 'claude')! });
        const { el } = await setup();
        const card = el.querySelector('[data-permission-inline]')!;
        expect(card.querySelector('[data-title]')?.textContent?.trim()).toBe('Do you want to proceed?');
        expect(card.querySelector('[data-request]')?.textContent?.trim()).toBe('touch segundo.txt');
        expect(card.querySelector('[data-inline-approve]')?.textContent?.trim()).toBe('Yes');
        expect(card.querySelector('[data-inline-deny]')?.textContent?.trim()).toBe('No');
        expect(card.textContent).not.toMatch(/FLIGHTDECK|session log|│/);
      });

      it('approve and deny answer through the service by row', async () => {
        groups.set([local([blocked('t1')])]);
        summaryList.set([sum('t1', 1)]);
        prompts.set({ t1: prompt });
        const { el } = await setup();
        (el.querySelector('[data-inline-approve]') as HTMLButtonElement).click();
        (el.querySelector('[data-inline-deny]') as HTMLButtonElement).click();
        expect(answer.mock.calls).toEqual([
          ['t1', 'claude', 0],
          ['t1', 'claude', 2],
        ]);
      });

      it('keeps the plain link row without a prompt, with two blocked agents, or after a failure', async () => {
        groups.set([local([blocked('t1')])]);
        summaryList.set([sum('t1', 1)]);
        const { fixture, el } = await setup();
        expect(el.querySelector('[data-permission-inline]')).toBeNull();
        expect(el.querySelector('[data-attention] a')?.textContent).toContain('is waiting for you');
        prompts.set({ t1: prompt });
        permissionStates.set({ t1: { phase: 'failed' } });
        await settle(fixture);
        expect(el.querySelector('[data-permission-inline]')).toBeNull();
        permissionStates.set({});
        groups.set([local([blocked('t1'), blocked('t2')])]);
        await settle(fixture);
        expect(el.querySelector('[data-permission-inline]')).toBeNull();
      });

      it('disables both buttons while an answer is being sent', async () => {
        groups.set([local([blocked('t1')])]);
        summaryList.set([sum('t1', 1)]);
        prompts.set({ t1: prompt });
        permissionStates.set({ t1: { phase: 'sending' } });
        const { el } = await setup();
        expect((el.querySelector('[data-inline-approve]') as HTMLButtonElement).disabled).toBe(true);
        expect((el.querySelector('[data-inline-deny]') as HTMLButtonElement).disabled).toBe(true);
      });
    });

    it('turns the strip card into a question card with Answer when the agent asks', async () => {
      groups.set([local([term('t1', { name: 'api', status: { state: 'blocked', app: 'pi' } })])]);
      spaces.set([]);
      summaryList.set([sum('t1', 1, { agent: 'pi', asking: { count: 3, question: 'Which architecture should I use?' } })]);
      const { el } = await setup();
      const card = el.querySelector('[data-attention] a')!;
      expect(card.getAttribute('href')).toBe('/t/t1');
      expect(card.textContent).toContain('api (pi) asks 3 questions');
      expect(card.textContent).toContain('Which architecture should I use?');
      expect(card.textContent).toContain('Answer');
      expect(card.textContent).not.toContain('is waiting for you');
      expect(el.querySelector('[data-address="t1"] [data-preview]')?.textContent).toContain('Asked you 3 questions');
    });

    it('falls back to the machine grouping without a layout and lists unplaced terminals by machine', async () => {
      spaces.set([]);
      const { el } = await setup();
      expect(headings(el)).toEqual(['gandalf', 'rohan']);
      expect(addresses(el)).toEqual(['t1', 't2', 't3', 'rohan/t7']);
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
      await type('code/app');
      expect(addresses(el)).toEqual(['t3']);
      expect(headings(el)).toEqual(['Work']);
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
      expect(el.querySelector('[data-empty]')?.textContent).toContain('No projects yet');
      stream.set('closed');
      await settle(fixture);
      expect(el.querySelector('[data-empty]')).toBeNull();
    });
  });
});
