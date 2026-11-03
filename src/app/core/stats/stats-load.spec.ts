import { CONFIG_ARGV, GH_SCRIPT, StatsError, ghArgv, loadRaw, type Outcome } from './stats-load';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const ok = (data: unknown): Outcome => ({ code: 0, stdout: JSON.stringify({ data }), stderr: '', truncated: false, timedOut: false });
const none: Outcome = { code: 1, stdout: '', stderr: '', truncated: false, timedOut: false };

interface Call {
  query: string;
  vars: Record<string, string>;
  argv: string[];
}

/** A fake core: answers `cat stats.json` with `config` and every gh call through `answer`. */
function fakeExec(answer: (c: Call) => Outcome, config: Outcome = none) {
  const calls: Call[] = [];
  const exec = (argv: readonly string[]): Promise<Outcome> => {
    if (argv === CONFIG_ARGV) return Promise.resolve(config);
    expect(argv.slice(0, 3)).toEqual(['sh', '-c', GH_SCRIPT]);
    const args = argv.slice(4);
    expect(args.slice(0, 2)).toEqual(['api', 'graphql']);
    const vars: Record<string, string> = {};
    for (let i = 2; i < args.length; i += 2) {
      expect(args[i]).toBe('-f');
      const eq = args[i + 1].indexOf('=');
      vars[args[i + 1].slice(0, eq)] = args[i + 1].slice(eq + 1);
    }
    const { query, ...rest } = vars;
    const call = { query, vars: rest, argv: [...argv] };
    calls.push(call);
    return Promise.resolve(answer(call));
  };
  return { exec, calls };
}

const pr = (n: number, over: Record<string, unknown> = {}) => ({
  number: n, state: 'MERGED', createdAt: '2026-10-30T08:00:00Z', mergedAt: '2026-10-30T09:00:00Z', closedAt: '2026-10-30T09:00:00Z',
  headRefName: 'feat', baseRefName: 'develop', repository: { nameWithOwner: 'o/a' }, body: '', commits: { nodes: [] }, ...over,
});
const page = (nodes: unknown[], next: string | null = null) => ({
  search: { pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes },
});

/** Routes by the constant query text; `prs` answers the PR searches. */
function answerWith(prs: (c: Call) => unknown) {
  return (c: Call): Outcome => {
    if (c.query.includes('viewer')) return ok({ viewer: { login: 'me' } });
    if (c.query.includes('issueCount')) {
      return ok({ last: { issueCount: 5 }, prev: { issueCount: 2 }, open: { nodes: [{ number: 9, createdAt: '2026-10-29T00:00:00Z', headRefName: 'x', baseRefName: 'develop', repository: { nameWithOwner: 'o/a' } }] } });
    }
    if (c.query.includes('user(login')) return ok({ user: { id: 'U1' } });
    if (c.query.includes('history')) return ok({ repository: { defaultBranchRef: { target: { history: { totalCount: 7 } } }, ref: { target: { history: { totalCount: 4 } } } } });
    return ok(prs(c));
  };
}

