import { Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBrain, lucideImage } from '@ng-icons/lucide';
import { HlmBubbleImports } from '@spartan-ng/helm/bubble';
import { HlmMessageImports } from '@spartan-ng/helm/message';
import { HlmTraceImports } from '@spartan-ng/helm/trace';
import type { ChatMessage as Message } from '../../../core/chat/types';
import { MarkdownBlock } from '../markdown-block/markdown-block';
import { ToolLine } from '../tool-line/tool-line';

/** One transcript message: user bubble (right), assistant (left, no bubble), system notice. */
@Component({
  selector: 'app-chat-message',
  imports: [
    NgIcon,
    MarkdownBlock,
    ToolLine,
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

  protected fileName(path: string | undefined): string {
    return path ? (path.split('/').pop() ?? path) : '';
  }
}
