import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmMessageScrollerImports } from '@spartan-ng/helm/message-scroller';
import { HlmSkeleton } from '@spartan-ng/helm/skeleton';
import { Permissions } from '../../core/answers/permissions';
import { FREE_STATUSES, REWIND_FAILURE, Rewind, rewindAgent } from '../../core/answers/rewind';
import { flattenEnvelopes, parseEnvelopes } from '../../core/chat/envelope';
import { messageText, queuedTexts, rewindPoint } from '../../core/chat/rewind-target';
import type { ChatMessage as Message, ChatState, NoneReason } from '../../core/chat/types';
import { ChatMessage } from './chat-message/chat-message';
import { MessageSheet, type SheetAction, type SheetTarget } from './message-sheet/message-sheet';
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

/** The message the user asked to change: the text for the compose field, and how it got there. */
export interface MessageEdit {
  id: string;
  text: string;
  /** The message as it was before the rewind (the stream may hide it afterwards) and the chat messages the rewind removes. */
  message: Message;
  removed: number;
  /** `queued` and `sent` show the editing bar; `rewind` only prefills. */
  mode: 'queued' | 'sent' | 'rewind';
}

/**
 * The conversation: bubbles, markdown and tool calls in Spartan's message scroller, which keeps the
 * list pinned to the bottom unless the user scrolled up (then its button jumps back down).
 */
@Component({
  selector: 'app-chat-view',
  imports: [ChatMessage, MessageSheet, PermissionCard, HlmSkeleton, ...HlmMessageScrollerImports, ...HlmButtonImports],
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
  /** A message is back from the agent and goes to the compose field (the agent has already gone back for `sent`/`rewind`). */
  readonly edit = output<MessageEdit>();
  /** The message the agent was rewound to, so the chat can hide what came after it. */
  readonly rewoundId = input<string | null>(null);
  /** Queued messages the agent had already taken when the user tried to change them. */
  readonly delivered = output<string[]>();

  private readonly permissions = inject(Permissions);
  private readonly rewinds = inject(Rewind);
  protected readonly prompt = computed(() => this.permissions.promptOf(this.address()));
  protected readonly permission = computed(() => this.permissions.stateOf(this.address()));

  /** The messages with something to show: a user turn made only of hidden context (a system reminder) is left out. */
  protected readonly shown = computed(() =>
    this.messages().filter(
      (m) =>
        m.role !== 'user' ||
        m.parts.some((p) => (p.type === 'text' ? flattenEnvelopes(parseEnvelopes(p.text)).length > 0 || p.text.trim() === '' : true)),
    ),
  );

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

  protected readonly rewindKind = computed(() => rewindAgent(this.agent()));
  protected readonly free = computed(() => FREE_STATUSES.includes(this.status() ?? ''));
  protected readonly sheet = signal<SheetTarget | null>(null);
  protected readonly working = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly codeChanges = signal<boolean | null>(null);
  /** The message whose later turns are being replaced right now; they show faded. */
  private readonly replacing = signal<string | null>(null);
  protected readonly faded = computed(() => {
    const id = this.replacing();
    if (!id) return new Set<string>();
    const list = this.messages();
    return new Set(list.slice(list.findIndex((m) => m.id === id) + 1).map((m) => m.id));
  });

  /** What a tap on a user message offers: queued ones only for Claude (the others steer), sent ones where the agent can rewind. */
  protected actionsOf(m: Message): 'queued' | 'sent' | null {
    if (m.role !== 'user') return null;
    if (m.queued) return this.rewindKind() === 'claude' && queuedTexts(this.messages(), m.id) ? 'queued' : null;
    return this.rewindKind() && rewindPoint(this.messages(), m.id, this.rewoundId()) ? 'sent' : null;
  }

  protected openSheet(m: Message): void {
    const kind = this.actionsOf(m);
    if (!kind) return;
    this.failure.set(null);
    this.codeChanges.set(null);
    if (kind === 'queued') this.sheet.set({ kind, id: m.id, text: messageText(m) });
    else this.sheet.set({ kind, id: m.id, text: messageText(m), removed: rewindPoint(this.messages(), m.id, this.rewoundId())?.removed ?? 0 });
  }

  protected closeSheet(): void {
    if (this.working()) return;
    this.sheet.set(null);
  }

  protected async onSheet(action: SheetAction): Promise<void> {
    const target = this.sheet();
    const address = this.address();
    if (!target || this.working()) return;
    if (action.type === 'terminal') {
      this.sheet.set(null);
      this.showTerminal.emit();
      return;
    }
    if (action.type === 'copy') {
      this.sheet.set(null);
      try {
        await navigator.clipboard.writeText(target.text);
        toast.success('Copied');
      } catch {
        toast.error('Cannot copy here.');
      }
      return;
    }
    this.failure.set(null);
    this.working.set(true);
    try {
      if (target.kind === 'queued') await this.queued(address, target, action);
      else await this.sent(address, target, action);
    } finally {
      this.working.set(false);
      this.replacing.set(null);
    }
  }

  private async queued(address: string, target: SheetTarget, action: SheetAction): Promise<void> {
    const queue = queuedTexts(this.messages(), target.id);
    if (!queue || (action.type !== 'edit-queued' && action.type !== 'cancel-queued')) return;
    const result = await this.rewinds.takeQueued(address, queue.texts, queue.index);
    if (!result.ok) {
      this.failure.set(REWIND_FAILURE[result.reason]);
      // Gone from the queue means delivered: the chat must stop showing them as waiting.
      if (result.reason === 'queue') this.delivered.emit(queue.ids);
      return;
    }
    this.sheet.set(null);
    const message = this.messages().find((m) => m.id === target.id);
    if (action.type === 'edit-queued' && message) {
      this.edit.emit({ id: target.id, text: target.text, message, removed: 0, mode: 'queued' });
      return;
    }
    toast('Message cancelled', {
      action: { label: 'Undo', onClick: () => void this.rewinds.requeue(address, target.text) },
    });
  }

  private async sent(address: string, target: SheetTarget, action: SheetAction): Promise<void> {
    const agent = this.agent();
    const point = rewindPoint(this.messages(), target.id, this.rewoundId());
    if (target.kind !== 'sent' || !point) return;
    const goal = { text: point.text, back: point.back };
    if (action.type === 'peek') {
      if (this.rewindKind() !== 'claude') return;
      const peek = await this.rewinds.peek(address, agent, goal);
      if (peek.ok) this.codeChanges.set(peek.codeChanges ?? false);
      else this.failure.set(REWIND_FAILURE[peek.reason]);
      return;
    }
    if (action.type !== 'edit-sent' && action.type !== 'rewind') return;
    if (action.type === 'edit-sent') this.replacing.set(target.id);
    const result = await this.rewinds.rewind(address, agent, { ...goal, files: action.type === 'rewind' && action.files });
    if (!result.ok) {
      this.failure.set(REWIND_FAILURE[result.reason]);
      return;
    }
    this.sheet.set(null);
    const message = this.messages().find((m) => m.id === target.id);
    if (message) this.edit.emit({ id: target.id, text: point.text, message, removed: point.removed, mode: action.type === 'edit-sent' ? 'sent' : 'rewind' });
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
