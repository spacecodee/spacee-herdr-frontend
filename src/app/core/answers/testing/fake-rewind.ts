import type { TerminalPort } from '../driver';

const RULE = '─'.repeat(40);

/** Records every key and typed text, so a spec can prove what was never pressed. */
abstract class Fake implements TerminalPort {
  /** Every key, flattened, in order. */
  readonly pressed: string[] = [];
  readonly typed: string[] = [];
  /** Replaces the screen with something unrelated. */
  override: string | null = null;

  abstract render(): string;
  protected abstract press(key: string): void;

  async read(): Promise<string> {
    return this.override ?? this.render();
  }

  async keys(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.pressed.push(key);
      this.press(key);
    }
  }

  async send(text: string): Promise<void> {
    this.typed.push(text);
    this.onSend(text);
  }

  protected onSend(_text: string): void {}
}

export interface FakeClaudeInit {
  prompts: string[];
  /** Per prompt: the code line in the picker. Defaults to `No code changes`. */
  details?: string[];
  working?: boolean;
  queued?: string[];
  /** A ghost suggestion in the composer until Ctrl+U. */
  ghost?: string;
  /** The ghost stays after Ctrl+U (Claude 2.1.317 at 52 columns). */
  stickyGhost?: boolean;
  /** Prompt rows the picker shows at once; the rest scroll (`↑ 2 more`). */
  window?: number;
  /** Picker rows are cut to this many characters plus `…`. */
  truncate?: number;
  /** Wraps the confirm lines at 52 columns. */
  narrow?: boolean;
  /** No `↑/↓ N more` lines until the cursor first moves. */
  hideMoreAtOpen?: boolean;
  /** The picker opens with the cursor already on the last prompt, not on (current). */
  openOnLast?: boolean;
}

/** Claude Code 2.1.317: composer between rules, `/rewind` picker, confirm list, queue. */
export class FakeClaude extends Fake {
  prompts: string[];
  details: string[];
  working: boolean;
  queued: string[];
  ghost: string | undefined;
  composer: string[] = [''];
  private top = 0;
  private moved = false;
  mode: 'idle' | 'picker' | 'confirm' = 'idle';
  cursor = 0;
  confirmCursor = 0;
  /** The row Enter confirmed on the confirm list. */
  restored: string | null = null;
  private lastKey = '';
  /** The picker ignores keys (nothing moves). */
  stuck = false;
  /** Shows these rows on the confirm list instead of the real ones. */
  confirmRows: string[] | null = null;

  constructor(init: FakeClaudeInit) {
    super();
    this.prompts = [...init.prompts];
    this.details = init.details ?? init.prompts.map(() => 'No code changes');
    this.working = init.working ?? false;
    this.queued = [...(init.queued ?? [])];
    this.ghost = init.ghost;
    this.init = init;
  }

  private readonly init: FakeClaudeInit;

  private get indicators(): boolean {
    return !this.init.hideMoreAtOpen || this.moved;
  }

  private get hasCode(): boolean {
    return this.details[this.cursor] !== 'No code changes';
  }

  get rows(): string[] {
    if (this.confirmRows) return this.confirmRows;
    return this.hasCode
      ? ['Restore code and conversation', 'Restore conversation', 'Restore code', 'Summarize from here', 'Summarize up to here', 'Never mind']
      : ['Restore conversation', 'Summarize from here', 'Summarize up to here', 'Never mind'];
  }

