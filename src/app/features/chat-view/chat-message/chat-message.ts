import { Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBrain, lucideImage } from '@ng-icons/lucide';
import { HlmBubbleImports } from '@spartan-ng/helm/bubble';
import { HlmMessageImports } from '@spartan-ng/helm/message';
import { HlmTraceImports } from '@spartan-ng/helm/trace';
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
  viewProviders: [provideIcons({ lucideBrain, lucideImage })],
  host: { class: 'block' },
  styleUrl: './chat-message.css',
  templateUrl: './chat-message.html',
})
export class ChatMessage {
  readonly message = input.required<Message>();
  /** The terminal and agent the message belongs to, for answering a question in it. */
  readonly address = input('');
  readonly agent = input('');
  /** A question card asks for the real terminal. */
  readonly openTerminal = output<void>();

  protected slashCommand(text: string): string | null {
    return slashCommandLine(text);
  }

  protected fileName(path: string | undefined): string {
    return path ? (path.split('/').pop() ?? path) : '';
  }
}
