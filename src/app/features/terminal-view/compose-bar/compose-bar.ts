import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { loadHistory, pushHistory, suggestions } from '../../../core/input/history';

/**
 * The message field under the terminal: a normal textarea, so iOS autocorrect, predictions and
 * dictation work. The parent turns what it emits into terminal input.
 */
@Component({
  selector: 'app-compose-bar',
  styleUrl: './compose-bar.css',
  templateUrl: './compose-bar.html',
})
export class ComposeBar {
  /** Terminal address; history is kept per terminal. */
  readonly address = input.required<string>();
  readonly disabled = input(false);
  /** The key bar's one-shot Ctrl: while on, the next typed character goes out as Ctrl+char. */
  readonly ctrl = input(false);
  /** A message to send; the field has already cleared itself. */
  readonly send = output<string>();
  /** The character typed while Ctrl was on (it never reaches the field). */
  readonly ctrlChar = output<string>();

  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');

  protected readonly text = signal('');
  private readonly history = signal<string[]>([]);
  protected readonly chips = computed(() => suggestions(this.history(), this.text()));
  protected readonly canSend = computed(() => !this.disabled() && this.text().trim() !== '');

  /** Position in the history while walking it with the arrows; -1 is the user's own text. */
  private cursor = -1;
  private draft = '';

  constructor() {
    effect(() => this.history.set(loadHistory(this.address())));
  }

  focus(): void {
    this.field().nativeElement.focus();
  }

  /** Keeps focus (and the keyboard) on the field while a button is tapped. */
  protected keepFocus(event: Event): void {
    event.preventDefault();
  }

  protected onInput(): void {
    this.cursor = -1;
    this.set(this.field().nativeElement.value);
  }

  protected onBeforeInput(event: InputEvent): void {
    if (!this.ctrl() || !event.data || !event.inputType.startsWith('insert')) return;
    event.preventDefault();
    this.ctrlChar.emit(event.data);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    } else if (event.key === 'ArrowUp' && this.onEdge('first')) {
      event.preventDefault();
      this.walk(1);
    } else if (event.key === 'ArrowDown' && this.cursor >= 0 && this.onEdge('last')) {
      event.preventDefault();
      this.walk(-1);
    }
  }

  protected use(entry: string): void {
    this.cursor = -1;
    this.set(entry);
    this.focus();
  }

  protected submit(): void {
    if (!this.canSend()) return;
    const message = this.text();
    this.history.set(pushHistory(this.address(), message));
    this.cursor = -1;
    this.set('');
    this.send.emit(message);
  }

  /** Caret collapsed on the first or last line, so Up/Down mean "history" and not "move the caret". */
  private onEdge(edge: 'first' | 'last'): boolean {
    const el = this.field().nativeElement;
    if (el.selectionStart !== el.selectionEnd) return false;
    return edge === 'first'
      ? !el.value.slice(0, el.selectionStart).includes('\n')
      : !el.value.slice(el.selectionEnd).includes('\n');
  }

  private walk(step: 1 | -1): void {
    const list = this.history();
    const next = this.cursor + step;
    if (next >= list.length) return;
    if (this.cursor === -1) this.draft = this.text();
    this.cursor = next;
    this.set(next === -1 ? this.draft : list[next]);
  }

  private set(value: string): void {
    const el = this.field().nativeElement;
    el.value = value;
    this.text.set(value);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }
}
