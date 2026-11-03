import { normalize, parseLine } from './screen';
import type { DriverAgent } from './profiles';

export type ChoiceKind = 'approve' | 'approve-remember' | 'deny' | 'deny-text';

export interface PermissionChoice {
  label: string;
  kind: ChoiceKind;
  /** Kept so the cursor maths match the screen, but never offered as a button. */
  hidden?: true;
}

/** A permission prompt as read off an agent's screen. */
export interface PermissionPrompt {
  agent: DriverAgent;
  /** The agent's own question line ("Do you want to proceed?"). */
  title: string;
  /** The command or file lines the agent shows under it, at most six. */
  request: string[];
  /** Rows in screen order (left to right for opencode). */
  choices: PermissionChoice[];
  /** The highlighted row. opencode draws its buttons without a marker: the first is focused on open. */
  cursor: number;
}

export interface InlineChoices {
  approve: number;
  approveLabel: string;
  deny: number;
  denyLabel: string;
}

/** The two buttons the home list can offer: the first approve, and a denial (Esc, whichever row it is). */
export function inlineChoices(prompt: PermissionPrompt): InlineChoices | null {
  const approve = prompt.choices.findIndex((c) => c.kind === 'approve');
  let deny = prompt.choices.findIndex((c) => c.kind === 'deny');
  if (deny < 0) deny = prompt.choices.findIndex((c) => c.kind === 'deny-text');
  if (approve < 0 || deny < 0) return null;
  return {
    approve,
    approveLabel: prompt.choices[approve].label,
    deny,
    denyLabel: prompt.choices[deny].kind === 'deny' ? prompt.choices[deny].label : 'Deny',
  };
}

export const samePrompt = (a: PermissionPrompt | null, b: PermissionPrompt | null): boolean =>
  a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);

interface Line {
  raw: string;
  text: string;
  cursor: boolean;
}

const BORDER = /^[\s─━═╌┄┈╭╮╰╯┌┐└┘│┃║\-]*$/u;
const RULE = /^\s*[─━═]{10,}\s*$/u;
const DASHED = /^\s*[╌┄┈]{5,}\s*$/u;
/** Box-drawing or table bars in a label or question mean the parse caught something else (a side panel). */
const JUNK = /[\u2500-\u257f\u2580-\u259f]|\|\|/u;
const MAX_REQUEST = 6;

/** Question UIs (R2) and anything that is not a permission prompt, whatever the agent. */
const QUESTION_UI =
  /☐|✔ Submit|Type something|Chat about this|None of the above|Type your own answer|Field \d+ of \d+|\[\d+\/\d+\] ▸|to submit (answer|all)|to navigate questions|space toggle/i;

function lines(screen: string): Line[] {
  return screen.split('\n').map((l) => {
    // A left border is the agent's own box; the first border after content starts a side panel.
    let raw = l.replace(/^\s*[│┃║]/u, ' ');
    const panel = raw.search(/[│┃║]/u);
    if (panel >= 0) raw = raw.slice(0, panel);
    raw = raw.trimEnd();
    const p = parseLine(raw);
    return { raw, text: BORDER.test(raw) ? '' : normalize(p.text), cursor: p.cursor };
  });
}

/** What kind of answer a row is, from its label; null when it is none we know (then nothing is shown). */
function kindOf(label: string): ChoiceKind | null {
  if (/^no, and tell\b/i.test(label)) return 'deny-text';
  if (/^(no|reject|deny|cancel)\b/i.test(label)) return 'deny';
  if (/^always allow\b/i.test(label)) return 'approve-remember';
  if (/^(yes|allow)\b/i.test(label)) {
    return /don'?t ask again|always allow|switch to auto mode|this session|this conversation|in the future|for these files/i.test(label)
      ? 'approve-remember'
      : 'approve';
  }
  return null;
}

/** The shortcut hint at the end of a row (`(y)`, `(esc)`) is the agent's, not part of the label. */
const stripHint = (label: string): string => label.replace(/\s*\((?:esc|[a-z])\)\s*$/i, '').trim();

function choicesOf(labels: string[]): PermissionChoice[] | null {
  const choices: PermissionChoice[] = [];
  for (const raw of labels) {
    const label = stripHint(raw);
    const kind = kindOf(label);
    if (!kind) return null;
    // Switching the agent to auto mode is a standing grant, not an answer to this prompt.
    choices.push(/switch to auto mode/i.test(label) ? { label, kind, hidden: true } : { label, kind });
  }
  const approve = choices.some((c) => c.kind === 'approve' || c.kind === 'approve-remember');
  const deny = choices.some((c) => c.kind === 'deny' || c.kind === 'deny-text');
  return approve && deny ? choices : null;
}

const NUMBERED = /^\s*[❯›>▸→▶»]?\s*\d+[.)]\s+\S/u;