describe('stats-load', () => {
  it('runs gh through one constant script with the arguments as separate argv items', () => {
    const argv = ghArgv(['api', 'graphql', '-f', 'query=query{viewer{login}}', '-f', 'q=is:pr author:x; rm -rf /']);
    expect(argv.slice(0, 4)).toEqual(['sh', '-c', GH_SCRIPT, 'stats']);
    expect(argv.slice(4)).toEqual(['api', 'graphql', '-f', 'query=query{viewer{login}}', '-f', 'q=is:pr author:x; rm -rf /']);
    expect(GH_SCRIPT).toContain('command -v gh');
    expect(GH_SCRIPT).toContain('-lic');
    expect(GH_SCRIPT).not.toMatch(/author:|rm -rf/);
  });

  it('counts the account gh is logged in as when there is no stats.json', async () => {
    const { exec, calls } = fakeExec(answerWith(() => page([pr(1)])));
    const raw = await loadRaw(exec, NOW);
    expect(calls.some((c) => c.query.includes('viewer'))).toBe(true);
    expect(raw.prs.every((p) => p.repo === 'o/a')).toBe(true);
    expect(calls.filter((c) => c.vars['q']?.startsWith('is:pr author:me ')).length).toBeGreaterThanOrEqual(13);
  });

  it('reads logins and workBranch from stats.json and skips the viewer lookup', async () => {
    const config: Outcome = { ...none, code: 0, stdout: JSON.stringify({ logins: ['a', 'b'], workBranch: { 'o/a': 'develop' } }) };
    const { exec, calls } = fakeExec(answerWith(() => page([])), config);
    const raw = await loadRaw(exec, NOW);
    expect(calls.some((c) => c.query.includes('viewer'))).toBe(false);
    expect(calls.some((c) => c.vars['q']?.includes('author:b '))).toBe(true);
    expect(raw.starts).toHaveLength(12);
  });

  it('rejects a stats.json that is not valid JSON or has bad logins', async () => {
    const bad = (stdout: string): Outcome => ({ ...none, code: 0, stdout });
    for (const text of ['{nope', '{"logins":["ok","not valid!"]}', '{"logins":"me"}', '{"workBranch":{"o/a":1}}']) {
      const { exec } = fakeExec(answerWith(() => page([])), bad(text));
      await expect(loadRaw(exec, NOW)).rejects.toThrow(StatsError);
    }
  });

  it('follows pages with the cursor as a variable', async () => {
    let first = true;
    const { exec, calls } = fakeExec(answerWith((c) => {
      if (!c.vars['q']?.includes('author:me')) return page([]);
      if (c.vars['c'] === 'CUR') return page([pr(2)]);
      if (first) { first = false; return page([pr(1)], 'CUR'); }
      return page([]);
    }));
    const raw = await loadRaw(exec, NOW);
    expect(calls.some((c) => c.vars['c'] === 'CUR')).toBe(true);
    expect(raw.prs.map((p) => p.number).sort()).toEqual([1, 2]);
  });

  it('classifies AI use from the texts and keeps no text, only for the last 31 days', async () => {
    const withAi = pr(1, { body: 'Generated with Claude Code', commits: { nodes: [{ commit: { messageBody: 'Co-Authored-By: Codex <x>' } }] } });
    const { exec, calls } = fakeExec(answerWith(() => page([withAi])));
    const raw = await loadRaw(exec, NOW);
    expect(raw.prs.some((p) => p.ai?.claude && p.ai.codex)).toBe(true);
    expect(JSON.stringify(raw)).not.toContain('Generated with');
    expect(JSON.stringify(raw)).not.toContain('Co-Authored-By');
    const aiCalls = calls.filter((c) => c.query.includes('messageBody'));
    const plain = calls.filter((c) => c.vars['q'] && !c.query.includes('messageBody'));
    expect(aiCalls.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0);
    expect(aiCalls.length).toBeLessThan(calls.filter((c) => c.vars['q']).length);
  });

  it('keeps the queries constant: logins, dates and repos travel as variables', async () => {
    const config: Outcome = { ...none, code: 0, stdout: JSON.stringify({ logins: ['zed'], workBranch: { 'o/a': 'develop' } }) };
    const { exec, calls } = fakeExec(answerWith(() => page([pr(1)])), config);
    await loadRaw(exec, NOW);
    for (const c of calls) {
      expect(c.query).not.toContain('zed');
      expect(c.query).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(c.query).not.toContain('o/a');
    }
  });

  it('counts commits per repo on the default branch, or on workBranch, and sums the accounts', async () => {
    const config: Outcome = { ...none, code: 0, stdout: JSON.stringify({ logins: ['me'], workBranch: { 'o/b': 'develop' } }) };
    const { exec, calls } = fakeExec(answerWith(() => page([pr(1), pr(2, { repository: { nameWithOwner: 'o/b' } })])), config);
    const raw = await loadRaw(exec, NOW);
    expect(raw.commits).toEqual({ 'o/a': 7, 'o/b': 4 });
    const withRef = calls.find((c) => c.vars['ref']);
    expect(withRef?.vars).toMatchObject({ owner: 'o', name: 'b', ref: 'refs/heads/develop', id: 'U1' });
    expect(calls.some((c) => c.vars['owner'] === 'o' && c.vars['name'] === 'a' && !c.vars['ref'])).toBe(true);
  });

  it('reads reviews and open PRs', async () => {
    const { exec } = fakeExec(answerWith(() => page([])));
    const raw = await loadRaw(exec, NOW);
    expect(raw.reviews).toEqual({ last30: 5, prev30: 2 });
    expect(raw.open).toHaveLength(1);
    expect(raw.open[0].repo).toBe('o/a');
  });

  it('says to log in when gh is not logged in', async () => {
    const out: Outcome = { code: 4, stdout: '', stderr: 'To get started with GitHub CLI, please run:  gh auth login', truncated: false, timedOut: false };
    const { exec } = fakeExec(() => out);
    await expect(loadRaw(exec, NOW)).rejects.toMatchObject({ kind: 'not-logged-in' });
  });

  it('says gh is missing on exit 127', async () => {
    const { exec } = fakeExec(() => ({ code: 127, stdout: '', stderr: 'gh: not found', truncated: false, timedOut: false }));
    await expect(loadRaw(exec, NOW)).rejects.toMatchObject({ kind: 'no-gh' });
  });

  it('fails clearly on a truncated, timed-out or GraphQL-error answer', async () => {
    const cases: Outcome[] = [
      { ...none, code: 0, stdout: '{}', truncated: true },
      { ...none, code: 0, timedOut: true },
      { ...none, code: 0, stdout: JSON.stringify({ errors: [{ message: 'rate limited' }] }) },
      { ...none, code: 0, stdout: 'not json' },
      { ...none, code: 1, stderr: 'HTTP 502' },
    ];
    for (const out of cases) {
      const { exec } = fakeExec(() => out);
      await expect(loadRaw(exec, NOW)).rejects.toMatchObject({ kind: 'failed' });
    }
  });
});
