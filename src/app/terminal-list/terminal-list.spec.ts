import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HcClient, HcError, type HcState } from '../hc/hc-client';
import { TerminalStore, type MachineGroup, type StreamState } from '../hc/terminals';
import type { Terminal } from '../hc/types';
import { Session, type SessionState } from '../session';
import { TerminalList } from './terminal-list';

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
const group = (name: string, terminals: Terminal[], extra: Partial<MachineGroup> = {}): MachineGroup => ({
  name,
  local: false,
  state: 'connected',
  terminals,
  ...extra,
});
const local = (terminals: Terminal[]) => group('gandalf', terminals, { local: true, state: 'local' });

/** Lets pending promises finish, then renders what they changed. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('TerminalList', () => {
  const groups = signal<MachineGroup[]>([]);
  const stream = signal<StreamState>('idle');
  const clientState = signal<HcState>('closed');
  let connect: ReturnType<typeof vi.fn>;
  let start: ReturnType<typeof vi.fn>;
  let check: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function setup() {
    TestBed.configureTestingModule({
      imports: [TerminalList],
      providers: [
        provideRouter([]),
        { provide: HcClient, useValue: { state: clientState, connect } },
        { provide: TerminalStore, useValue: { groups, stream, start } },
        { provide: Session, useValue: { check } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TerminalList);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  beforeEach(() => {
    groups.set([]);
    stream.set('idle');
    clientState.set('closed');
    connect = vi.fn(async () => clientState.set('open'));
    start = vi.fn(async () => stream.set('live'));
    check = vi.fn(async () => 'authenticated' as SessionState);
  });

  const rows = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[data-address]'));
  const addresses = (el: HTMLElement) => rows(el).map((r) => r.dataset['address']);

  describe('connection', () => {
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

    it('shows disconnected with Reconnect when the events channel closes, and reconnects', async () => {
      const { fixture, el } = await setup();
      stream.set('closed');
      clientState.set('closed');
      await settle(fixture);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Disconnected');
      const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Reconnect'));
      expect(button).toBeTruthy();
      button?.click();
      await settle(fixture);
      expect(connect).toHaveBeenCalledTimes(2);
      expect(start).toHaveBeenCalledTimes(2);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Live');
    });

    it('only restarts the store when the socket is still open', async () => {
      const { fixture, el } = await setup();
      stream.set('closed');
      await settle(fixture);
      Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Reconnect'))?.click();
      await settle(fixture);
      expect(connect).toHaveBeenCalledTimes(1);
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

  describe('list', () => {
    it('renders a section per machine with its name as heading', async () => {
      groups.set([local([term('t1')]), group('rohan', [term('rohan/t7')])]);
      const { el } = await setup();
      expect(Array.from(el.querySelectorAll('h2')).map((h) => h.textContent?.trim())).toEqual([
        'gandalf',
        'rohan',
      ]);
      expect(addresses(el)).toEqual(['t1', 'rohan/t7']);
    });

    it('shows the state of a remote machine only when it is not connected', async () => {
      groups.set([
        local([term('t1')]),
        group('rohan', []),
        group('edoras', [], { state: 'unreachable' }),
        group('gondor', [], { state: 'needs_login' }),
      ]);
      const { el } = await setup();
      const text = (name: string) =>
        Array.from(el.querySelectorAll('section')).find((s) => s.querySelector('h2')?.textContent?.includes(name))
          ?.textContent;
      expect(text('edoras')).toContain('unreachable');
      expect(text('gondor')).toContain('needs login');
      expect(text('rohan')).not.toContain('connected');
      expect(text('gandalf')).not.toContain('local');
    });

    it('renders name (or address), title, status badge with msg, foreground and cwd', async () => {
      groups.set([
        local([
          term('t1', {
            name: 'build',
            title: 'cargo watch',
            status: { state: 'blocked', msg: 'Allow edit?' },
            foreground: { pid: 1, name: 'claude', argv: ['claude'], cwd: '/home/u/project' },
            cwd: '/home/u/project',
          }),
          term('t2'),
        ]),
      ]);
      const { el } = await setup();
      const [a, b] = rows(el);
      expect(a.textContent).toContain('build');
      expect(a.textContent).toContain('cargo watch');
      expect(a.textContent).toContain('blocked');
      expect(a.textContent).toContain('Allow edit?');
      expect(a.textContent).toContain('claude');
      expect(a.textContent).toContain('/home/u/project');
      expect(b.textContent).toContain('t2');
      expect(b.querySelector('[data-status]')).toBeNull();
    });

    it('shows the badge with text for every status state', async () => {
      const states = ['idle', 'working', 'done', 'blocked', 'error'];
      groups.set([local(states.map((s, i) => term(`t${i}`, { status: { state: s } })))]);
      const { el } = await setup();
      const badges = Array.from(el.querySelectorAll('[data-status]')).map((b) => b.textContent?.trim());
      expect(badges.sort()).toEqual([...states].sort());
    });

    it('sorts blocked first, then working, then the rest by address', async () => {
      groups.set([
        local([
          term('t10', { status: { state: 'idle' } }),
          term('t9', { status: { state: 'done' } }),
          term('t3', { status: { state: 'working' } }),
          term('t12', { status: { state: 'blocked' } }),
          term('t2'),
          term('t1', { status: { state: 'working' } }),
        ]),
      ]);
      const { el } = await setup();
      expect(addresses(el)).toEqual(['t12', 't1', 't3', 't2', 't9', 't10']);
    });

    it('hides finished terminals', async () => {
      groups.set([local([term('t1'), term('t2', { state: 'finished' })])]);
      const { el } = await setup();
      expect(addresses(el)).toEqual(['t1']);
    });

    it('updates when the store changes', async () => {
      groups.set([local([term('t1')])]);
      const { fixture, el } = await setup();
      groups.set([local([term('t1'), term('t2')])]);
      await settle(fixture);
      expect(addresses(el)).toEqual(['t1', 't2']);
    });

    it('shows the empty state when live with no terminals', async () => {
      groups.set([local([term('t1', { state: 'finished' })]), group('rohan', [])]);
      const { el } = await setup();
      expect(el.textContent).toContain('No terminals');
    });

    it('does not show the empty state when there are terminals or before live', async () => {
      groups.set([local([term('t1')])]);
      const { el } = await setup();
      expect(el.textContent).not.toContain('No terminals');
    });
  });
});