/** The first run of numbered rows; a row that wraps onto indented lines is joined into one. */
function numbered(all: Line[]): { start: number; rows: Line[] } | null {
  const start = all.findIndex((l) => NUMBERED.test(l.raw));
  if (start < 0) return null;
  const rows: Line[] = [];
  for (let i = start; i < all.length && NUMBERED.test(all[i].raw); i++) {
    let row = all[i];
    while (i + 1 < all.length && all[i + 1].text !== '' && !NUMBERED.test(all[i + 1].raw) && /^ {4,}\S/.test(all[i + 1].raw)) {
      i++;
      row = { ...row, text: `${row.text} ${all[i].text}` };
    }
    rows.push(row);
  }
  return { start, rows };
}

const body = (all: Line[], from: number, to: number, skip: RegExp | null = null): string[] =>
  all
    .slice(from, to)
    .map((l) => l.text)
    .filter((t) => t !== '' && !(skip && skip.test(t)))
    .slice(0, MAX_REQUEST);

function build(
  agent: DriverAgent,
  title: string,
  request: string[],
  rows: { label: string; cursor: boolean }[],
  cursor?: number,
): PermissionPrompt | null {
  const choices = choicesOf(rows.map((r) => r.label));
  if (!choices || JUNK.test(title) || choices.some((c) => JUNK.test(c.label))) return null;
  let at = cursor;
  if (at === undefined) {
    const marked = rows.flatMap((r, i) => (r.cursor ? [i] : []));
    if (marked.length !== 1) return null;
    at = marked[0];
  }
  return { agent, title, request, choices, cursor: at };
}

function claude(all: Line[], screen: string): PermissionPrompt | null {
  if (/too short/i.test(screen) || !/Esc to cancel/.test(screen) || /Press enter to confirm/.test(screen)) return null;
  const q = all.findIndex((l) => /^Do you want to\b/.test(l.text));
  const list = numbered(all);
  if (q < 0 || !list || list.start < q) return null;
  // The dialog starts under the last full-width rule; the command sits between its dashed rules.
  let from = 0;
  for (let i = q - 1; i >= 0; i--) if (RULE.test(all[i].raw)) { from = i + 1; break; }
  const dashed = all.slice(from, q).flatMap((l, i) => (DASHED.test(l.raw) ? [from + i] : []));
  let request =
    dashed.length >= 2 ? body(all, dashed[0] + 1, dashed[dashed.length - 1]) : body(all, from, q);
  if (dashed.length < 2 && request.length > 1) request = request.slice(1); // the tool's title line
  return build('claude', all[q].text, request, list.rows.map((r) => ({ label: r.text, cursor: r.cursor })));
}

function codex(all: Line[], screen: string): PermissionPrompt | null {
  const q = all.findIndex((l) => /^(Would you like to|Do you want to approve\b|.+ needs your approval)/.test(l.text));
  if (q < 0 && !/Press enter to confirm or esc to cancel/i.test(screen)) return null;
  const list = numbered(all);
  if (!list) return null;
  const request = body(all, q + 1, list.start, /^(Environment|Reason):/i);
  return build(
    'codex',
    q >= 0 ? all[q].text : 'Permission needed',
    request,
    list.rows.map((r) => ({ label: r.text, cursor: r.cursor })),
  );
}

function pi(all: Line[]): PermissionPrompt | null {
  const q = all.findIndex((l) => /^Allow .*\?$/.test(l.text));
  if (q < 0) return null;
  const rows = all.slice(q + 1).filter((l) => /^(Yes|No)$/.test(l.text));
  if (rows.length !== 2 || rows[0].text !== 'Yes' || rows[1].text !== 'No') return null;
  const first = all.indexOf(rows[0]);
  const request = body(all, q + 1, first);
  return build('pi', all[q].text, request, rows.map((r) => ({ label: r.text, cursor: r.cursor })));
}

function opencode(all: Line[]): PermissionPrompt | null {
  const head = all.findIndex((l) => /^Permission required\b/i.test(l.text));
  const buttons = all.findIndex((l) => /\bAllow once\b/.test(l.text) && /\bReject\b/.test(l.text));
  if (head < 0 || buttons < head) return null;
  // The buttons are drawn side by side and the focused one differs only by colour, which the
  // screen text does not carry: the first is the one that is focused when the prompt opens.
  const rows = all[buttons].raw.trim().split(/\s{2,}/).filter(Boolean);
  const request = body(all, head + 1, buttons);
  return build('opencode', all[head].text, request, rows.map((label) => ({ label, cursor: false })), 0);
}

/**
 * The permission prompt on this agent's screen, or null when the screen is anything else: a
 * question UI, another agent's prompt, a row we cannot classify, a cursor we cannot find. Null
 * means "show no buttons".
 */
export function parsePermission(screen: string, agent: DriverAgent): PermissionPrompt | null {
  if (QUESTION_UI.test(screen)) return null;
  const all = lines(screen);
  switch (agent) {
    case 'claude':
      return claude(all, screen);
    case 'codex':
      return codex(all, screen);
    case 'pi':
      return pi(all);
    case 'opencode':
      return opencode(all);
  }
}
