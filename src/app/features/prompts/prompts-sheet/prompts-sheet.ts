import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEllipsis, lucidePencil, lucidePlus, lucideSearch, lucideTrash2, lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { RowGesture } from '../../../core/list/row-gesture';
import {
  MAX_TEXT,
  MAX_TITLE,
  Prompts,
  promptProblem,
  type PromptList,
  type SavedPrompt,
} from '../../../core/prompts/prompts';

type View =
  | { kind: 'list' }
  | { kind: 'actions'; entry: SavedPrompt }
  | { kind: 'confirm'; entry: SavedPrompt }
  | { kind: 'form'; list: PromptList; entry: SavedPrompt | null };

const firstLine = (text: string) => text.split('\n').find((l) => l.trim() !== '') ?? '';

/**
 * The saved prompts sheet: search, command chips and the prompt list; a long press or the `…` on an
 * entry opens Edit / Delete; the same sheet holds the new / edit form. In `insert` mode (the compose
 * bar) a tap hands the entry over and closes; in `manage` mode (Settings) a tap opens its menu.
 */
@Component({
  selector: 'app-prompts-sheet',
  imports: [NgIcon, ...HlmButtonImports, ...HlmInputImports, ...HlmLabelImports, ...HlmSheetImports, ...HlmSwitchImports, ...HlmTextareaImports],
  viewProviders: [provideIcons({ lucideEllipsis, lucidePencil, lucidePlus, lucideSearch, lucideTrash2, lucideX })],
  styleUrl: './prompts-sheet.css',
  templateUrl: './prompts-sheet.html',
})
export class PromptsSheet {
  private readonly store = inject(Prompts);

  readonly open = model(false);
  readonly mode = input<'insert' | 'manage'>('insert');
  /** An entry was tapped in `insert` mode; the sheet closes itself. */
  readonly picked = output<SavedPrompt>();

  protected readonly maxTitle = MAX_TITLE;
  protected readonly maxText = MAX_TEXT;
  protected readonly state = computed(() => (this.open() ? 'open' : 'closed'));
  protected readonly view = signal<View>({ kind: 'list' });
  protected readonly query = signal('');
  protected readonly commands = this.store.commands;
  protected readonly prompts = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.store.prompts();
    return q === '' ? all : all.filter((p) => p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q));
  });

  protected readonly title = signal('');
  protected readonly body = signal('');
  protected readonly sendNow = signal(false);
  protected readonly canSave = computed(() => promptProblem({ title: this.title(), text: this.body(), sendNow: this.sendNow() }) === null);

  /** The entry a finger is resting on, and whether its release click must be swallowed. */
  private pressed: SavedPrompt | null = null;
  private swallow = false;
  private readonly gesture = new RowGesture({
    drag: () => undefined,
    release: () => undefined,
    longPress: () => {
      if (this.pressed) this.view.set({ kind: 'actions', entry: this.pressed });
    },
  });

  constructor() {
    effect(() => {
      if (this.open()) return;
      this.view.set({ kind: 'list' });
      this.query.set('');
    });
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected down(entry: SavedPrompt, event: PointerEvent): void {
    this.pressed = entry;
    this.swallow = false;
    this.gesture.down(event.clientX, event.clientY, false);
  }

  protected move(event: PointerEvent): void {
    this.gesture.move(event.clientX, event.clientY);
  }

  protected up(): void {
    if (this.gesture.up().longPressed) this.swallow = true;
  }

  protected cancel(): void {
    this.gesture.cancel();
  }

  protected tap(entry: SavedPrompt): void {
    if (this.swallow) {
      this.swallow = false;
      return;
    }
    if (this.mode() === 'manage') return this.actions(entry);
    this.picked.emit(entry);
    this.open.set(false);
  }

  protected actions(entry: SavedPrompt, event?: Event): void {
    event?.preventDefault();
    this.view.set({ kind: 'actions', entry });
  }

  protected preview(entry: SavedPrompt): string {
    return firstLine(entry.text);
  }

  protected showList(): void {
    this.view.set({ kind: 'list' });
  }

  protected newPrompt(): void {
    this.fill(null);
    this.view.set({ kind: 'form', list: 'prompts', entry: null });
  }

  protected edit(entry: SavedPrompt): void {
    this.fill(entry);
    this.view.set({ kind: 'form', list: this.store.commands().some((c) => c.id === entry.id) ? 'commands' : 'prompts', entry });
  }

  protected isCommand(entry: SavedPrompt | null): boolean {
    return entry !== null && this.store.commands().some((c) => c.id === entry.id);
  }

  protected confirmDelete(entry: SavedPrompt): void {
    this.view.set({ kind: 'confirm', entry });
  }

  protected remove(entry: SavedPrompt): void {
    this.store.remove(entry.id);
    this.showList();
  }

  protected setText(target: 'title' | 'body', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    (target === 'title' ? this.title : this.body).set(value);
  }

  protected save(event: Event): void {
    event.preventDefault();
    const v = this.view();
    if (v.kind !== 'form' || !this.canSave()) return;
    const draft = { title: this.title(), text: this.body(), sendNow: this.sendNow() };
    if (v.entry) this.store.update(v.entry.id, draft);
    else this.store.add(v.list, draft);
    this.showList();
  }

  private fill(entry: SavedPrompt | null): void {
    this.title.set(entry?.title ?? '');
    this.body.set(entry?.text ?? '');
    this.sendNow.set(entry?.sendNow ?? false);
  }
}
