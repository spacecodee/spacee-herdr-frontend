import { normalize, readList } from './screen';

/** Screen texts verified live on Claude Code 2.1.317, Codex 0.166 and opencode 2.2.5 (bridge R4 findings §5). */

const RULE = /^\s*[─━]{4,}\s*$/;
const CLAUDE_PLACEHOLDER = /^Try "/;
export const CLAUDE_QUEUE_HINT = 'Press up to edit queued messages';

export const claudeWorking = (screen: string): boolean => /esc to interrupt/.test(screen);
export const codexWorking = (screen: string): boolean => /esc to interrupt/.test(screen);
export const opencodeWorking = (screen: string): boolean => /\besc interrupt\b/.test(screen);

/** The lines of Claude's composer (between its two rules), or null when the box is not on screen. */
export function claudeComposer(screen: string): string[] | null {
  const lines = screen.split('\n');
  const rules = lines.flatMap((l, i) => (RULE.test(l) ? [i] : []));
  if (rules.length < 2) return null;
  const body = lines.slice(rules[rules.length - 2] + 1, rules[rules.length - 1]);
  if (body.length === 0 || !/^\s*❯/u.test(body[0])) return null;
  return body.map((l, i) => (i === 0 ? l.replace(/^\s*❯ ?/u, '') : l.replace(/^ {1,2}/, '')).trimEnd());
}

/** True for a composer with nothing typed (the fresh-session placeholder counts as nothing). */
export function claudeEmpty(composer: string[] | null): boolean {
  if (!composer) return false;
  const text = composer.join('').trim();
  return text === '' || (composer.length === 1 && CLAUDE_PLACEHOLDER.test(text));
}

export const claudeHasQueue = (composer: string[] | null): boolean => composer?.length === 1 && composer[0].trim() === CLAUDE_QUEUE_HINT;

export interface PickerEntry {
  text: string;
  /** `No code changes`, or the file line (`notes.txt +1 -1`). */
  detail: string;
}
export interface Picker {
  entries: PickerEntry[];
  /** Index of the row under the marker; `entries.length` is the `(current)` row. */
  cursor: number;
  /** Prompts scrolled out of view (`↑ 2 more`, `↓ 1 more`) at narrow widths. */
  hidden: number;
  /** Of those, the ones below the rows in view (`↓ N more`). */
  below: number;
  /** Ups from the cursor to the `(current)` row: it counts in `↓ N more` when scrolled out of view. */
  fromEnd: number;
}

/** The line under a prompt: no edits, file edits, or `⚠ No code restore` (a queued message delivered mid-turn). */
const CODE_DETAIL = /^(?:⚠\s*)?No code (?:changes|restore)\b|\+\d+\s+-\d+/;
/** Whether that line means files would be restored. */
export const hasCodeChanges = (detail: string): boolean => /\+\d+\s+-\d+/.test(detail);
const MORE = /^[↑↓]\s*(\d+)\s+more\b/;

/** Claude's `/rewind` picker: the live branch's prompts, each with the code line under it. */
export function claudePicker(screen: string): Picker | null {
  const lines = screen.split('\n');
  const title = lines.findIndex((l) => /^\s*Rewind\s*$/.test(l));
  const foot = lines.findIndex((l) => /Enter to continue/.test(l));
  if (title < 0 || foot < title) return null;
  // The explanation may wrap over several lines at a narrow width.
  let start = title + 1;
  let acc = '';
  while (start < foot && !/point\s+before/.test(acc)) acc += ` ${lines[start++]}`;
  if (!/Restore the code and\/or conversation/.test(normalize(acc))) return null;
  const entries: PickerEntry[] = [];
  let pending: string[] = [];
  let cursor = -1;
  let ended = false;
  let hidden = 0;
  let below = 0;
  for (const raw of lines.slice(start, foot)) {
    if (raw.trim() === '') continue;
    const marker = /^\s*❯/u.test(raw);
    const text = normalize(raw.replace(/^\s*❯/u, ''));
    const more = MORE.exec(text);
    if (more) {
      hidden += Number(more[1]);
      if (text.startsWith('↓')) below += Number(more[1]);
      continue;
    }
    if (text === '(current)') {
      if (marker) cursor = entries.length;
      ended = true;
      break;
    }
    if (CODE_DETAIL.test(text) && pending.length > 0) {
      entries.push({ text: normalize(pending.join(' ')), detail: text });
      pending = [];
      continue;
    }
    if (marker) cursor = entries.length;
    pending.push(text);
  }
  if ((!ended && below === 0) || cursor < 0) return null;
  if (pending.length > 0 && below === 0) return null;
  return { entries, cursor, hidden, below, fromEnd: ended ? entries.length - cursor : entries.length - 1 - cursor + below };
}

/** All whitespace gone: a prompt wrapped over lines at 52 columns still equals itself. */
export const squash = (text: string): string => text.replace(/\s+/g, '');

/** True when the picker row `shown` (maybe cut with `…`) is the message `wanted`. */
export function sameMessage(shown: string, wanted: string): boolean {
  const a = squash(shown);
  const b = squash(wanted);
  if (a === b) return true;
  return a.endsWith('…') && b.startsWith(a.slice(0, -1));
}

export interface Confirm {
  /** The screen says no file will change. */
  codeUnchanged: boolean;
  rows: { text: string; cursor: boolean }[];
}

export function claudeConfirm(screen: string): Confirm | null {
  const flat = normalize(screen);
  if (!/Confirm you want to restore to the point before you sent this message/.test(flat)) return null;
  const rows = readList(screen);
  if (rows.length === 0) return null;
  return { codeUnchanged: /The code will be unchanged\./.test(flat), rows };
}

/** The text after the last `›` of Codex's screen (composer plus its footer), or null without a composer. */
export function codexComposerTail(screen: string): string | null {
  const at = screen.lastIndexOf('›');
  return at < 0 ? null : screen.slice(at + 1);
}

/** The composer holds nothing: empty, or only Codex's placeholder. */
export function codexEmpty(screen: string): boolean {
  const tail = codexComposerTail(screen);
  if (tail === null) return false;
  const first = tail.split('\n')[0].trim();
  return first === '' || /^Ask Codex to do anything/.test(first);
}

/** Whether Codex's composer starts with `text`. */
export function codexComposerHolds(screen: string, text: string): boolean {
  const tail = codexComposerTail(screen);
  return tail !== null && squash(tail).startsWith(squash(text));
}

/** `N message(s) reverted` from opencode's transcript, or null. */
export function opencodeReverted(screen: string): number | null {
  const m = /(\d+) messages? reverted/.exec(screen);
  return m ? Number(m[1]) : null;
}

/** Screen texts that may wrap at a narrow width are looked for in the whitespace-collapsed screen. */
export const codexHint = (screen: string): boolean => /esc again to edit previous message/.test(normalize(screen));
export const codexBrowsing = (screen: string): boolean => /Browsing\b/.test(normalize(screen)) && /rewind/.test(normalize(screen));
export const codexReverted = (screen: string): 'ok' | 'steer' | null => {
  const flat = normalize(screen);
  return /Failed to edit the selected prompt/.test(flat) ? 'steer' : /Conversation reverted to this point/.test(flat) ? 'ok' : null;
};
