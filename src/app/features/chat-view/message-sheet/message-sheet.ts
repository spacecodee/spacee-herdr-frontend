import { Component, computed, effect, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucidePencil, lucideRotateCcw, lucideTerminal, lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import type { RewindAgent } from '../../../core/answers/rewind';

export type SheetTarget =
  | { kind: 'queued'; id: string; text: string }
  | { kind: 'sent'; id: string; text: string; removed: number };

export type SheetAction =
  | { type: 'edit-queued' }
  | { type: 'cancel-queued' }
  | { type: 'edit-sent' }
  /** The confirm step opened: look at what the agent would restore. */
  | { type: 'peek' }
  | { type: 'rewind'; files: boolean }
  | { type: 'copy' }
  | { type: 'terminal' };

const FILES_NOTE: Record<RewindAgent, string> = {
  claude: 'Undoes the agent’s file changes made after this message',
  codex: 'Files are not changed',
  opencode: 'Files changed after this message are restored too',
};

/**
 * What a tap or long press on a message offers: Edit / Cancel on a queued one; Edit and resend, Rewind to
 * here and Copy on a sent one, with the rewind confirmation. It only asks; the chat view presses the keys.
 */
@Component({
  selector: 'app-message-sheet',
  imports: [NgIcon, ...HlmButtonImports, ...HlmSheetImports, ...HlmSwitchImports],
  viewProviders: [provideIcons({ lucideCopy, lucidePencil, lucideRotateCcw, lucideTerminal, lucideX })],
  styleUrl: './message-sheet.css',
  templateUrl: './message-sheet.html',
})
export class MessageSheet {
  /** The message the sheet is about; null keeps it closed. */
  readonly target = input<SheetTarget | null>(null);
  readonly agent = input<RewindAgent | null>(null);
  /** The agent is free (idle): rewinding needs it. */
  readonly free = input(true);
  /** A keypress sequence is running. */
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  /** Claude only: whether the picked prompt has file changes after it (null until looked at). */
  readonly codeChanges = input<boolean | null>(null);
  readonly action = output<SheetAction>();
  readonly closed = output<void>();

  protected readonly step = signal<'menu' | 'confirm'>('menu');
  protected readonly files = signal(false);
  protected readonly state = computed(() => (this.target() ? 'open' : 'closed'));
  protected readonly sent = computed(() => {
    const t = this.target();
    return t?.kind === 'sent' ? t : null;
  });
  protected readonly filesNote = computed(() => {
    const agent = this.agent();
    return agent && (agent !== 'claude' || this.codeChanges() === true) ? FILES_NOTE[agent] : null;
  });
  protected readonly canRestoreFiles = computed(() => this.agent() === 'claude' && this.codeChanges() === true);

  constructor() {
    effect(() => {
      if (this.target()) return;
      this.step.set('menu');
      this.files.set(false);
    });
  }

  protected removedText(count: number): string {
    return count === 0
      ? 'Nothing comes after this message'
      : `${count} later ${count === 1 ? 'message' : 'messages'} will be removed from the conversation`;
  }

  protected askRewind(): void {
    this.step.set('confirm');
    this.action.emit({ type: 'peek' });
  }
}
