import { Stop, until, type FailReason, type TerminalPort, type Tuning } from './driver';
import {
  claudeComposer,
  claudeConfirm,
  claudeEmpty,
  claudeHasQueue,
  claudePicker,
  claudeWorking,
  codexBrowsing,
  codexComposerHolds,
  codexEmpty,
  codexHint,
  codexReverted,
  codexWorking,
  hasCodeChanges,
  opencodeReverted,
  opencodeWorking,
  sameMessage,
  squash,
} from './rewind-screen';
import { normalize } from './screen';

export type RewindResult = { ok: true; codeChanges?: boolean } | { ok: false; reason: FailReason };

/** The message to go back to, and how far back it is. */
export interface RewindTarget {
  /** The message's text, which the agent's own screen must show at the row we stop on. */
  text: string;
  /** User messages after it: 0 for the last one. */
  back: number;
  /** Also restore files (Claude only, and only when the confirm screen offers it). */
  files?: boolean;
  /** Look only: open the picker, read the row, close it. */
  peek?: boolean;
}

const MAX_CLEARS = 12;

const fail = (error: unknown): RewindResult =>
  error instanceof Stop ? { ok: false, reason: error.reason } : { ok: false, reason: 'transport' };

/**
 * Presses Ctrl+U (one line each time) until `empty` accepts the screen, at most `max` times and with a
 * short wait after each, so it always ends. Never Ctrl+C: Claude arms exit with it.
 */
async function clearComposer(port: TerminalPort, tuning: Tuning, empty: (screen: string) => boolean, max = 4): Promise<void> {
  const short: Tuning = { ...tuning, attempts: Math.min(tuning.attempts, 4) };
  for (let i = 0; i < max; i++) {
    await port.keys(['ctrl+u']);
    if (await until(port, short, (s) => (empty(s) ? true : null))) return;
  }
  throw new Stop('stalled');
}

/** Leaves a menu we opened without choosing anything. Esc only. */
async function leave(port: TerminalPort, tuning: Tuning, open: (screen: string) => boolean): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (!open(await port.read())) return;
    await port.keys(['esc']);
    await tuning.sleep(tuning.intervalMs);
  }
}

const claudeMenu = (screen: string): boolean => claudePicker(screen) !== null || claudeConfirm(screen) !== null;

async function claudeIdle(port: TerminalPort, tuning: Tuning): Promise<void> {
  const first = await port.read();
  if (claudeWorking(first) || claudeHasQueue(claudeComposer(first))) throw new Stop('busy');
  // A ghost suggestion looks like typed text in a read and survives Ctrl+U: what is still on the
  // line after one Ctrl+U is a ghost, so the composer counts as empty. Esc Esc opens the picker anyway.
  await port.keys(['ctrl+u']);
  const ready = await until(port, tuning, (s) => (!claudeWorking(s) && claudeComposer(s) !== null && !claudeHasQueue(claudeComposer(s)) ? true : null));
  if (!ready) throw new Stop('busy');
}

/**
 * Claude Code: Esc Esc opens the rewind picker; the prompt is chosen by counting Up from `(current)`
 * and checking the row's text; Enter opens the confirm list, where the row is picked by label (never
 * a digit). Afterwards Claude has put the prompt in its composer, which is cleared again.
 */
export async function rewindClaude(port: TerminalPort, target: RewindTarget, tuning: Tuning): Promise<RewindResult> {
  let menu = false;
  try {
    await claudeIdle(port, tuning);
    await port.keys(['esc', 'esc']);
    menu = true;
    const opened = await until(port, tuning, claudePicker);
    if (!opened) throw new Stop('screen');
    // The picker may show only its last rows when it opens, without saying how many are scrolled away,
    // so the range is not judged here: the row the cursor ends on is what decides (below).
    if (target.back < 0) throw new Stop('prompt');
    // The cursor may open on (current) or already on the last prompt: count Ups from where it is.
    const ups = target.back + 1 - opened.value.fromEnd;
    if (ups < 0) throw new Stop('prompt');
    if (ups > 0) await port.keys(Array<string>(ups).fill('up'));
    const at = await until(port, tuning, (s) => {
      const p = claudePicker(s);
      if (!p || p.cursor >= p.entries.length || !sameMessage(p.entries[p.cursor].text, target.text)) return null;
      // Everything in view: the row must also be the right number of prompts from the end.
      return p.hidden > 0 || p.cursor === p.entries.length - 1 - target.back ? p : null;
    });
    if (!at) throw new Stop('prompt');
    const want = at.value.cursor;
    if (target.peek) {
      await leave(port, tuning, claudeMenu);
      return { ok: true, codeChanges: hasCodeChanges(at.value.entries[want].detail) };
    }

    await port.keys(['enter']);
    const confirm = await until(port, tuning, claudeConfirm);
    if (!confirm) throw new Stop('screen');
    const label = target.files && !confirm.value.codeUnchanged ? 'Restore code and conversation' : 'Restore conversation';
    const row = confirm.value.rows.findIndex((r) => normalize(r.text) === label);
    const from = confirm.value.rows.findIndex((r) => r.cursor);
    if (row < 0 || from < 0) throw new Stop('screen');
    if (row !== from) {
      await port.keys(Array<string>(Math.abs(row - from)).fill(row > from ? 'down' : 'up'));
      const moved = await until(port, tuning, (s) => (claudeConfirm(s)?.rows[row]?.cursor ? true : null));
      if (!moved) throw new Stop('cursor');
    }
    menu = false;
    await port.keys(['enter']);

    const holds = (s: string): boolean => {
      const c = claudeComposer(s);
      return !!c && !claudeEmpty(c) && !claudeMenu(s) && sameMessage(c.join(' '), target.text);
    };
    const landed = await until(port, tuning, (s) => (holds(s) ? claudeComposer(s)!.length : null));
    if (!landed) throw new Stop('stalled');
    // One Ctrl+U per line. What is left afterwards may be a ghost suggestion, which is not the prompt.
    for (let i = 0; i < landed.value; i++) {
      await port.keys(['ctrl+u']);
      if (await until(port, { ...tuning, attempts: Math.min(tuning.attempts, 4) }, (s) => (!holds(s) ? true : null))) break;
    }
    if (holds(await port.read())) throw new Stop('stalled');
    return { ok: true, codeChanges: !confirm.value.codeUnchanged };
  } catch (error) {
    if (menu) await leave(port, tuning, claudeMenu).catch(() => undefined);
    return fail(error);
  }
}

