import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';
import { clearDraft, loadDraft, saveDraft } from '../../../core/input/draft';
import { loadHistory, pushHistory, suggestions } from '../../../core/input/history';
import { ImageError, prepareImage } from '../../../core/input/image-prepare';
import { UploadError, Uploads, type UploadFailure } from '../../../core/input/uploads';
import { Settings } from '../../../core/settings/settings';

const DRAFT_DELAY_MS = 300;

const UPLOAD_MESSAGES: Record<UploadFailure | 'too-big' | 'not-image', string> = {
  'too-big': 'Image is too big (15 MB max).',
  'not-image': 'That file is not a supported image.',
  session: 'Session expired. Log in again.',
  unreachable: 'Cannot reach the bridge.',
  failed: 'Upload failed.',
};

interface Attachment {
  id: number;
  path: string;
  thumb: string;
}

/**
 * The message field under the terminal: a normal textarea, so iOS autocorrect, predictions and
 * dictation work. The parent turns what it emits into terminal input.
 */
@Component({
  selector: 'app-compose-bar',
  host: {
    '(document:visibilitychange)': 'onVisibility()',
    '(window:pagehide)': 'flushDraft()',
  },
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
  private readonly settings = inject(Settings);
  private readonly uploads = inject(Uploads);
  protected readonly returnKey = this.settings.returnKey;
  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly uploading = signal(0);
  private nextId = 0;
  private draftTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly text = signal('');
  private readonly history = signal<string[]>([]);
  protected readonly chips = computed(() => suggestions(this.history(), this.text()));
  protected readonly canSend = computed(
    () => !this.disabled() && this.uploading() === 0 && this.text().trim() !== '',
  );

  /** Position in the history while walking it with the arrows; -1 is the user's own text. */
  private cursor = -1;
  private draft = '';

  constructor() {
    effect(() => this.history.set(loadHistory(this.address())));
    afterNextRender(() => {
      const saved = loadDraft(this.address());
      if (saved === '') return;
      this.set(saved, false);
      const el = this.field().nativeElement;
      el.setSelectionRange(saved.length, saved.length);
    });
    inject(DestroyRef).onDestroy(() => {
      this.flushDraft();
      for (const a of this.attachments()) URL.revokeObjectURL(a.thumb);
    });
  }

  protected onVisibility(): void {
    if (document.visibilityState === 'hidden') this.flushDraft();
  }

  /** Writes the draft now, cancelling the pending debounced write. */
  protected flushDraft(): void {
    clearTimeout(this.draftTimer);
    this.draftTimer = undefined;
    saveDraft(this.address(), this.text());
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
    if (event.key === 'Enter' && this.enterSends(event)) {
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

  private enterSends(event: KeyboardEvent): boolean {
    return this.returnKey() === 'send'
      ? !event.shiftKey
      : event.metaKey || event.ctrlKey;
  }

  protected onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (files.length === 0) return;
    event.preventDefault();
    void this.attach(files);
  }

  protected onPicked(event: Event): void {
    const picker = event.target as HTMLInputElement;
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    if (files.length > 0) void this.attach(files);
  }

  /** Removes the image's path from the text and drops its thumbnail. */
  protected removeAttachment(item: Attachment): void {
    this.attachments.update((list) => list.filter((a) => a.id !== item.id));
    URL.revokeObjectURL(item.thumb);
    const text = this.text();
    const at = text.indexOf(item.path);
    if (at === -1) return;
    const after = text[at + item.path.length] === ' ' ? 1 : 0;
    const before = after === 0 && at > 0 && text[at - 1] === ' ' ? 1 : 0;
    this.set(text.slice(0, at - before) + text.slice(at + item.path.length + after));
  }

  private async attach(files: File[]): Promise<void> {
    this.uploading.update((n) => n + files.length);
    const results = await Promise.all(files.map((file) => this.uploadOne(file)));
    this.uploading.update((n) => n - files.length);
    const done = results.filter((r): r is Attachment => r !== null);
    if (done.length === 0) return;
    this.attachments.update((list) => [...list, ...done]);
    this.insertAtCaret(done.map((a) => a.path).join(' '));
  }

  private async uploadOne(file: File): Promise<Attachment | null> {
    try {
      const image = await prepareImage(file);
      const path = await this.uploads.upload(image);
      return { id: this.nextId++, path, thumb: URL.createObjectURL(image) };
    } catch (error) {
      const reason =
        error instanceof UploadError || error instanceof ImageError ? error.reason : 'failed';
      toast.error(UPLOAD_MESSAGES[reason]);
      return null;
    }
  }

  private insertAtCaret(insert: string): void {
    const el = this.field().nativeElement;
    const value = el.value;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const lead = before !== '' && !/\s$/.test(before) ? ' ' : '';
    const trail = after === '' || !/^\s/.test(after) ? ' ' : '';
    const text = before + lead + insert + trail + after;
    this.cursor = -1;
    this.set(text);
    const caret = (before + lead + insert + trail).length;
    el.setSelectionRange(caret, caret);
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
    clearTimeout(this.draftTimer);
    clearDraft(this.address());
    this.releaseAttachments();
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

  private releaseAttachments(): void {
    for (const a of this.attachments()) URL.revokeObjectURL(a.thumb);
    this.attachments.set([]);
  }

  private set(value: string, persist = true): void {
    const el = this.field().nativeElement;
    el.value = value;
    this.text.set(value);
    if (persist) {
      clearTimeout(this.draftTimer);
      this.draftTimer = setTimeout(() => this.flushDraft(), DRAFT_DELAY_MS);
    }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }
}
