import type { AgentQuestion } from '../../chat/types';
import type { TerminalPort } from '../driver';
import type { DriverAgent } from '../profiles';

/**
 * A stand-in for an agent's question screen, drawn the way R2's captures and sources say each
 * agent draws it (Claude Code's two live captures, Codex/opencode/pi from their source). It
 * reacts to named keys like the real one and records the answers it was given.
 */
interface Style {
  marker: string;
  numbered: boolean;
  hint: string;
  digits: boolean;
  wrap: boolean;
  otherLabel: string;
  otherKey: 'enter' | 'tab';
  multiConfirm: 'submit-row' | 'tab' | 'enter';
  review: boolean;
  header: boolean;
  textOnlyFocused: boolean;
}

const STYLES: Record<DriverAgent, Style> = {
  claude: {
    marker: '❯',
    numbered: true,
    hint: 'Enter to select · Tab/Arrow keys to navigate · Esc to cancel',
    digits: false,
    wrap: false,
    otherLabel: 'Type something.',
    otherKey: 'enter',
    multiConfirm: 'submit-row',
    review: true,
    header: true,
    textOnlyFocused: false,
  },
  codex: {
    marker: '›',
    numbered: true,
    hint: 'tab to add notes | enter to submit answer | ←/→ to navigate questions | esc to interrupt',
    digits: true,
    wrap: true,
    otherLabel: 'None of the above',
    otherKey: 'tab',
    multiConfirm: 'enter',
    review: false,
    header: false,
    textOnlyFocused: true,
  },
  opencode: {
    marker: '❯',
    numbered: true,
    hint: '⇆ tab  ↑↓ select  enter submit  esc dismiss',
    digits: true,
    wrap: true,
    otherLabel: 'Type your own answer',
    otherKey: 'enter',
    multiConfirm: 'tab',
    review: true,
    header: true,
    textOnlyFocused: true,
  },
  pi: {
    marker: '▸',
    numbered: false,
    hint: '↑↓ move · space toggle · enter select · tab switch · esc cancel',
    digits: false,
    wrap: false,
    otherLabel: 'Type something.',
    otherKey: 'enter',
    multiConfirm: 'enter',
    review: false,
    header: true,
    textOnlyFocused: false,
  },
};

interface FakeRow {
  label: string;
  kind: 'option' | 'other' | 'submit';
  index: number;
}

export interface Recorded {
  picks: number[];
  text?: string;
}

export class FakeTui implements TerminalPort {
  readonly sent: string[][] = [];
  readonly typed: string[] = [];
  readonly recorded: Recorded[] = [];
  done = false;
  /** Set to replace the screen with something unrelated. */
  override: string | null = null;
  /** Reads between a key and its effect on screen. */
  lag = 0;
  private qi = 0;
  private cursor = 0;
  private editing = false;
  private reviewing = false;
  private reviewCursor = 0;
  private checked: boolean[][];
  private pending: (() => void) | null = null;
  private pendingReads = 0;
  private readonly style: Style;
  private readonly singleReview: boolean;

  constructor(
    private readonly agent: DriverAgent,
    private readonly questions: AgentQuestion[],
    /** Claude Code with one question goes straight through; with several it ends on a Submit step. */
    options: { singleReview?: boolean } = {},
  ) {
    this.style = { ...STYLES[agent] };
    this.singleReview = options.singleReview ?? (agent === 'opencode' && !!questions[0].multiSelect);
    this.checked = questions.map((q) => q.options.map(() => false));
    this.editing = this.style.textOnlyFocused && questions[0].options.length === 0;
  }

  private rowsOf(q: AgentQuestion): FakeRow[] {
    const rows: FakeRow[] = q.options.map((o, index) => ({ label: o.label, kind: 'option', index }));
    if (q.options.length > 0 && q.other) rows.push({ label: this.style.otherLabel, kind: 'other', index: q.options.length });
    if (q.multiSelect && this.style.multiConfirm === 'submit-row') rows.push({ label: 'Submit', kind: 'submit', index: rows.length });
    return rows;
  }

  async read(): Promise<string> {
    if (this.pending && this.pendingReads++ >= this.lag) {
      this.pending();
      this.pending = null;
    }
    return this.render();
  }

  async keys(keys: string[]): Promise<void> {
    this.sent.push(keys);
    for (const key of keys) this.press(key);
  }

  async send(text: string): Promise<void> {
    this.typed.push(text);
    if (!this.editing) return;
    this.editing = false;
    this.commit({ picks: this.currentPicks(), text });
  }

