import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideColumns2, lucidePencil, lucideRows2, lucideSquareTerminal, lucideX } from '@ng-icons/lucide';
import { ViewModes } from '../../../core/chat/view-mode';
import { LayoutActions } from '../../../core/layout/layout-actions';
import type { Conversation } from '../../../core/list/conversations';
import { ConversationRow } from '../conversation-row/conversation-row';

const ITEM = 44;
const GAP = 8;

/**
 * The long-press menu of a row: the rest of the screen dimmed, the row lifted above it and the
 * actions beside it (under it, or over it when the screen ends first). A modal dialog: focus starts
 * on the first action, Tab stays inside, Escape or a tap on the scrim closes, and focus returns to
 * where it was. The sheets and the confirmation live in `app-layout-host`; this only opens them.
 */
@Component({
  selector: 'app-row-menu',
  imports: [ConversationRow, NgIcon],
  viewProviders: [provideIcons({ lucideColumns2, lucidePencil, lucideRows2, lucideSquareTerminal, lucideX })],
  host: { '(document:keydown.escape)': 'dismissed.emit()' },
  templateUrl: './row-menu.html',
  styleUrl: './row-menu.css',
})
export class RowMenu {
  private readonly actions = inject(LayoutActions);
  private readonly router = inject(Router);
  private readonly viewModes = inject(ViewModes);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly conversation = input.required<Conversation>();
  readonly now = input.required<number>();
  /** The row's box on screen, where the lifted copy goes. */
  readonly rect = input.required<DOMRect>();
  readonly dismissed = output<void>();

  protected readonly agent = computed(() => this.conversation().kind === 'chat');
  protected readonly menuTop = computed(() => {
    const rect = this.rect();
    const height = (this.agent() ? 5 : 4) * ITEM + GAP;
    const below = rect.bottom + GAP;
    return below + height <= window.innerHeight ? below : Math.max(GAP, rect.top - GAP - height);
  });

  constructor() {
    const before = document.activeElement as HTMLElement | null;
    afterNextRender(() => this.buttons()[0]?.focus());
    inject(DestroyRef).onDestroy(() => before?.focus?.());
  }

  /** The scrim saw a press start: a long press ends with a click on whatever is under the finger. */
  protected armed = false;

  /** A real tap (or the keyboard, `detail` 0) dismisses; the release click of the long press that opened this does not. */
  protected scrimClick(event: MouseEvent): void {
    if (this.armed || event.detail === 0) this.dismissed.emit();
    this.armed = false;
  }

  private buttons(): HTMLButtonElement[] {
    return Array.from(this.element.nativeElement.querySelectorAll<HTMLButtonElement>('[role="group"] button'));
  }

  /** Tab wraps inside the dialog. */
  protected trap(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const buttons = this.buttons();
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  protected openTerminal(): void {
    const address = this.conversation().address;
    this.viewModes.set(address, 'terminal');
    void this.router.navigate(['/t', address]);
    this.dismissed.emit();
  }

  protected split(direction: 'right' | 'down'): void {
    this.actions.askSplit(this.conversation().address, direction);
    this.dismissed.emit();
  }

  protected rename(): void {
    this.actions.askRename(this.conversation().address);
    this.dismissed.emit();
  }

  protected close(): void {
    this.actions.askClose(this.conversation().address);
    this.dismissed.emit();
  }
}
