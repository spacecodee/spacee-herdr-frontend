import { Stop, until, type DriveResult, type TerminalPort, type Tuning } from './driver';
import { parsePermission, type PermissionPrompt } from './permission';

const sameChoices = (a: PermissionPrompt, b: PermissionPrompt): boolean =>
  a.agent === b.agent && JSON.stringify(a.choices) === JSON.stringify(b.choices);

/**
 * Answers the permission prompt the user saw: checks the screen still shows it, presses the
 * agent's keys for the chosen row, and checks the prompt is gone afterwards. Approving moves the
 * cursor by label with arrows (verifying the marker after the move, except opencode, whose
 * buttons carry none) and presses Enter. Both denials are Esc; for "No, and tell …" the caller
 * sends the typed text once the agent is free. Any mismatch stops with nothing further pressed.
 */
export async function drivePermission(
  port: TerminalPort,
  shown: PermissionPrompt,
  choice: number,
  tuning: Tuning,
): Promise<DriveResult> {
  try {
    const chosen = shown.choices[choice];
    if (!chosen) throw new Stop('screen');
    const matches = (screen: string): PermissionPrompt | null => {
      const now = parsePermission(screen, shown.agent);
      return now && sameChoices(now, shown) ? now : null;
    };
    const start = await until(port, tuning, matches);
    if (!start) throw new Stop('screen');

    if (chosen.kind === 'deny' || chosen.kind === 'deny-text') {
      await port.keys(['esc']);
    } else {
      const horizontal = shown.agent === 'opencode';
      const delta = choice - start.value.cursor;
      if (delta !== 0) {
        const key = horizontal ? (delta > 0 ? 'right' : 'left') : delta > 0 ? 'down' : 'up';
        await port.keys(Array<string>(Math.abs(delta)).fill(key));
        if (!horizontal) {
          const moved = await until(port, tuning, (s) => {
            const now = matches(s);
            return now && now.cursor === choice ? now : null;
          });
          if (!moved) throw new Stop('cursor');
        }
      }
      await port.keys(['enter']);
    }

    const gone = await until(port, tuning, (s) => (parsePermission(s, shown.agent) === null ? true : null));
    if (!gone) throw new Stop('stalled');
    return { ok: true };
  } catch (error) {
    if (error instanceof Stop) return { ok: false, reason: error.reason };
    return { ok: false, reason: 'transport' };
  }
}
