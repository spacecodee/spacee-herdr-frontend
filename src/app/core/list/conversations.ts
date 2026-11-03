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

export type AgentKind = 'claude' | 'pi' | 'codex' | 'opencode' | 'antigravity' | 'generic';

/** Order matters: the first name found in the agent string wins. */
const KINDS: readonly AgentKind[] = ['claude', 'pi', 'codex', 'opencode', 'antigravity'];

export function agentKind(name: string | null | undefined): AgentKind {
  const n = (name ?? '').trim().toLowerCase();
  if (n === '') return 'generic';
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

export interface Conversation {
  address: string;
  title: string;
  preview: string;
  meta: string;
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

export interface PlainTerminal {
  address: string;
  name: string;
  cwd: string;
  status: string | null;
}

export interface Home {
  groups: ConversationGroup[];
  plain: PlainTerminal[];
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

const byAddress = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function matches(query: string, fields: readonly (string | null | undefined)[]): boolean {
  return fields.some((f) => (f ?? '').toLowerCase().includes(query));
}

/**
 * Turns the placed terminals and the transcript summaries into the home screen: conversations
 * grouped as given and ordered by last activity, and the terminals that have no transcript.
 * `query` keeps only what matches space, tab, terminal name, title or last message text.
 */
export function toHome(groups: PlacedGroup[], summaries: Summary[], query: string): Home {
  const q = query.trim().toLowerCase();
  const byTerminal = new Map(summaries.map((s) => [s.terminal, s]));
  const out: ConversationGroup[] = [];
  const plain: PlainTerminal[] = [];

  for (const group of groups) {
    const conversations: Conversation[] = [];
    for (const { terminal: t, tab } of group.items) {
      const name = t.name || t.address;
      const status = t.status?.state ?? null;
      const summary = byTerminal.get(t.address);
      if (!summary) {
        const cwd = cwdTail(t.foreground?.cwd || t.cwd);
        if (q === '' || matches(q, [group.name, tab, name, t.address, cwd])) {
          plain.push({ address: t.address, name, cwd, status });
        }
        continue;
      }
      const text = squash(summary.last?.text ?? '');
      const preview = text !== '' && summary.last?.role === 'user' ? `You: ${text}` : text;
      const title = summary.title || tab || name;
      if (q !== '' && !matches(q, [group.name, tab, name, summary.title, text])) continue;
      conversations.push({
        address: t.address,
        title,
        preview,
        meta: tab ? `${tab} · ${t.address}` : t.address,
        agent: agentKind(summary.agent),
        status,
        time: timeMs(summary.last?.time),
      });
    }
    if (conversations.length === 0) continue;
    conversations.sort(
      (a, b) =>
        (b.time ?? -Infinity) - (a.time ?? -Infinity) || byAddress(a.address, b.address),
    );
    out.push({ id: group.id, name: group.name, note: group.note, conversations });
  }
  plain.sort((a, b) => byAddress(a.address, b.address));
  return { groups: out, plain };
}

export interface AttentionCard {
  address: string;
  name: string;
  agent: AgentKind;
}

/** Blocked terminals, which wait for the user's answer, in the order given. */
export function attention(terminals: Terminal[], summaries: Summary[]): AttentionCard[] {
  const byTerminal = new Map(summaries.map((s) => [s.terminal, s]));
  return terminals
    .filter((t) => t.status?.state === 'blocked')
    .map((t) => ({
      address: t.address,
      name: t.name || t.address,
      agent: agentKind(byTerminal.get(t.address)?.agent ?? t.status?.app),
    }));
}
