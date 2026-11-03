import { Component, computed, input, output } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmMessageScrollerImports } from '@spartan-ng/helm/message-scroller';
import { HlmSkeleton } from '@spartan-ng/helm/skeleton';
import type { ChatMessage as Message, ChatState, NoneReason } from '../../core/chat/types';
import { ChatMessage } from './chat-message/chat-message';

/** Markdown punctuation out, and whitespace collapsed, so a quoted question reads as one paragraph. */
const plain = (markdown: string): string =>
  markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*\|/.test(line) && !/^\s*([-*_]\s*){3,}$/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ''))
    .join(' ')
    .replace(/[#*`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The conversation: bubbles, markdown and tool calls in Spartan's message scroller, which keeps the
 * list pinned to the bottom unless the user scrolled up (then its button jumps back down).
 */
@Component({
  selector: 'app-chat-view',
  imports: [ChatMessage, HlmSkeleton, ...HlmMessageScrollerImports, ...HlmButtonImports],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  styleUrl: './chat-view.css',
  templateUrl: './chat-view.html',
})
export class ChatView {
  readonly messages = input.required<Message[]>();
  readonly state = input.required<ChatState>();
  readonly noneReason = input<NoneReason | null>(null);
  /** The terminal's live status (`working`, `blocked`, ...). */
  readonly status = input<string | undefined>(undefined);
  /** Asks the parent to switch to the real terminal. */
  readonly showTerminal = output<void>();

  /** What the agent last said, which is what a blocked agent is waiting on. */
  protected readonly question = computed(() => {
    for (let i = this.messages().length - 1; i >= 0; i--) {
      const m = this.messages()[i];
      if (m.role !== 'assistant') continue;
      const texts = m.parts.filter((p) => p.type === 'text');
      if (texts.length > 0) return plain(texts[texts.length - 1].text);
    }
    return '';
  });

  protected readonly noneText = computed(() =>
    this.noneReason() === 'no-agent'
      ? 'No agent is running in this terminal. Use Terminal.'
      : "This agent's history is not available, use Terminal.",
  );
}
