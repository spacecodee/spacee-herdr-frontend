import type { AgentQuestion } from '../chat/types';

export type DriverAgent = 'claude' | 'pi' | 'codex' | 'opencode';

/**
 * How one agent's question screen is read and answered. Keys come from the bridge repo's
 * `docs/superpowers/specs/2026-11-03-r2-findings.md`: Codex, opencode and pi are verified from
 * source, Claude Code only from live captures (its keys are inferred, so the driver checks the
 * screen after every key instead of trusting them).
 */
export interface Profile {
  /** The footer or header text that is on screen while the agent still asks. */
  hint: RegExp;
  /** A digit key chooses (and, for a single question, commits) option N: verified in source. */
  digits: boolean;
  /** How a multi-select is confirmed once toggled; `false` when the agent has none. */
  multi: false | 'submit-row' | 'tab' | 'enter';
  /** A free-text answer can go together with toggled options. */
  multiOther: boolean;
  /** The label of the free-text row under the options; null when there is none. */
  other: RegExp | null;
  /** The key that opens the free-text field from that row. */
  otherKey: 'enter' | 'tab';
  /** A question without options already has its text field focused. */
  textOnly: boolean;
  /** What closes the dialog after the last question: nothing, a Submit row, or Enter on a Review step. */
  finish: 'none' | 'submit-row' | 'enter';
}

export const PROFILES: Record<DriverAgent, Profile> = {
  claude: {
    hint: /Enter to select|Tab\/Arrow keys to navigate/i,
    digits: false,
    multi: 'submit-row',
    multiOther: false,
    other: /^Type something\.?$/i,
    otherKey: 'enter',
    textOnly: false,
    finish: 'submit-row',
  },
  pi: {
    hint: /↑↓ (move|navigate)/,
    digits: false,
    multi: 'enter',
    multiOther: true,
    other: /^Type something\.?$/i,
    otherKey: 'enter',
    textOnly: false,
    finish: 'none',
  },
  codex: {
    hint: /to submit (answer|all)|to navigate questions/i,
    digits: true,
    multi: false,
    multiOther: false,
    other: /^None of the above/i,
    otherKey: 'tab',
    textOnly: true,
    finish: 'none',
  },
  opencode: {
    hint: /↑↓ select|esc (dismiss|close)|Field \d+ of \d+/i,
    digits: true,
    multi: 'tab',
    multiOther: false,
    other: /^Type your own answer/i,
    otherKey: 'enter',
    textOnly: true,
    finish: 'enter',
  },
};

export function driverAgent(name: string | null | undefined): DriverAgent | null {
  const n = (name ?? '').trim().toLowerCase();
  for (const agent of Object.keys(PROFILES) as DriverAgent[]) {
    if (agent === 'pi' ? n === 'pi' || n.startsWith('pi-') || n.startsWith('pi ') : n.includes(agent)) return agent;
  }
  return null;
}

/** What the card may offer for this agent: the driver can only do what its profile lists. */
export function canOther(agent: DriverAgent, question: AgentQuestion): boolean {
  const profile = PROFILES[agent];
  if (!question.other) return false;
  if (question.options.length === 0) return profile.textOnly;
  return profile.other !== null && (!question.multiSelect || profile.multiOther);
}

/** False means the card shows only "Open terminal" (unknown agent, cut options, unsupported shape). */
export function canDrive(
  agent: DriverAgent | null,
  questions: AgentQuestion[],
  truncated: boolean | undefined,
): agent is DriverAgent {
  if (agent === null || truncated || questions.length === 0) return false;
  const profile = PROFILES[agent];
  return questions.every((q) => {
    if (q.options.length === 0) return profile.textOnly;
    if (q.options.length > 9) return false;
    return !q.multiSelect || profile.multi !== false;
  });
}