  render(): string {
    if (this.mode === 'picker') {
      const cut = (p: string) => (this.init.truncate && p.length > this.init.truncate ? `${p.slice(0, this.init.truncate)}…` : p);
      const all = [...this.prompts.map((p, i) => [`${this.cursor === i ? '❯' : ' '} ${cut(p)}`, `    ${this.details[i]}`]), [`${this.cursor === this.prompts.length ? '❯' : ' '} (current)`]];
      const win = this.init.window ?? all.length;
      if (this.cursor < this.top) this.top = this.cursor;
      if (this.cursor >= this.top + win) this.top = this.cursor - win + 1;
      const shown = all.slice(this.top, this.top + win);
      const below = all.length - (this.top + win);
      const head = this.init.narrow
        ? ['   Rewind', '   Restore the code and/or conversation to the point', '   before…']
        : ['   Rewind', '   Restore the code and/or conversation to the point before…'];
      return [...head, ...(this.top > 0 && this.indicators ? [`  ↑ ${this.top} more`] : []), ...shown.flat(), ...(below > 0 && this.indicators ? [`  ↓ ${below} more`] : []), '   Enter to continue · Esc to cancel'].join('\n');
    }
    if (this.mode === 'confirm') {
      const code = this.hasCode ? 'The code will be restored +1 -1 in notes.txt.' : 'The code will be unchanged.';
      return [
        ...(this.init.narrow
          ? ['   Confirm you want to restore to the point before', '   you sent this message:']
          : ['   Confirm you want to restore to the point before you sent this message:']),
        '   This message and everything after it will be removed.',
        ...(this.init.narrow && !this.hasCode ? ['   The code will be', '   unchanged.'] : [`   ${code}`]),
        ...this.rows.map((r, i) => `${this.confirmCursor === i ? '❯' : ' '} ${i + 1}. ${r}`),
      ].join('\n');
    }
    const lines = ['● Done.', ...this.queued.map((q) => `❯ ${q}`)];
    if (this.queued.length > 0) lines.push('  ctrl+enter to send now');
    if (this.working) lines.push('✢ Combobulating… (9s · ↓ 127 tokens)');
    const empty = this.composer.every((l) => l === '');
    const first = this.queued.length > 0 && empty ? 'Press up to edit queued messages' : empty && this.ghost ? this.ghost : this.composer[0];
    const body = [`❯ ${first}`, ...this.composer.slice(1).map((l) => `  ${l}`)];
    return [...lines, RULE, ...body, RULE, `  ⏵⏵ bypass permissions on (shift+tab to cycle)${this.working ? ' · esc to interrupt' : ''}`].join('\n');
  }

  protected press(key: string): void {
    const previous = this.lastKey;
    this.lastKey = key;
    if (this.mode === 'idle') {
      if (key === 'ctrl+u') {
        if (!this.init.stickyGhost) this.ghost = undefined;
        this.composer = this.composer.length > 1 ? this.composer.slice(0, -1) : [''];
      } else if (key === 'esc' && previous === 'esc' && !this.working && this.composer.every((l) => l === '')) {
        this.mode = 'picker';
        this.cursor = this.init.openOnLast ? this.prompts.length - 1 : this.prompts.length;
      } else if (key === 'up' && this.queued.length > 0) {
        this.composer = [...this.queued];
        this.queued = [];
      }
      return;
    }
    if (this.stuck) return;
    if (this.mode === 'picker') {
      if (key === 'up' || key === 'down') this.moved = true;
      if (key === 'up') this.cursor = Math.max(0, this.cursor - 1);
      else if (key === 'down') this.cursor = Math.min(this.prompts.length, this.cursor + 1);
      else if (key === 'esc') this.mode = 'idle';
      else if (key === 'enter' && this.cursor < this.prompts.length) {
        this.mode = 'confirm';
        this.confirmCursor = 0;
      }
      return;
    }
    if (key === 'up') this.confirmCursor = Math.max(0, this.confirmCursor - 1);
    else if (key === 'down') this.confirmCursor = Math.min(this.rows.length - 1, this.confirmCursor + 1);
    else if (key === 'esc') this.mode = 'picker';
    else if (/^\d$/.test(key)) this.restored = `digit ${key}`;
    else if (key === 'enter') {
      this.restored = this.rows[this.confirmCursor];
      if (/^Restore/.test(this.restored)) {
        this.composer = [this.prompts[this.cursor]];
        this.prompts = this.prompts.slice(0, this.cursor);
        this.details = this.details.slice(0, this.cursor);
      }
      this.mode = 'idle';
    }
  }

  protected override onSend(text: string): void {
    if (this.working) this.queued.push(text);
  }
}

