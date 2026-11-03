import type { AgentQuestion } from '../chat/types';
import { PROFILES, type DriverAgent, type Profile } from './profiles';
import { readList, readRows, type ScreenRow } from './screen';

/** What the user picked for one question: option indexes, and/or typed text. */
export interface Answer {
  picks: number[];
  text?: string;
}

/** The terminal, as the driver needs it. Text never goes through logging. */
export interface TerminalPort {
  read(): Promise<string>;
  keys(keys: string[]): Promise<void>;
  /** Types the text and presses Enter. */
  send(text: string): Promise<void>;
}

export type FailReason = 'screen' | 'cursor' | 'checkbox' | 'stalled' | 'transport';
export type DriveResult = { ok: true } | { ok: false; reason: FailReason };

export interface Tuning {
  /** Reads before giving up on a screen to change. */
  attempts: number;
  sleep: (ms: number) => Promise<void>;
  intervalMs: number;
}

export const DEFAULT_TUNING: Tuning = {
  attempts: 24,
  intervalMs: 250,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class Stop extends Error {
  constructor(readonly reason: FailReason) {
    super(reason);
  }
}

/**
 * Types the user's answers into the agent's own question screen, one key at a time. Before each
 * step it reads the screen and checks it is the expected one (the question's options, the cursor
 * row, the checkbox it just toggled); any mismatch stops with nothing else pressed. The caller
 * shows "Open terminal" on a failure and waits for the transcript to confirm on success.
 */
export async function drive(
  port: TerminalPort,
  agent: DriverAgent,
  questions: AgentQuestion[],
  answers: Answer[],
  tuning: Tuning = DEFAULT_TUNING,
): Promise<DriveResult> {
  const profile = PROFILES[agent];
  try {
    if (questions.length === 0 || answers.length !== questions.length) throw new Stop('screen');
    for (let i = 0; i < questions.length; i++) {
      await answer(port, profile, questions[i], answers[i], tuning);
    }
    await finish(port, profile, tuning);
    return { ok: true };
  } catch (error) {
    if (error instanceof Stop) return { ok: false, reason: error.reason };
    return { ok: false, reason: 'transport' };
  }
}

/** Polls until `pick` accepts the screen; null when it never does. */
export async function until<T>(
  port: TerminalPort,
  tuning: Tuning,
  pick: (screen: string) => T | null,
): Promise<{ screen: string; value: T } | null> {
  for (let i = 0; i < tuning.attempts; i++) {
    const screen = await port.read();
    const value = pick(screen);
    if (value !== null) return { screen, value };
    if (i < tuning.attempts - 1) await tuning.sleep(tuning.intervalMs);
  }
  return null;
}

/** The screen after a key: anything different from `before`. */
async function changed(port: TerminalPort, tuning: Tuning, before: string): Promise<string> {
  const next = await until(port, tuning, (s) => (s !== before ? s : null));
  if (!next) throw new Stop('stalled');
  return next.screen;
}

async function answer(
  port: TerminalPort,
  profile: Profile,
  q: AgentQuestion,
  a: Answer,
  tuning: Tuning,
): Promise<void> {
  const labels = q.options.map((o) => o.label);
  const wantsOther = a.text !== undefined;
  const picks = [...new Set(a.picks)].sort((x, y) => x - y);
  if (picks.some((p) => !Number.isInteger(p) || p < 0 || p >= labels.length)) throw new Stop('screen');
  if (!wantsOther && picks.length === 0) throw new Stop('screen');
  if (!q.multiSelect && picks.length + (wantsOther ? 1 : 0) !== 1) throw new Stop('screen');
  const needSubmit = !!q.multiSelect && profile.multi === 'submit-row' && !wantsOther;
  const rowsOf = (screen: string): ScreenRow[] | null => {
    if (!profile.hint.test(screen)) return null;
    const rows = readRows(screen, profile, labels, { other: wantsOther, submit: needSubmit });
    return rows && rows.some((r) => r.cursor) ? rows : null;
  };

  // The expected question is on screen: its options in order, a cursor, the agent's own footer.
  let start: { screen: string; value: ScreenRow[] | null } | null;
  if (labels.length === 0) {
    if (!profile.textOnly) throw new Stop('screen');
    start = await until(port, tuning, (s) => (profile.hint.test(s) ? [] : null));
  } else {
    start = await until(port, tuning, rowsOf);
  }
  if (!start) throw new Stop('screen');
  let screen = start.screen;
  let rows = start.value ?? [];

  const moveTo = async (target: number): Promise<void> => {
    const from = rows.findIndex((r) => r.cursor);
    if (from < 0 || target >= rows.length) throw new Stop('cursor');
    const delta = target - from;
    if (delta !== 0) {
      await port.keys(Array<string>(Math.abs(delta)).fill(delta > 0 ? 'down' : 'up'));
      const moved = await until(port, tuning, (s) => {
        const next = rowsOf(s);
        return next && next[target]?.cursor && next.findIndex((r) => r.cursor) === target ? next : null;
      });
      if (!moved) throw new Stop('cursor');
      screen = moved.screen;
      rows = moved.value;
    }
  };
  const press = async (keys: string[]): Promise<void> => {
    await port.keys(keys);
    screen = await changed(port, tuning, screen);
  };
  const type = async (text: string): Promise<void> => {
    await port.send(text);
    screen = await changed(port, tuning, screen);
  };

  if (labels.length === 0) {
    await type(a.text ?? '');
    return;
  }

  if (q.multiSelect) {
    for (let i = 0; i < labels.length; i++) {
      const want = picks.includes(i);
      const now = rows[i].checked;
      if (now === undefined) throw new Stop('checkbox');
      if (now === want) continue;
      await moveTo(i);
      await port.keys(['space']);
      const flipped = await until(port, tuning, (s) => {
        const next = rowsOf(s);
        return next && next[i].checked === want ? next : null;
      });
      if (!flipped) throw new Stop('checkbox');
      screen = flipped.screen;
      rows = flipped.value;
    }
    if (wantsOther) {
      await moveTo(rows.findIndex((r) => r.kind === 'other'));
      await press([profile.otherKey]);
      await type(a.text ?? '');
      return;
    }
    if (profile.multi === 'submit-row') {
      await moveTo(rows.findIndex((r) => r.kind === 'submit'));
      await press(['enter']);
    } else if (profile.multi === 'tab') await press(['tab']);
    else await press(['enter']);
    return;
  }

  if (wantsOther) {
    await moveTo(rows.findIndex((r) => r.kind === 'other'));
    await press([profile.otherKey]);
    await type(a.text ?? '');
    return;
  }
  const pick = picks[0];
  if (profile.digits) await press([String(pick + 1)]);
  else {
    await moveTo(pick);
    await press(['enter']);
  }
}

/** After the last question: nothing more to do, or the Submit / Review step that closes it. */
async function finish(port: TerminalPort, profile: Profile, tuning: Tuning): Promise<void> {
  if (profile.finish === 'none') return;
  for (let step = 0; step < 3; step++) {
    const screen = await port.read();
    if (!profile.hint.test(screen) && !/review/i.test(screen)) return;
    if (profile.finish === 'enter') {
      if (!/review/i.test(screen)) {
        // Not yet drawn, or already gone: give it a moment, then look again.
        await tuning.sleep(tuning.intervalMs);
        continue;
      }
      await port.keys(['enter']);
    } else {
      const list = readList(screen);
      const target = list.findIndex((r) => /^submit( answers)?$/i.test(r.text));
      const from = list.findIndex((r) => r.cursor);
      if (target < 0 || from < 0) {
        await tuning.sleep(tuning.intervalMs);
        continue;
      }
      if (target !== from) {
        await port.keys(Array<string>(Math.abs(target - from)).fill(target > from ? 'down' : 'up'));
        const moved = await until(port, tuning, (s) => {
          const l = readList(s);
          return l[target]?.cursor && /^submit/i.test(l[target].text) ? true : null;
        });
        if (!moved) throw new Stop('cursor');
      }
      await port.keys(['enter']);
    }
    const next = await until(port, tuning, (s) => (profile.hint.test(s) ? null : true));
    if (next) return;
  }
  throw new Stop('stalled');
}
