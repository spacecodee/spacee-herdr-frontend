import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmMessageScrollerImports } from '@spartan-ng/helm/message-scroller';
import { HlmSkeleton } from '@spartan-ng/helm/skeleton';
import { Permissions } from '../../core/answers/permissions';
import type { ChatMessage as Message, ChatState, NoneReason } from '../../core/chat/types';
import { ChatMessage } from './chat-message/chat-message';
import { PermissionCard } from './permission-card/permission-card';

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
  imports: [ChatMessage, PermissionCard, HlmSkeleton, ...HlmMessageScrollerImports, ...HlmButtonImports],
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
  /** The terminal and agent, so a question in the chat can be answered. */
  readonly address = input('');
  readonly agent = input('');
  /** The "No, and tell …" row whose reason is being typed in the compose field. */
  readonly typing = input<number | null>(null);
  /** Asks the parent to switch to the real terminal. */
  readonly showTerminal = output<void>();
  /** The user chose "No, and tell …": the compose field takes the reason. */
  readonly denyText = output<number>();

  private readonly permissions = inject(Permissions);
  protected readonly prompt = computed(() => this.permissions.promptOf(this.address()));
  protected readonly permission = computed(() => this.permissions.stateOf(this.address()));

  /** A question card is in the chat: it is the call to action, so the generic one stays away. */
  protected readonly asking = computed(() =>
    this.messages().some((m) => m.parts.some((p) => p.type === 'tool' && p.status === 'running' && !!p.questions?.length)),
  );

  constructor() {
    // A blocked agent without a question card waits on a permission prompt: read it off its screen.
    effect(() => {
      const address = this.address();
      const waiting = this.status() === 'blocked' && !this.asking();
      untracked(() => {
        if (!address) return;
        if (waiting) void this.permissions.probe(address, this.agent());
        else this.permissions.settle(address);
      });
    });
  }

  protected choose(index: number): void {
    void this.permissions.answer(this.address(), this.agent(), index);
  }

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
