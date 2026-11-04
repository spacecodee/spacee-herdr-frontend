import type { Terminal } from '../hc/types';
import {
  agentKind,
  attention,
  cwdBase,
  cwdTail,
  programOf,
  relativeTime,
  timeMs,
  toHome,
  type PlacedGroup,
  type Summary,
} from './conversations';

const term = (address: string, extra: Partial<Terminal> = {}): Terminal => ({
  address,
  labels: {},
  argv: ['sh'],
  cwd: '/home/me/code/app',
  state: 'live',
  created_ms: 1,
  screen: 'exact',
  cols: 80,
  rows: 24,
  ...extra,
});

const summary = (terminal: string, time: string | number, extra: Partial<Summary> = {}): Summary => ({
  terminal,
  agent: 'claude',
  session: 's',
  title: `Title ${terminal}`,
  last: { role: 'assistant', text: `Last ${terminal}`, time },
  messages: 4,
  ...extra,
});

describe('agentKind', () => {
  it('maps known agents case-insensitively and falls back to generic', () => {
    expect(agentKind('claude')).toBe('claude');
    expect(agentKind('Claude Code')).toBe('claude');
    expect(agentKind('pi')).toBe('pi');
    expect(agentKind('codex')).toBe('codex');
    expect(agentKind('opencode')).toBe('opencode');
    expect(agentKind('antigravity')).toBe('antigravity');
    expect(agentKind('agy')).toBe('antigravity');
    expect(agentKind('claude-code')).toBe('claude');
    expect(agentKind('Gemini CLI')).toBe('gemini');
    expect(agentKind('aider')).toBe('generic');
    expect(agentKind(undefined)).toBe('generic');
    expect(agentKind('')).toBe('generic');
  });
});

describe('timeMs', () => {
  it('reads ISO strings, epoch milliseconds and epoch seconds', () => {
    expect(timeMs('2026-11-02T10:00:00Z')).toBe(Date.parse('2026-11-02T10:00:00Z'));
    expect(timeMs(1_762_000_000_000)).toBe(1_762_000_000_000);
    expect(timeMs(1_762_000_000)).toBe(1_762_000_000_000);
  });
  it('returns null for anything unreadable', () => {
    expect(timeMs('nope')).toBeNull();
    expect(timeMs(undefined)).toBeNull();
  });
});

describe('relativeTime', () => {
  // Local time on purpose: the label is what the phone's clock shows.
  const now = new Date(2026, 10, 2, 14, 30, 0).getTime();
  const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
    new Date(y, mo, d, h, mi, s).getTime();

  it('says now under a minute, minutes under an hour', () => {
    expect(relativeTime(now - 20_000, now)).toBe('now');
    expect(relativeTime(now + 5_000, now)).toBe('now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m');
    expect(relativeTime(now - 59 * 60_000, now)).toBe('59m');
  });
  it('shows the clock time later the same day', () => {
    expect(relativeTime(at(2026, 10, 2, 9, 5), now)).toBe('09:05');
    expect(relativeTime(at(2026, 10, 2, 13, 29), now)).toBe('13:29');
  });
  it('shows the weekday within the last week', () => {
    expect(relativeTime(at(2026, 10, 1, 23, 0), now)).toBe('Sun');
    expect(relativeTime(at(2026, 9, 28, 8, 0), now)).toBe('Wed');
  });
  it('shows day and month for anything older', () => {
    expect(relativeTime(at(2026, 9, 20, 8, 0), now)).toBe('20 Oct');
  });
});

describe('cwdBase', () => {
  it('keeps the last path segment only', () => {
    expect(cwdBase('/home/me/code/app')).toBe('app');
    expect(cwdBase('/home/me/code/app/')).toBe('app');
    expect(cwdBase('/')).toBe('/');
    expect(cwdBase('')).toBe('');
  });
});

describe('programOf', () => {
  it.each([
    ['nvim', 'neovim'],
    ['vim', 'vim'],
    ['vi', 'editor'],
    ['nano', 'editor'],
    ['/usr/bin/htop', 'monitor'],
    ['less', 'pager'],
    ['docker', 'docker'],
    ['ssh', 'ssh'],
    ['NVIM', 'neovim'],
  ])('knows %s as %s', (name, kind) => {
    expect(programOf(name)?.kind).toBe(kind);
  });
  it('returns the display name, and null for shells and unknown programs', () => {
    expect(programOf('/usr/bin/nvim')?.name).toBe('nvim');
    for (const n of ['zsh', 'bash', 'fish', 'sh', 'frobnicate', '', undefined]) expect(programOf(n)).toBeNull();
  });
});

