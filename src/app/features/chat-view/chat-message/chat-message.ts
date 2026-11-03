import { Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBrain, lucideEllipsis, lucideImage } from '@ng-icons/lucide';
import { HlmBubbleImports } from '@spartan-ng/helm/bubble';
import { HlmMessageImports } from '@spartan-ng/helm/message';
import { HlmTraceImports } from '@spartan-ng/helm/trace';
import { RowGesture } from '../../../core/list/row-gesture';
import { slashCommandLine } from '../../../core/chat/slash-message';
import type { ChatMessage as Message } from '../../../core/chat/types';
import { MarkdownBlock } from '../markdown-block/markdown-block';
import { QuestionCard } from '../question-card/question-card';
import { ToolLine } from '../tool-line/tool-line';

/** One transcript message: user bubble (right), assistant (left, no bubble), system notice. */
@Component({
  selector: 'app-chat-message',
  imports: [
    NgIcon,
    MarkdownBlock,
    ToolLine,
    QuestionCard,
    ...HlmBubbleImports,
    ...HlmMessageImports,
    ...HlmTraceImports,
  ],
  viewProviders: [provideIcons({ lucideBrain, lucideEllipsis, lucideImage })],
  host: { class: 'block' },
  styleUrl: './chat-message.css',
  templateUrl: './chat-message.html',
})
export class ChatMessage {
  readonly message = input.required<Message>();
  /** The terminal and agent the message belongs to, for answering a question in it. */
  readonly address = input('');
  readonly agent = input('');
  /** What a tap or long press can do with this (user) message; null offers nothing. */
  readonly actions = input<'queued' | 'sent' | null>(null);
  /** Shown faded: it is about to be replaced by an edit. */
  readonly dimmed = input(false);
  /** A question card asks for the real terminal. */
  readonly openTerminal = output<void>();
  /** The message's actions were asked for (tap on a queued one, long press, or the … button). */
  readonly openActions = output<void>();

  /** Whether the release click that follows a long press must be ignored. */
  private swallow = false;
  private readonly gesture = new RowGesture({
    drag: () => undefined,
    release: () => undefined,
    longPress: () => this.openActions.emit(),
  });

  protected down(event: PointerEvent): void {
    if (!this.actions()) return;
    this.swallow = false;
    this.gesture.down(event.clientX, event.clientY, false);
  }

  protected move(event: PointerEvent): void {
    if (this.actions()) this.gesture.move(event.clientX, event.clientY);
  }

  protected up(): void {
    if (this.actions() && this.gesture.up().longPressed) this.swallow = true;
  }

  protected cancel(): void {
    this.gesture.cancel();
  }

  protected menu(event: Event): void {
    if (!this.actions()) return;
    event.preventDefault();
    this.openActions.emit();
  }

  /** A tap opens the menu of a queued message; a sent one waits for a long press or the … button. */
  protected tap(): void {
    if (this.swallow) {
      this.swallow = false;
      return;
    }
    if (this.actions() === 'queued') this.openActions.emit();
  }

  protected slashCommand(text: string): string | null {
    return slashCommandLine(text);
  }

  protected fileName(path: string | undefined): string {
    return path ? (path.split('/').pop() ?? path) : '';
  }
}