  render(): string {
    if (this.override !== null) return this.override;
    if (this.done) return '$ ';
    const s = this.style;
    if (this.reviewing) {
      const head = this.agent === 'opencode' ? 'Review' : 'Review your answers';
      const items = this.agent === 'opencode' ? [] : ['Submit answers', 'Cancel'];
      return [
        head,
        '',
        ...items.map((t, i) => `${this.reviewCursor === i ? s.marker : ' '} ${i + 1}. ${t}`),
        '',
        s.hint,
      ].join('\n');
    }
    const q = this.questions[this.qi];
    const lines: string[] = [];
    if (this.agent === 'claude' && this.questions.length > 1) {
      lines.push('←  ' + this.questions.map((x, i) => `${i < this.qi ? '☒' : '☐'} ${x.header ?? 'Q'}`).join('  ') + '  ✔ Submit  →', '');
    }
    if (this.agent === 'opencode') lines.push(`Field ${this.qi + 1} of ${this.questions.length}`, '');
    if (this.agent === 'pi' && this.questions.length > 1) lines.push(`[${this.qi + 1}/${this.questions.length}] ▸ ${q.header ?? 'Q'}`, '');
    lines.push(q.question, '');
    if (q.options.length > 0) {
      this.rowsOf(q).forEach((row, i) => {
        const here = this.cursor === i && !this.editing;
        const num = s.numbered && row.kind !== 'submit' ? `${i + 1}. ` : '';
        const box =
          q.multiSelect && row.kind !== 'submit'
            ? row.kind === 'other'
              ? '[ ] '
              : `[${this.checked[this.qi][row.index] ? '✔' : ' '}] `
            : '';
        if (row.kind === 'submit') lines.push(`${here ? s.marker : ' '}    ${row.label}`);
        else lines.push(`${here ? s.marker : ' '} ${num}${box}${row.label}`);
        if (row.kind === 'option') lines.push(`     ${q.options[row.index].description ?? ''}`);
      });
    }
    if (this.editing) lines.push('', `> ${'█'}`);
    lines.push('', s.hint);
    return lines.join('\n');
  }

  private currentPicks(): number[] {
    const q = this.questions[this.qi];
    return q.multiSelect ? this.checked[this.qi].flatMap((c, i) => (c ? [i] : [])) : [];
  }

  private later(effect: () => void): void {
    if (this.lag === 0) effect();
    else {
      this.pending = effect;
      this.pendingReads = 0;
    }
  }

  private commit(answer: Recorded): void {
    this.later(() => {
      this.recorded.push(answer);
      this.cursor = 0;
      this.editing = false;
      this.qi++;
      if (this.qi >= this.questions.length) {
        if (this.style.review && (this.questions.length > 1 || this.singleReview)) {
          this.qi = this.questions.length - 1;
          this.reviewing = true;
          this.reviewCursor = 0;
        } else this.done = true;
      } else {
        const next = this.questions[this.qi];
        this.editing = this.style.textOnlyFocused && next.options.length === 0;
      }
    });
  }

  private press(key: string): void {
    const s = this.style;
    if (this.reviewing) {
      if (key === 'down' || key === 'up') this.reviewCursor = Math.min(1, Math.max(0, this.reviewCursor + (key === 'down' ? 1 : -1)));
      else if (key === 'enter' && (this.agent === 'opencode' || this.reviewCursor === 0)) this.later(() => (this.done = true));
      return;
    }
    const q = this.questions[this.qi];
    if (this.editing) return;
    const rows = this.rowsOf(q);
    if (key === 'down' || key === 'up') {
      const step = key === 'down' ? 1 : -1;
      const next = this.cursor + step;
      this.cursor = s.wrap ? (next + rows.length) % rows.length : Math.min(rows.length - 1, Math.max(0, next));
    } else if (/^[1-9]$/.test(key) && s.digits) {
      const i = Number(key) - 1;
      if (i >= rows.length) return;
      if (rows[i].kind === 'other') return;
      if (q.multiSelect) this.toggle(i);
      else this.commit({ picks: [i] });
    } else if (key === 'space' && q.multiSelect && rows[this.cursor].kind === 'option') {
      this.toggle(this.cursor);
    } else if (key === 'enter') {
      const row = rows[this.cursor];
      if (row.kind === 'other') this.later(() => (this.editing = s.otherKey === 'enter'));
      else if (row.kind === 'submit') this.commit({ picks: this.currentPicks() });
      else if (!q.multiSelect) this.commit({ picks: [row.index] });
      else if (s.multiConfirm === 'enter' && this.currentPicks().length > 0) this.commit({ picks: this.currentPicks() });
    } else if (key === 'tab') {
      const row = rows[this.cursor];
      if (row.kind === 'other' && s.otherKey === 'tab') this.later(() => (this.editing = true));
      else if (q.multiSelect && s.multiConfirm === 'tab' && this.currentPicks().length > 0) this.commit({ picks: this.currentPicks() });
    }
  }

  private toggle(i: number): void {
    this.later(() => (this.checked[this.qi][i] = !this.checked[this.qi][i]));
  }
}