describe('cwdTail', () => {
  it('keeps the last two path segments', () => {
    expect(cwdTail('/home/me/code/app')).toBe('code/app');
    expect(cwdTail('/home')).toBe('home');
    expect(cwdTail('/')).toBe('/');
    expect(cwdTail('')).toBe('');
  });
});

describe('toHome', () => {
  const now = new Date(2026, 10, 2, 14, 30, 0).getTime();
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  const groups: PlacedGroup[] = [
    {
      id: 'space:a',
      name: 'Work',
      note: null,
      items: [
        { terminal: term('t1', { name: 'api', status: { state: 'idle' } }), tab: 'Backend' },
        { terminal: term('t2', { name: 'web', status: { state: 'working' } }), tab: 'Frontend' },
        { terminal: term('t3', { name: 'shell' }), tab: 'Frontend' },
      ],
    },
    {
      id: 'machine:rohan',
      name: 'rohan',
      note: 'unreachable',
      items: [{ terminal: term('rohan/t1', { name: 'ops' }), tab: '' }],
    },
  ];
  const sums = [
    summary('t1', iso(60), { title: 'Fix login', last: { role: 'user', text: 'please retry', time: iso(60) } }),
    summary('t2', iso(2), { agent: 'pi', title: '' }),
    summary('rohan/t1', iso(500), { agent: 'codex' }),
  ];

  it('keeps the given order: groups, then tab after tab, whatever the activity', () => {
    const { groups: out } = toHome(groups, sums, '');
    expect(out.map((g) => g.id)).toEqual(['space:a', 'machine:rohan']);
    // t2 is newer than t1 and the shell t3 has no time; the layout order still wins
    expect(out[0].conversations.map((c) => c.address)).toEqual(['t1', 't2', 't3']);
  });

  it('builds title, preview, time and agent of a row', () => {
    const [work] = toHome(groups, sums, '').groups;
    const t1 = work.conversations.find((c) => c.address === 't1')!;
    expect(t1.title).toBe('Backend');
    expect(t1.preview).toBe('You: please retry');
    expect(t1.kind).toBe('chat');
    expect(t1.agent).toBe('claude');
    expect(t1.status).toBe('idle');
    expect(t1.time).toBe(Date.parse(iso(60)));
  });

  it('leads with the tab name, else the terminal name, never the first prompt', () => {
    const [work] = toHome(groups, sums, '').groups;
    expect(work.conversations.find((c) => c.address === 't2')!.title).toBe('Frontend');
    const noTab = toHome(
      [{ id: 'm', name: 'm', note: null, items: [{ terminal: term('x', { name: 'zed' }), tab: '' }] }],
      [summary('x', iso(1), { title: '' })],
      '',
    );
    expect(noTab.groups[0].conversations[0].title).toBe('zed');
  });

  it('does not prefix assistant text and collapses whitespace', () => {
    const [work] = toHome(
      [{ id: 'm', name: 'm', note: null, items: [{ terminal: term('x'), tab: '' }] }],
      [summary('x', iso(1), { last: { role: 'assistant', text: 'one\n\n  two', time: iso(1) } })],
      '',
    ).groups;
    expect(work.conversations[0].preview).toBe('one two');
  });

  it('previews and searches the body of a harness envelope, never its tags', () => {
    const g = [{ id: 'm', name: 'm', note: null, items: [{ terminal: term('x'), tab: '' }] }];
    const text = '<pasted_content id="1"><hc from="t13">New task F18.</hc></pasted_content id="1">';
    const s = [summary('x', iso(1), { last: { role: 'user', text, time: iso(1) } })];
    expect(toHome(g, s, '').groups[0].conversations[0].preview).toBe('You: New task F18.');
    expect(toHome(g, s, 'pasted_content').groups).toEqual([]);
    expect(toHome(g, s, 'new task').groups).toHaveLength(1);
  });

  it('keeps terminals without a transcript in their group as shell rows', () => {
    const [work] = toHome(groups, sums, '').groups;
    const shell = work.conversations.find((c) => c.address === 't3')!;
    expect(shell).toEqual({
      kind: 'shell',
      address: 't3',
      title: 'Frontend',
      preview: 'app',
      program: null,
      agent: 'shell',
      status: null,
      time: null,
    });
  });

  it('titles a shell by its tab, else its name, and uses the foreground cwd', () => {
    const [g] = toHome(
      [
        {
          id: 'm',
          name: 'm',
          note: null,
          items: [
            { terminal: term('x', { name: 'zed', foreground: { pid: 1, name: 'vim', argv: [], cwd: '/etc/nixos' } }), tab: '' },
          ],
        },
      ],
      [],
      '',
    ).groups;
    // a known program replaces the folder on line 2
    expect(g.conversations[0]).toMatchObject({ title: 'zed', preview: 'vim', program: 'vim' });
  });

  it('shows only the last folder of a plain shell, with no program glyph', () => {
    const [g] = toHome(
      [{ id: 'm', name: 'm', note: null, items: [{ terminal: term('x', { foreground: { pid: 1, name: 'zsh', argv: [], cwd: '/home/me/code/app' } }), tab: '' }] }],
      [],
      '',
    ).groups;
    expect(g.conversations[0]).toMatchObject({ preview: 'app', program: null });
  });

  it('shows an agent with no message yet as a chat row', () => {
    const fresh = { terminal: 'x', agent: 'codex', session: 's', title: '', messages: 0 } as Summary;
    const g = [{ id: 'm', name: 'Work', note: null, items: [{ terminal: term('x'), tab: 'api' }] }];
    const [group] = toHome(g, [fresh], '').groups;
    expect(group.conversations[0]).toMatchObject({
      kind: 'chat',
      agent: 'codex',
      preview: 'New conversation',
      time: null,
    });
    expect(toHome(g, [fresh], 'work').groups).toHaveLength(1);
    expect(toHome(g, [fresh], 'api').groups).toHaveLength(1);
    expect(toHome(g, [fresh], 'nomatch').groups).toHaveLength(0);
  });

  it('drops groups with no row', () => {
    const out = toHome([groups[0], { ...groups[1], items: [] }], sums, '');
    expect(out.groups.map((g) => g.id)).toEqual(['space:a']);
  });

  describe('search', () => {
    const find = (q: string) =>
      toHome(groups, sums, q).groups.flatMap((g) => g.conversations.map((c) => c.address));

    it('matches title, last message text, terminal name, tab and space, ignoring case', () => {
      expect(find('FIX LOGIN')).toEqual(['t1']);
      expect(find('last t2')).toEqual(['t2']);
      expect(find('web')).toEqual(['t2']);
      expect(find('backend')).toEqual(['t1']);
      expect(find('work')).toEqual(['t1', 't2', 't3']);
      expect(find('rohan')).toEqual(['rohan/t1']);
    });
    it('trims the query and treats blank as no filter', () => {
      expect(find('  fix  ')).toEqual(['t1']);
      expect(find('   ')).toEqual(['t1', 't2', 't3', 'rohan/t1']);
    });
    it('matches a shell by name, address, cwd and tab', () => {
      expect(find('shell')).toEqual(['t3']);
      expect(find('t3')).toEqual(['t3']);
      expect(find('code/app')).toEqual(['t3']);
      expect(find('fix login')).toEqual(['t1']);
    });
    it('drops groups that end up empty', () => {
      expect(toHome(groups, sums, 'rohan').groups.map((g) => g.id)).toEqual(['machine:rohan']);
    });
  });
});