export interface FakeCodexInit {
  /** Normal prompts, oldest first; a `steer: true` one fails to edit. */
  prompts: { text: string; steer?: boolean }[];
  working?: boolean;
  ghost?: string;
}

/** Codex 0.166: `›` composer, double Esc into the transcript browser, Left walks prompts. */
export class FakeCodex extends Fake {
  composer = '';
  working: boolean;
  ghost: string | undefined;
  mode: 'idle' | 'hint' | 'browse' = 'idle';
  cursor: number;
  banner = '';
  rewoundTo: string | null = null;
  /** After Enter the prompt that lands in the composer is this one instead (a wrong pick). */
  landsOn: string | null = null;
  /** The 52-column phone layout: shorter footer, wrapped notices. */
  narrow = false;

  constructor(private readonly init: FakeCodexInit) {
    super();
    this.working = init.working ?? false;
    this.ghost = init.ghost;
    this.cursor = init.prompts.length - 1;
  }

  render(): string {
    if (this.mode === 'browse')
      return ['(transcript)', this.narrow ? 'Browsing · ↑↓/jk ←→/hl · ↵ rewind · esc' : 'Browsing transcript · ↑↓/jk scroll · ←→/hl prompts · ^t details · ↵ rewind · esc back'].join('\n');
    const head = this.working ? '• Working (8s • esc to interrupt)' : '• Done.';
    const text = this.composer !== '' ? this.composer : (this.ghost ?? 'Ask Codex to do anything');
    const hint = this.narrow ? '  esc again to edit\n  previous message' : '  esc again to edit previous message';
    const foot = this.composer !== '' ? '  tab to queue message' : this.mode === 'hint' ? hint : '  ← for agents · ? for shortcuts';
    return [head, this.banner, `› ${text}`, foot].filter((l) => l !== '').join('\n');
  }

  protected press(key: string): void {
    if (this.mode === 'browse') {
      if (key === 'left') this.cursor = Math.max(0, this.cursor - 1);
      else if (key === 'esc') this.mode = 'idle';
      else if (key === 'enter') {
        const p = this.init.prompts[this.cursor];
        this.mode = 'idle';
        this.composer = this.landsOn ?? p.text;
        if (p.steer) this.banner = '■ Failed to edit the selected prompt: the selected prompt is a steer and cannot be edited independently';
        else {
          this.banner = this.narrow ? '• Conversation reverted to\n  this point. File changes are\n  unchanged.' : '• Conversation reverted to this point. File changes are unchanged.';
          this.rewoundTo = p.text;
        }
      }
      return;
    }
    if (key === 'ctrl+u') {
      this.composer = '';
      this.ghost = undefined;
      this.banner = '';
    } else if (key === 'esc' && this.composer === '' && !this.working) {
      if (this.mode === 'hint') this.mode = 'browse';
      else this.mode = 'hint';
    }
  }
}

/** opencode 2.2.5: slash commands typed as keys, `N message(s) reverted` in the transcript. */
export class FakeOpencode extends Fake {
  composer = '';
  working: boolean;
  reverted = 0;
  /** Messages that can still be undone. */
  left: number;
  constructor(init: { messages: number; working?: boolean }) {
    super();
    this.left = init.messages;
    this.working = init.working ?? false;
  }

  render(): string {
    const notice = this.reverted > 0 ? `${this.reverted} message${this.reverted === 1 ? '' : 's'} reverted\nctrl+x r or /redo to restore` : '';
    return [notice, this.composer, 'Build · Gemini 3.8 Flash Google · high', this.working ? '⬝⬝⬝⬝⬝⬝⬝⬝ esc interrupt' : ''].filter((l) => l !== '').join('\n');
  }

  protected press(key: string): void {
    if (key === 'ctrl+u') this.composer = '';
    else if (key === 'enter') {
      if (this.composer === '/undo' && this.left > 0) {
        this.reverted++;
        this.left--;
        this.composer = 'restored prompt';
      } else this.composer = '';
    } else if (key.length === 1) this.composer += key;
  }
}
