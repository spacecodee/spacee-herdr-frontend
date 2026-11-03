import type { Terminal } from '../hc/types';

/** One agent conversation as `GET /api/chat/summaries` reports it. */
export interface Summary {
  terminal: string;
  agent: string;
  session: string;
  title: string;
  last: { role: 'user' | 'assistant' | 'system'; text: string; time: string | number } | null;
  messages: number;
}

export type AgentKind =
  | 'claude'
  | 'pi'
  | 'codex'
  | 'opencode'
  | 'antigravity'
  | 'gemini'
  | 'generic'
  | 'shell';

/** What each agent kind is called in a row's meta line and its accessible name. */
export const AGENT_LABEL: Record<AgentKind, string> = {
  claude: 'Claude Code',
  pi: 'pi',
  codex: 'Codex',
  opencode: 'opencode',
  antigravity: 'Antigravity',
  gemini: 'Gemini CLI',
  generic: 'Agent',
  shell: 'Shell',
};

/** Order matters: the first name found in the agent string wins. */
const KINDS: readonly AgentKind[] = ['claude', 'pi', 'codex', 'opencode', 'antigravity', 'gemini'];

export function agentKind(name: string | null | undefined): AgentKind {
  const n = (name ?? '').trim().toLowerCase();
  if (n === '') return 'generic';
  if (n === 'agy') return 'antigravity';
  return KINDS.find((k) => (k === 'pi' ? n === 'pi' : n.includes(k))) ?? 'generic';
}

/** Epoch milliseconds from an ISO string, epoch milliseconds or epoch seconds; null if unreadable. */
export function timeMs(time: string | number | null | undefined): number | null {
  if (typeof time === 'number') {
    if (!Number.isFinite(time)) return null;
    return time < 1e11 ? time * 1000 : time;
  }
  if (typeof time !== 'string') return null;
  const parsed = Date.parse(time);
  return Number.isNaN(parsed) ? null : parsed;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "now", "5m", "14:02", "Mon" or "20 Oct", in the device's local time. */
export function relativeTime(ms: number, now: number): string {
  const diff = now - ms;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  const when = new Date(ms);
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(when)) / 86_400_000);
  if (days <= 0) return `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  if (days < 7) return WEEKDAYS[when.getDay()];
  return `${when.getDate()} ${MONTHS[when.getMonth()]}`;
}

/** Last two path segments: `/home/me/code/app` -> `code/app`. */
export function cwdTail(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  if (parts.length === 0) return cwd === '' ? '' : '/';
  return parts.slice(-2).join('/');
}

/** Last path segment: `/home/me/code/app` -> `app`. */
export function cwdBase(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  if (parts.length === 0) return cwd === '' ? '' : '/';
  return parts[parts.length - 1];
}

export type ProgramKind = 'editor' | 'monitor' | 'pager' | 'docker' | 'ssh';

const PROGRAMS: Record<string, ProgramKind> = {
  nvim: 'editor',
  vim: 'editor',
  vi: 'editor',
  nano: 'editor',
  emacs: 'editor',
  htop: 'monitor',
  btop: 'monitor',
  top: 'monitor',
  less: 'pager',
  man: 'pager',
  docker: 'docker',
  ssh: 'ssh',
};

/** A known full-screen or remote program in a terminal's foreground; plain shells and the rest give null. */
export function programOf(name: string | null | undefined): { name: string; kind: ProgramKind } | null {
  const base = (name ?? '').split('/').pop()?.trim().toLowerCase() ?? '';
  const kind = PROGRAMS[base];
  return kind ? { name: base, kind } : null;
}

/** A live terminal and the tab that holds it (empty when it sits in no tab). */
export interface Placed {
  terminal: Terminal;
  tab: string;
}

export interface PlacedGroup {
  /** Stable section id, for the stored open state. */
  id: string;
  name: string;
  /** State worth showing beside the name, such as an unreachable machine. */
  note: string | null;
  items: Placed[];
}

/**
 * One row of a section: an agent conversation, or a plain shell (a terminal without a transcript)
 * whose `preview` is the foreground program's name or the last folder of its working directory.
 */
export interface Conversation {
  kind: 'chat' | 'shell';
  address: string;
  title: string;
  preview: string;
  meta: string;
  /** A shell whose foreground is a known program (its name is the preview); null otherwise. */
  program: ProgramKind | null;
  agent: AgentKind;
  status: string | null;
  time: number | null;
}

export interface ConversationGroup {
  id: string;
  name: string;
  note: string | null;
  conversations: Conversation[];
}

export interface Home {
  groups: ConversationGroup[];
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

function matches(query: string, fields: readonly (string | null | undefined)[]): boolean {
  return fields.some((f) => (f ?? '').toLowerCase().includes(query));
}

/**
 * Turns the placed terminals and the transcript summaries into the home screen: one section per
 * group, in the order given, holding every terminal in the order given (so a space mirrors the
 * desktop layout, tab after tab). Agents with a transcript become conversations, the rest shells.
 * `query` keeps only what matches space, tab, terminal name, title, last message or working
 * directory; a group left with no row is dropped.
 */
export function toHome(groups: PlacedGroup[], summaries: Summary[], query: string): Home {
  const q = query.trim().toLowerCase();
  const byTerminal = new Map(summaries.map((s) => [s.terminal, s]));
  const out: ConversationGroup[] = [];

  for (const group of groups) {
    const rows: Conversation[] = [];
    for (const { terminal: t, tab } of group.items) {
      const name = t.name || t.address;
      const status = t.status?.state ?? null;
      // A row leads with who it is: the tab, else the terminal's name.
      const title = tab || name;
      const summary = byTerminal.get(t.address);
      if (!summary) {
        const dir = t.foreground?.cwd || t.cwd;
        const program = programOf(t.foreground?.name);
        if (q !== '' && !matches(q, [group.name, tab, name, t.address, cwdTail(dir), program?.name])) continue;
        rows.push({
          kind: 'shell',
          address: t.address,
          title,
          preview: program?.name ?? cwdBase(dir),
          meta: `${AGENT_LABEL.shell} · ${t.address}`,
          program: program?.kind ?? null,
          agent: 'shell',
          status,
          time: null,
        });
        continue;
      }
      const text = squash(summary.last?.text ?? '');
      if (q !== '' && !matches(q, [group.name, tab, name, summary.title, text])) continue;
      const agent = agentKind(summary.agent);
      rows.push({
        kind: 'chat',
        address: t.address,
        title,
        preview: text !== '' && summary.last?.role === 'user' ? `You: ${text}` : text,
        meta: `${AGENT_LABEL[agent]} · ${t.address}`,
        program: null,
        agent,
        status,
        time: timeMs(summary.last?.time),
      });
    }
    if (rows.length > 0) out.push({ id: group.id, name: group.name, note: group.note, conversations: rows });
  }
  return { groups: out };
}

export interface AttentionCard {
  address: string;
  name: string;
  agent: AgentKind;
}

/** Blocked terminals, named by tab else name, which wait for the user's answer, in the order given. */
export function attention(placed: Placed[], summaries: Summary[]): AttentionCard[] {
  const byTerminal = new Map(summaries.map((s) => [s.terminal, s]));
  return placed
    .filter(({ terminal: t }) => t.status?.state === 'blocked')
    .map(({ terminal: t, tab }) => ({
      address: t.address,
      name: tab || t.name || t.address,
      agent: agentKind(byTerminal.get(t.address)?.agent ?? t.status?.app),
    }));
}
