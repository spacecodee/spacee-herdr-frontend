import type { DriverAgent } from '../profiles';

/**
 * Permission screens as each agent draws them, shaped on the bridge repo's
 * `docs/superpowers/specs/2026-11-03-r3-findings.md`: Codex, opencode and pi from source, Claude
 * Code inferred from binary strings (never captured). `cursor` is the highlighted row.
 */
export interface ScreenSpec {
  request?: string[];
  /** Row labels in order, as the agent shows them. */
  rows?: string[];
  cursor?: number;
}

const mark = (agent: DriverAgent, on: boolean): string =>
  on ? { claude: '❯', codex: '›', pi: '→', opencode: '❯' }[agent] : ' ';

export function claudeScreen({
  request = ['Bash command', '', '  touch /tmp/x', '  Create a file'],
  rows = ['Yes', "Yes, and don't ask again for touch commands in /tmp", 'No, and tell Claude what to do differently (esc)'],
  cursor = 0,
}: ScreenSpec = {}): string {
  return [
    ...request,
    '',
    ' Do you want to proceed?',
    ...rows.map((r, i) => ` ${mark('claude', i === cursor)} ${i + 1}. ${r}`),
    '',
    ' Esc to cancel · Tab to amend',
  ].join('\n');
}

export function claudeTooShort(): string {
  return [
    ' This terminal is too short. Make it taller to choose Yes, or choose No.',
    '',
    ' Do you want to proceed?',
    '   1. Yes',
    ' ❯ 2. No, and tell Claude what to do differently (esc)',
    '',
    ' Esc to cancel',
  ].join('\n');
}

export function codexScreen({
  request = ['  Would you like to run the following command?', '  Environment: local', '  Reason: needs write access', '  $ touch /tmp/x'],
  rows = ['Yes, proceed (y)', "Yes, and don't ask again for commands that start with `touch` (p)", 'No, and tell Codex what to do differently (esc)'],
  cursor = 0,
}: ScreenSpec = {}): string {
  return [
    ...request,
    '',
    ...rows.map((r, i) => `${mark('codex', i === cursor)} ${i + 1}. ${r}`),
    '',
    '  Press enter to confirm or esc to cancel',
  ].join('\n');
}

export function codexPatchScreen(): string {
  return codexScreen({
    request: ['  Would you like to make the following edits?', '  src/app.ts (+3 -1)'],
    rows: ['Yes, proceed (y)', 'No, and tell Codex what to do differently (esc)'],
  });
}

export function opencodeScreen({ request = ['Bash', '$ touch /tmp/x'], rows = ['Allow once', 'Always allow', 'Reject'] }: ScreenSpec = {}): string {
  return [
    '┃  Permission required',
    ...request.map((l) => `┃  ${l}`),
    '┃',
    `  ${rows.join('   ')}`,
    '',
    '  ⇆ select   enter confirm',
  ].join('\n');
}

export function piScreen({ request = ['Allow guarded command?', 'rm -rf build'], cursor = 0 }: ScreenSpec = {}): string {
  return [
    '────────────────────────────',
    ...request.map((l) => ` ${l}`),
    '',
    `${mark('pi', cursor === 0)} Yes`,
    `${mark('pi', cursor === 1)} No`,
    '',
    ' ↑↓ navigate  enter select  esc cancel',
    '────────────────────────────',
  ].join('\n');
}

/** Question UIs (R2) that must never parse as a permission prompt. */
export const QUESTION_SCREENS: Record<DriverAgent, string> = {
  claude: [
    '←  ☐ Color  ☐ Size  ✔ Submit  →',
    '',
    'Which color?',
    '❯ 1. Rojo',
    '     Opción A.',
    '  2. Type something.',
    '  3. Chat about this',
    '',
    'Enter to select · Tab/Arrow keys to navigate · Esc to cancel',
  ].join('\n'),
  codex: [
    'Which color?',
    '› 1. Rojo',
    '  2. Verde',
    '  3. None of the above',
    '',
    'tab to add notes | enter to submit answer | ←/→ to navigate questions | esc to interrupt',
  ].join('\n'),
  opencode: ['Field 1 of 1', '', 'Which color?', '❯ 1. Yes', '  2. No', '', '⇆ tab  ↑↓ select  enter submit  esc dismiss'].join('\n'),
  pi: ['[1/2] ▸ Color', '', 'Which color?', '▸ Yes', '  No', '  Type something.', '', '↑↓ move · space toggle · enter select · tab switch · esc cancel'].join('\n'),
};
