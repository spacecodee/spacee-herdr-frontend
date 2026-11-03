import type { TerminalPort } from '../driver';
import type { DriverAgent } from '../profiles';
import { claudeScreen, codexScreen, opencodeScreen, piScreen } from './permission-screens';

const ROWS: Record<DriverAgent, string[]> = {
  claude: ['Yes', "Yes, and don't ask again for touch commands in /tmp", 'No, and tell Claude what to do differently (esc)'],
  codex: ['Yes, proceed (y)', "Yes, and don't ask again for commands that start with `touch` (p)", 'No, and tell Codex what to do differently (esc)'],
  opencode: ['Allow once', 'Always allow', 'Reject'],
  pi: ['Yes', 'No'],
};

/** A stand-in for an agent's permission prompt that reacts to named keys and records what it was given. */
export class FakePermissionTui implements TerminalPort {
  readonly sent: string[][] = [];
  readonly typed: string[] = [];
  /** The row Enter confirmed, or 'esc'. */
  result: string | null = null;
  /** The cursor does not move (a screen the keys do not reach). */
  stuck = false;
  /** Enter does nothing: the prompt stays. */
  ignoreEnter = false;
  /** Set to replace the screen with something unrelated. */
  override: string | null = null;
  cursor = 0;
  readonly rows: string[];

  constructor(
    readonly agent: DriverAgent,
    rows: string[] = ROWS[agent],
  ) {
    this.rows = rows;
  }

  async read(): Promise<string> {
    return this.render();
  }

  async keys(keys: string[]): Promise<void> {
    this.sent.push(keys);
    for (const key of keys) this.press(key);
  }

  async send(text: string): Promise<void> {
    this.typed.push(text);
  }

  get open(): boolean {
    return this.result === null;
  }

  render(): string {
    if (this.override !== null) return this.override;
    if (this.result !== null) return '$ ';
    const spec = { rows: this.rows, cursor: this.cursor };
    switch (this.agent) {
      case 'claude':
        return claudeScreen(spec);
      case 'codex':
        return codexScreen(spec);
      case 'opencode':
        return opencodeScreen(spec);
      case 'pi':
        return piScreen({ cursor: this.cursor });
    }
  }

  private press(key: string): void {
    if (!this.open) return;
    const horizontal = this.agent === 'opencode';
    const [back, forward] = horizontal ? ['left', 'right'] : ['up', 'down'];
    if (key === back || key === forward) {
      if (this.stuck) return;
      const next = this.cursor + (key === forward ? 1 : -1);
      this.cursor = Math.min(this.rows.length - 1, Math.max(0, next));
    } else if (key === 'enter') {
      if (!this.ignoreEnter) this.result = this.rows[this.cursor];
    } else if (key === 'esc') this.result = 'esc';
  }
}
