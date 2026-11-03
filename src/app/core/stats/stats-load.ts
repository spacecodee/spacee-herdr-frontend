// Raw rows from GitHub through `gh api graphql`, run on a machine with core's `machine.exec`.
// Every query text is a constant; logins, dates, repos and cursors travel as separate `-f` argv items.
//
// Adapted from the Herdr "stats" mod, mods/stats/load.js
// (https://github.com/Lakris2407/herdr-mods/tree/main/stats), MIT License,
// Copyright (c) 2026 Lakris2407.
import { aiTools, weekStarts, type PrRow, type Reviews } from './stats-count';

/** What one `machine.exec` gave back, with stdout and stderr already decoded. */
export interface Outcome {
  code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
}

export type Exec = (argv: readonly string[]) => Promise<Outcome>;

export type StatsErrorKind = 'not-logged-in' | 'no-gh' | 'failed';

/** `message` is meant for the screen. */
export class StatsError extends Error {
  constructor(
    readonly kind: StatsErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface RawStats {
  prs: PrRow[];
  commits: Record<string, number>;
  reviews: Reviews;
  open: PrRow[];
  now: number;
  weeks: number;
  starts: number[];
}

/**
 * Constant script. Core runs as a service whose PATH may miss the user's gh, so a missing `gh` is
 * retried through the user's login shell; still missing means exit 127. The gh arguments come after
 * the script name as positional parameters and are never part of the script text.
 */
export const GH_SCRIPT = 'command -v gh >/dev/null 2>&1 && exec gh "$@" || exec "${SHELL:-sh}" -lic \'gh "$@"\' gh "$@"';

/** The optional settings file; absent is fine. */
export const CONFIG_ARGV: readonly string[] = ['sh', '-c', 'cat "$HOME/.config/herdr-app/stats.json" 2>/dev/null'];

export const ghArgv = (args: readonly string[]): string[] => ['sh', '-c', GH_SCRIPT, 'stats', ...args];

const DAY = 86_400_000;
const AI_DAYS = 31;
const WINDOW_DAYS = 91;
const CONCURRENCY = 4;
const PR_FIELDS = 'number state createdAt mergedAt closedAt headRefName baseRefName repository{nameWithOwner}';
// Trailers live in the message body, so the headline is not asked for.
const AI_FIELDS = 'body commits(last:15){nodes{commit{messageBody}}}';

const search = (fields: string) =>
  `query($q:String!,$c:String){search(query:$q,type:ISSUE,first:100,after:$c){pageInfo{hasNextPage endCursor} nodes{... on PullRequest{${fields}}}}}`;
const PRS_QUERY = search(PR_FIELDS);
const PRS_AI_QUERY = search(`${PR_FIELDS} ${AI_FIELDS}`);
const VIEWER_QUERY = 'query{viewer{login}}';
const USER_QUERY = 'query($login:String!){user(login:$login){id}}';
const COUNTS_QUERY =
  'query($open:String!,$last:String!,$prev:String!){last:search(query:$last,type:ISSUE){issueCount} prev:search(query:$prev,type:ISSUE){issueCount} open:search(query:$open,type:ISSUE,first:100){nodes{... on PullRequest{number createdAt headRefName baseRefName repository{nameWithOwner}}}}}';
const HISTORY = 'target{... on Commit{history(since:$since,author:{id:$id}){totalCount}}}';
const COMMITS_QUERY = `query($owner:String!,$name:String!,$id:ID!,$since:GitTimestamp!){repository(owner:$owner,name:$name){defaultBranchRef{${HISTORY}}}}`;
const COMMITS_REF_QUERY = `query($owner:String!,$name:String!,$ref:String!,$id:ID!,$since:GitTimestamp!){repository(owner:$owner,name:$name){ref(qualifiedName:$ref){${HISTORY}}}}`;

const GENERIC = 'GitHub did not answer. Check the connection and try again.';
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;

interface Config {
  logins: string[];
  workBranch: Record<string, string>;
}

type Vars = Record<string, string | null | undefined>;
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- GitHub's answer is checked field by field below

/** Loads every number the Stats screen needs: 13 weeks of PRs, reviews, open PRs and commit counts. */
export async function loadRaw(exec: Exec, now = Date.now(), weeks = 12): Promise<RawStats> {
  const gh = async (query: string, vars: Vars = {}): Promise<Json> => {
    const args = ['api', 'graphql', '-f', `query=${query}`];
    for (const [key, value] of Object.entries(vars)) if (value != null) args.push('-f', `${key}=${value}`);
    return graphql(await exec(ghArgv(args)));
  };

  const config = await loadConfig(exec, async () => (await gh(VIEWER_QUERY)).viewer.login as string);
  const [prs, counts] = await Promise.all([fetchPrs(gh, config, now), fetchCounts(gh, config, now)]);
  const recent = [...new Set(prs.filter((pr) => pr.mergedAt && Date.parse(pr.mergedAt) > now - 30 * DAY).map((pr) => pr.repo))];
  const commits = await fetchCommits(gh, config, now, recent);
  return { prs, commits, ...counts, now, weeks, starts: weekStarts(now, weeks) };
}

async function loadConfig(exec: Exec, viewer: () => Promise<string>): Promise<Config> {
  const out = await exec(CONFIG_ARGV).catch(() => null);
  let file: unknown = {};
  if (out && out.code === 0 && out.stdout.trim() !== '') {
    try {
      file = JSON.parse(out.stdout);
    } catch {
      throw new StatsError('failed', 'stats.json is not valid JSON.');
    }
  }
  const { logins, workBranch } = (file ?? {}) as { logins?: unknown; workBranch?: unknown };
  if (logins !== undefined && (!Array.isArray(logins) || !logins.every((l) => typeof l === 'string' && LOGIN.test(l)))) {
    throw new StatsError('failed', 'stats.json: "logins" must be a list of GitHub logins.');
  }
  const branches = workBranch === undefined ? {} : (workBranch as Record<string, unknown>);
  const bad = typeof branches !== 'object' || branches === null || Object.entries(branches).some(([repo, b]) => !REPO.test(repo) || typeof b !== 'string' || b === '' || /[\u0000-\u001f]/.test(b));
  if (bad) throw new StatsError('failed', 'stats.json: "workBranch" must map owner/repo to a branch name.');
  return { logins: logins?.length ? (logins as string[]) : [await viewer()], workBranch: branches as Record<string, string> };
}

/** Parses one gh answer, or says what went wrong in words for the screen. */
function graphql(out: Outcome): Json {
  if (out.timedOut) throw new StatsError('failed', 'GitHub took too long to answer.');
  const stderr = `${out.stderr}\n${out.stdout}`;
  if (out.code === 127) throw new StatsError('no-gh', 'gh is not installed on this machine.');
  if (out.code !== 0) {
    if (/auth login|not logged|bad credentials/i.test(stderr)) throw new StatsError('not-logged-in', 'gh is not logged in.');
    throw new StatsError('failed', GENERIC);
  }
  if (out.truncated) throw new StatsError('failed', 'GitHub sent more than could be read.');
  let json: Json;
  try {
    json = JSON.parse(out.stdout);
  } catch {
    throw new StatsError('failed', GENERIC);
  }
  if (json?.errors?.length) {
    if (/bad credentials/i.test(String(json.errors[0]?.message))) throw new StatsError('not-logged-in', 'gh is not logged in.');
    throw new StatsError('failed', GENERIC);
  }
  return json.data;
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** At most `CONCURRENCY` calls at once: a full load is dozens of small queries. */
async function pool<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return results;
}

type Gh = (query: string, vars?: Vars) => Promise<Json>;

// Search returns at most 1,000 rows per query, so ask one week at a time.
async function searchPrs(gh: Gh, login: string, from: number, to: number, withAi: boolean): Promise<PrRow[]> {
  const q = `is:pr author:${login} created:${day(from)}..${day(to)}`;
  const rows: PrRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const s: Json = (await gh(withAi ? PRS_AI_QUERY : PRS_QUERY, { q, c: cursor })).search;
    for (const n of s.nodes) {
      if (n.number == null) continue;
      const { body, commits, repository, ...pr } = n;
      // Classify now and drop the text: only what the screen shows is kept.
      rows.push({
        ...pr,
        repo: repository.nameWithOwner,
        ai: withAi ? aiTools({ body, headRefName: pr.headRefName, messages: commits.nodes.map((x: Json) => x.commit.messageBody) }) : null,
      });
    }
    if (!s.pageInfo.hasNextPage) break;
    cursor = s.pageInfo.endCursor;
  }
  return rows;
}

async function fetchPrs(gh: Gh, config: Config, now: number): Promise<PrRow[]> {
  const windows: [number, number][] = [];
  for (let to = now; to > now - WINDOW_DAYS * DAY; to -= 7 * DAY) windows.push([Math.max(now - WINDOW_DAYS * DAY, to - 7 * DAY), to]);
  const jobs = config.logins.flatMap((login) =>
    windows.map(([from, to]) => () => searchPrs(gh, login, from, to + DAY, to > now - AI_DAYS * DAY)),
  );
  return (await pool(jobs)).flat();
}

/** Reviews = other people's PRs you commented on, bucketed by when the PR was opened. Open PRs have no date limit. */
async function fetchCounts(gh: Gh, config: Config, now: number): Promise<{ reviews: Reviews; open: PrRow[] }> {
  const notMine = config.logins.map((l) => `-author:${l}`).join(' ');
  const answers = await pool(
    config.logins.map((login) => () =>
      gh(COUNTS_QUERY, {
        open: `is:pr is:open author:${login}`,
        last: `is:pr commenter:${login} ${notMine} created:>=${day(now - 30 * DAY)}`,
        prev: `is:pr commenter:${login} ${notMine} created:${day(now - 60 * DAY)}..${day(now - 30 * DAY)}`,
      }),
    ),
  );
  const reviews = { last30: 0, prev30: 0 };
  const open: PrRow[] = [];
  for (const a of answers) {
    reviews.last30 += a.last.issueCount;
    reviews.prev30 += a.prev.issueCount;
    open.push(...a.open.nodes.map(({ repository, ...pr }: Json) => ({ ...pr, repo: repository.nameWithOwner })));
  }
  return { reviews, open };
}

/** Commits linked to your accounts in each repo you merged into, on its working branch, last 30 days. */
async function fetchCommits(gh: Gh, config: Config, now: number, repos: string[]): Promise<Record<string, number>> {
  const ids = (await pool(config.logins.map((login) => async () => (await gh(USER_QUERY, { login })).user?.id as string | undefined))).filter(
    (id): id is string => !!id,
  );
  if (!repos.length || !ids.length) return {};
  const since = new Date(now - 30 * DAY).toISOString();
  const jobs = repos.flatMap((full) =>
    ids.map((id) => async () => {
      const [owner, name] = full.split('/');
      const branch = config.workBranch[full];
      const data = branch
        ? await gh(COMMITS_REF_QUERY, { owner, name, ref: `refs/heads/${branch}`, id, since })
        : await gh(COMMITS_QUERY, { owner, name, id, since });
      const r = data.repository;
      const target = (branch ? r?.ref : r?.defaultBranchRef)?.target;
      return [full, (target?.history?.totalCount as number | undefined) ?? 0] as const;
    }),
  );
  const commits: Record<string, number> = {};
  for (const [full, n] of await pool(jobs)) commits[full] = (commits[full] ?? 0) + n;
  return commits;
}
