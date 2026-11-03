import { describe, expect, it } from 'vitest';
import { PROFILES, canDrive, canOther, driverAgent } from './profiles';
import { readList, readRows } from './screen';

// Claude Code, live captures of the owner's AskUserQuestion (R2 findings, captures 3 and 4).
const CLAUDE_SINGLE = `←  ☐ Color  ☐ Frutas  ✔ Submit  →

❯ 1. Rojo
     Opción de prueba A.
  2. Verde
     Opción de prueba B.
  3. Azul
     Opción de prueba C.
  4. Type something.
───────────────────────────────────────
  5. Chat about this

Enter to select · Tab/Arrow keys to navigate · Esc to cancel`;

const CLAUDE_MULTI = `←  ☒ Color  ☒ Frutas  ✔ Submit  →

  1. [✔] Mango
         Opción de prueba 1.
  2. [ ] Piña
         Opción de prueba 2.
❯ 3. [✔] Uva
         Opción de prueba 3.
  4. [ ] Type something
     Submit
───────────────────────────────────────
  5. Chat about this

Enter to select · Tab/Arrow keys to navigate · Esc to cancel`;

describe('readRows', () => {
  it('reads the live Claude single-select capture, cursor included', () => {
    const rows = readRows(CLAUDE_SINGLE, PROFILES.claude, ['Rojo', 'Verde', 'Azul'], { other: true, submit: false });
    expect(rows?.map((r) => [r.kind, r.cursor])).toEqual([
      ['option', true],
      ['option', false],
      ['option', false],
      ['other', false],
    ]);
  });

  it('reads the live Claude multi-select capture: checkboxes, other row and the Submit row', () => {
    const rows = readRows(CLAUDE_MULTI, PROFILES.claude, ['Mango', 'Piña', 'Uva'], { other: false, submit: true });
    expect(rows?.map((r) => [r.kind, r.checked, r.cursor])).toEqual([
      ['option', true, false],
      ['option', false, false],
      ['option', true, true],
      ['other', false, false],
      ['submit', undefined, false],
    ]);
  });

  it('returns null when an option is missing, renamed or out of order', () => {
    const need = { other: false, submit: false };
    expect(readRows(CLAUDE_SINGLE, PROFILES.claude, ['Rojo', 'Verde', 'Violeta'], need)).toBeNull();
    expect(readRows(CLAUDE_SINGLE, PROFILES.claude, ['Verde', 'Rojo'], need)).toBeNull();
  });

  it('does not take a header chip for an option', () => {
    expect(readRows(CLAUDE_SINGLE, PROFILES.claude, ['Color'], { other: false, submit: false })).toBeNull();
  });

  it('needs the free-text row only when the answer is typed', () => {
    const noOther = CLAUDE_SINGLE.replace('  4. Type something.\n', '');
    expect(readRows(noOther, PROFILES.claude, ['Rojo'], { other: false, submit: false })).not.toBeNull();
    expect(readRows(noOther, PROFILES.claude, ['Rojo'], { other: true, submit: false })).toBeNull();
  });
});

describe('readList', () => {
  it('reads a numbered confirm list with its cursor', () => {
    expect(readList('Review your answers\n\n❯ 1. Submit answers\n  2. Cancel\n')).toEqual([
      { text: 'Submit answers', cursor: true },
      { text: 'Cancel', cursor: false },
    ]);
  });
});

describe('profiles', () => {
  it('maps an agent name to a driver, pi only exactly', () => {
    expect(driverAgent('claude')).toBe('claude');
    expect(driverAgent('Codex')).toBe('codex');
    expect(driverAgent('opencode')).toBe('opencode');
    expect(driverAgent('pi')).toBe('pi');
    expect(driverAgent('pip')).toBeNull();
    expect(driverAgent('gemini')).toBeNull();
    expect(driverAgent(undefined)).toBeNull();
  });

  const single = { question: 'q', options: [{ label: 'a' }, { label: 'b' }] };
  it('refuses what it cannot drive: unknown agent, cut options, multi on Codex, free text on Claude', () => {
    expect(canDrive('claude', [single], false)).toBe(true);
    expect(canDrive(null, [single], false)).toBe(false);
    expect(canDrive('claude', [single], true)).toBe(false);
    expect(canDrive('codex', [{ ...single, multiSelect: true }], false)).toBe(false);
    expect(canDrive('claude', [{ question: 'q', options: [] }], false)).toBe(false);
    expect(canDrive('codex', [{ question: 'q', options: [] }], false)).toBe(true);
    expect(canDrive('claude', [], false)).toBe(false);
  });

  it('offers "Other" only where the agent has the row and the part allows it', () => {
    expect(canOther('claude', { ...single, other: true })).toBe(true);
    expect(canOther('claude', single)).toBe(false);
    expect(canOther('claude', { ...single, other: true, multiSelect: true })).toBe(false);
    expect(canOther('pi', { ...single, other: true, multiSelect: true })).toBe(true);
  });
});
