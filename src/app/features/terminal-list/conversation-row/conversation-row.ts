import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, ElementRef, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePencil, lucideX } from '@ng-icons/lucide';
import { AGENT_LABEL, relativeTime, type Conversation } from '../../../core/list/conversations';
import { RowGesture, SWIPE_TRAVEL } from '../../../core/list/row-gesture';
import { RowSwipe } from '../../../core/list/row-swipe';
import { AgentAvatar } from '../agent-avatar/agent-avatar';

const ACTIONS_WIDTH = 160;

/**
 * One conversation, two lines: tab or terminal name with the time, then "Working…", the wait for an
 * answer or the last message. Swipe left reveals Rename and Close; a long press (or right click, or
 * the "Actions" button that keyboards and screen readers reach) asks the list for the full menu.
 * `static` draws a copy with none of that, for the menu overlay.
 */
@Component({
  selector: 'app-conversation-row',
  imports: [AgentAvatar, NgIcon, NgTemplateOutlet, RouterLink],
  viewProviders: [provideIcons({ lucidePencil, lucideX })],
  host: { class: 'block' },
  templateUrl: './conversation-row.html',
  styleUrl: './conversation-row.css',
})
export class ConversationRow {
  private readonly swipe = inject(RowSwipe);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly conversation = input.required<Conversation>();
  /** Epoch milliseconds the relative time is measured against. */
  readonly now = input.required<number>();
  readonly static = input(false);

  readonly rename = output<void>();
  readonly close = output<void>();
  /** The full menu was asked for; carries the row's box so the list can place it. */
  readonly menu = output<DOMRect>();

  private readonly dragOffset = signal<number | null>(null);
  private swallowClick = false;
  private readonly gesture = new RowGesture({
    drag: (offset) => this.dragOffset.set(offset),
    release: (open) => {
      this.dragOffset.set(null);
      this.swipe.set(open ? this.conversation().address : null);
    },
    longPress: () => {
      this.swallowClick = true;
      this.openMenu();
    },
  });

  protected readonly isOpen = computed(() => this.swipe.open() === this.conversation().address);
  protected readonly dragging = computed(() => this.dragOffset() !== null);
  protected readonly offset = computed(() => this.dragOffset() ?? (this.isOpen() ? -SWIPE_TRAVEL : 0));
  /** The buttons come in from the right edge in step with the row: fully out at 0, fully in at the travel. */
  protected readonly actionsShift = computed(() => ACTIONS_WIDTH * (1 + this.offset() / SWIPE_TRAVEL));
  protected readonly time = computed(() => {
    const ms = this.conversation().time;
    return ms === null ? '' : relativeTime(ms, this.now());
  });
  protected readonly working = computed(() => this.conversation().kind === 'chat' && this.conversation().status === 'working');
  protected readonly waiting = computed(() => this.conversation().kind === 'chat' && this.conversation().status === 'blocked');
  /** "Asked you 3 questions": the agent is waiting on questions, not just a prompt. */
  protected readonly asked = computed(() => {
    const n = this.conversation().asking ?? 0;
    return this.waiting() && n > 0 ? `Asked you ${n} ${n === 1 ? 'question' : 'questions'}` : '';
  });
  protected readonly label = computed(() => {
    const c = this.conversation();
    const status = c.status && c.status !== 'idle' ? `, ${c.status}` : '';
    return `${c.title}, ${AGENT_LABEL[c.agent]}${status}`;
  });

  constructor() {
    // Captured on the way down so the link's own router click never sees a swallowed tap.
    const host = this.element.nativeElement;
    const guard = (event: Event) => this.guardClick(event);
    host.addEventListener('click', guard, true);
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('click', guard, true);
      this.gesture.cancel();
      if (this.isOpen()) this.swipe.close();
    });
  }

  protected down(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (this.swipe.open() !== this.conversation().address) this.swipe.close();
    this.swallowClick = false;
    this.gesture.down(event.clientX, event.clientY, this.isOpen());
  }

  protected move(event: PointerEvent): void {
    if (this.gesture.move(event.clientX, event.clientY)) {
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    }
  }

  protected up(): void {
    const { swiped } = this.gesture.up();
    if (swiped) this.swallowClick = true;
  }

  protected cancel(): void {
    this.gesture.cancel();
  }

  protected contextMenu(event: Event): void {
    event.preventDefault();
    this.openMenu();
  }

  /** The tap that ends a swipe or long press, or lands on an open row, only closes it: no navigation. */
  private guardClick(event: Event): void {
    if (!(event.target as Element).closest('a')) return;
    if (this.swallowClick || this.isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.swallowClick = false;
      this.swipe.close();
    }
  }

  protected openMenu(): void {
    this.menu.emit(this.element.nativeElement.getBoundingClientRect());
  }

  protected doRename(): void {
    this.swipe.close();
    this.rename.emit();
  }

  protected doClose(): void {
    this.swipe.close();
    this.close.emit();
  }
}