describe('attention', () => {
  it('lists blocked terminals only, with agent and name', () => {
    const terminals = [
      term('t1', { name: 'api', status: { state: 'blocked', app: 'claude' } }),
      term('t2', { status: { state: 'working' } }),
      term('t3', { status: { state: 'blocked' } }),
      term('t4'),
    ];
    const tabs = ['API tab', '', '', ''];
    const out = attention(terminals.map((terminal, i) => ({ terminal, tab: tabs[i] })), [summary('t3', 1, { agent: 'pi', title: 'Deploy' })]);
    expect(out).toEqual([
      { address: 't1', name: 'API tab', agent: 'claude' },
      { address: 't3', name: 't3', agent: 'pi' },
    ]);
  });
  it('is empty when nothing is blocked', () => {
    expect(attention([{ terminal: term('t1', { status: { state: 'idle' } }), tab: '' }], [])).toEqual([]);
  });
});

describe('pending questions', () => {
  const asking = { count: 3, question: 'Which architecture?' };
  it('puts the question count on a blocked chat row, and only while it is blocked', () => {
    const groups = [{ id: 'g', name: 'G', note: null, items: [
      { terminal: term('t1', { status: { state: 'blocked', app: 'pi' } }), tab: '' },
      { terminal: term('t2', { status: { state: 'idle', app: 'pi' } }), tab: '' },
    ] }];
    const sums = [summary('t1', 1, { agent: 'pi', asking }), summary('t2', 1, { agent: 'pi', asking })];
    const rows = toHome(groups, sums, '').groups[0].conversations;
    expect(rows.map((r) => r.asking)).toEqual([3, undefined]);
  });
  it('carries the first question on the attention card', () => {
    const out = attention([{ terminal: term('t1', { status: { state: 'blocked', app: 'pi' } }), tab: 'Frontend' }], [summary('t1', 1, { agent: 'pi', asking })]);
    expect(out[0].asking).toEqual(asking);
  });
});