/**
 * Claude Code, queued messages: `Up` pulls ALL of them back into the composer, one per line. The
 * composer is cleared (one Ctrl+U per line) and every message except the chosen one is typed back
 * as queued. The caller puts the chosen one in the phone's compose field (Edit) or drops it (Cancel).
 */
export async function takeQueued(port: TerminalPort, queued: string[], chosen: number, tuning: Tuning): Promise<RewindResult> {
  try {
    if (chosen < 0 || chosen >= queued.length) throw new Stop('screen');
    const screen = await port.read();
    if (!claudeHasQueue(claudeComposer(screen))) throw new Stop('queue');
        if (!queued.every((q) => squash(screen).includes(squash(q)))) throw new Stop('screen');

    await port.keys(['up']);
    const pulled = await until(port, tuning, (s) => {
      const c = claudeComposer(s);
      return c && !claudeEmpty(c) && !claudeHasQueue(c) ? c : null;
    });
    if (!pulled || squash(pulled.value.join(' ')) !== squash(queued.join(' '))) throw new Stop('screen');
    await clearComposer(port, tuning, (s) => claudeEmpty(claudeComposer(s)));

    for (let i = 0; i < queued.length; i++) if (i !== chosen) await port.send(queued[i]);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Codex: Esc, Esc opens the transcript browser on the last prompt, Left walks back over normal
 * prompts, Enter rewinds. The highlight is invisible in a read, so the prompt that lands in the
 * composer is the only proof; Codex itself refuses a prompt that was a steer.
 */
export async function rewindCodex(port: TerminalPort, target: RewindTarget, tuning: Tuning): Promise<RewindResult> {
  let browsing = false;
  try {
    const first = await port.read();
    if (codexWorking(first)) throw new Stop('busy');
    await clearComposer(port, tuning, (s) => !codexWorking(s) && codexEmpty(s));
    await port.keys(['esc']);
    if (!(await until(port, tuning, (s) => (codexHint(s) ? true : null)))) throw new Stop('screen');
    await port.keys(['esc']);
    browsing = true;
    if (!(await until(port, tuning, (s) => (codexBrowsing(s) ? true : null)))) throw new Stop('screen');
    if (target.back < 0) throw new Stop('prompt');
    if (target.back > 0) await port.keys(Array<string>(target.back).fill('left'));
    await port.keys(['enter']);
    const done = await until(port, tuning, codexReverted);
    if (!done) throw new Stop('stalled');
    browsing = false;
    if (done.value === 'steer') {
      await clearComposer(port, tuning, (s) => codexEmpty(s));
      throw new Stop('steer');
    }
    if (!codexComposerHolds(done.screen, target.text)) {
      await clearComposer(port, tuning, (s) => codexEmpty(s)).catch(() => undefined);
      throw new Stop('prompt');
    }
    await clearComposer(port, tuning, (s) => codexEmpty(s));
    return { ok: true };
  } catch (error) {
    if (browsing) await port.keys(['esc']).catch(() => undefined);
    return fail(error);
  }
}

/**
 * opencode: `/undo` typed as raw keys once per message back (Ctrl+U before each, or it would append
 * to the restored prompt), checking the transcript counts one more reverted message every time.
 */
export async function rewindOpencode(port: TerminalPort, target: RewindTarget, tuning: Tuning): Promise<RewindResult> {
  try {
    if (target.back < 0) throw new Stop('prompt');
    if (opencodeWorking(await port.read())) throw new Stop('busy');
    for (let n = 1; n <= target.back + 1; n++) {
      await port.keys(['ctrl+u']);
      await port.keys([...'/undo']);
      if (!(await until(port, tuning, (s) => (s.includes('/undo') ? true : null)))) throw new Stop('screen');
      await port.keys(['enter']);
      if (!(await until(port, tuning, (s) => (opencodeReverted(s) === n ? true : null)))) throw new Stop('screen');
    }
    await port.keys(['ctrl+u']);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
