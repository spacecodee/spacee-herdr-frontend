import { DOCUMENT } from '@angular/common';
import { InjectionToken, Service, computed, inject, signal } from '@angular/core';
import { applyAppend, applyRemove, applyReset, applyUpdate, queuedLast } from './chat-reducer';
import { REWOUND_DIVIDER_ID } from './rewind-target';
import type { ChatMessage, ChatState, NoneReason, ResetEvent } from './types';

/**
 * A rewind the agent did on its screen. Claude and Codex write nothing to disk until the next prompt,
 * so the stream still lists the abandoned turns: they are hidden from the rewound message on (which
 * stays) until a user message the chat has not seen arrives.
 */
interface Rewound {
  message: ChatMessage;
  removed: number;
  seen: ReadonlySet<string>;
}

const hasNewPrompt = (messages: ChatMessage[], seen: ReadonlySet<string>): boolean =>
  messages.some((m) => m.role === 'user' && !seen.has(m.id));

/** Opens the SSE stream; swapped for a fake in tests and the dev fixtures. */
export type EventSourceFactory = (url: string) => EventSource;
export const EVENT_SOURCE_FACTORY = new InjectionToken<EventSourceFactory>('EVENT_SOURCE_FACTORY', {
  factory: () => (url) => new EventSource(url, { withCredentials: true }),
});

export function chatUrl(address: string): string {
  return `/api/chat?terminal=${encodeURIComponent(address)}`;
}

/**
 * One `EventSource` per open chat: `reset`/`append`/`update`/`remove` feed the message list, `none` says the
 * agent has no readable history. EventSource retries by itself; we also reopen a stream that
 * ended for good (`CLOSED`) when the tab becomes visible again.
 */
@Service()
export class ChatStream {
  private readonly open = inject(EVENT_SOURCE_FACTORY);
  private readonly document = inject(DOCUMENT);

  private readonly msgs = signal<ChatMessage[]>([]);
  private readonly st = signal<ChatState>('connecting');
  private readonly agentName = signal('');
  private readonly why = signal<NoneReason | null>(null);

  private readonly cut = signal<Rewound | null>(null);

  readonly messages = computed(() => {
    const all = queuedLast(this.msgs());
    const cut = this.cut();
    if (!cut) return all;
    const at = all.findIndex((m) => m.id === cut.message.id);
    const kept = at >= 0 ? all.slice(0, at + 1) : [...all, cut.message];
    const divider: ChatMessage = {
      id: REWOUND_DIVIDER_ID,
      role: 'system',
      time: 0,
      parts: [{ type: 'text', text: `Rewound · ${cut.removed} ${cut.removed === 1 ? 'message' : 'messages'} removed` }],
    };
    return [...kept, divider];
  });
  /** The message the agent was rewound to (still shown), or null. */
  readonly rewoundId = computed(() => this.cut()?.message.id ?? null);

  /**
   * The agent went back to `message`: hide what came after it until a new prompt shows up. `removed` is
   * counted by the caller before the rewind (the bridge may already hide rows afterwards, as opencode's
   * does); an earlier rewind's hidden turns are added.
   */
  rewind(message: ChatMessage, removed: number): void {
    const before = this.cut();
    this.cut.set({
      message,
      removed: removed + (before ? before.removed + 1 : 0),
      seen: new Set([...this.msgs().map((m) => m.id), message.id]),
    });
  }

  /** Messages the agent took from its queue: they are ordinary user messages now. */
  unqueue(ids: string[]): void {
    this.msgs.update((all) => all.map((m) => (ids.includes(m.id) ? { ...m, queued: false } : m)));
  }

  private endRewindOnNewPrompt(incoming: ChatMessage[]): void {
    const cut = this.cut();
    if (cut && hasNewPrompt(incoming, cut.seen)) this.cut.set(null);
  }

  /** Forgets the rewind (the chat shows the stream as it is). */
  endRewind(): void {
    this.cut.set(null);
  }
  readonly state = this.st.asReadonly();
  readonly agent = this.agentName.asReadonly();
  readonly noneReason = this.why.asReadonly();

  private source: EventSource | null = null;
  private address: string | null = null;
  private onVisible: (() => void) | null = null;

  /** Starts (or restarts) streaming a terminal's transcript. */
  connect(address: string): void {
    this.close();
    this.address = address;
    this.msgs.set([]);
    this.cut.set(null);
    this.why.set(null);
    this.agentName.set('');
    this.st.set('connecting');
    this.listen();
    this.onVisible = () => {
      if (this.document.visibilityState === 'visible' && this.source?.readyState === 2)
        this.reopen();
    };
    this.document.addEventListener('visibilitychange', this.onVisible);
  }

  /** Stops streaming; call when the chat is left. */
  close(): void {
    if (this.onVisible) this.document.removeEventListener('visibilitychange', this.onVisible);
    this.onVisible = null;
    this.source?.close();
    this.source = null;
    this.address = null;
  }

  private reopen(): void {
    if (this.address === null) return;
    this.source?.close();
    this.st.set('connecting');
    this.listen();
  }

  private listen(): void {
    if (this.address === null) return;
    const source = this.open(chatUrl(this.address));
    this.source = source;
    const on = (name: string, handler: (data: unknown) => void) =>
      source.addEventListener(name, (event) => {
        if (this.source !== source) return;
        let data: unknown;
        try {
          data = JSON.parse((event as MessageEvent<string>).data);
        } catch {
          return;
        }
        if (data && typeof data === 'object') handler(data);
      });
    on('reset', (d) => {
      const e = d as Partial<ResetEvent>;
      this.agentName.set(typeof e.agent === 'string' ? e.agent : '');
      const fresh = applyReset(Array.isArray(e.messages) ? e.messages : []);
      this.endRewindOnNewPrompt(fresh);
      this.msgs.set(fresh);
      this.why.set(null);
      this.st.set('live');
    });
    on('append', (d) => {
      const m = (d as { messages?: ChatMessage[] }).messages;
      if (Array.isArray(m)) {
        this.endRewindOnNewPrompt(m);
        this.msgs.update((cur) => applyAppend(cur, m));
      }
      this.st.set('live');
    });
    on('update', (d) => {
      const m = (d as { messages?: ChatMessage[] }).messages;
      if (Array.isArray(m)) this.msgs.update((cur) => applyUpdate(cur, m));
    });
    on('remove', (d) => {
      const ids = (d as { ids?: unknown }).ids;
      if (Array.isArray(ids))
        this.msgs.update((cur) =>
          applyRemove(
            cur,
            ids.filter((x) => typeof x === 'string'),
          ),
        );
    });
    on('none', (d) => {
      const reason = (d as { reason?: NoneReason }).reason;
      this.why.set(reason ?? 'unsupported');
      this.msgs.set([]);
      this.cut.set(null);
      this.st.set('none');
    });
    source.onopen = () => {
      if (this.source === source && this.st() === 'error') this.st.set('connecting');
    };
    source.onerror = () => {
      if (this.source !== source || this.st() === 'none') return;
      // readyState CONNECTING (0): the browser is retrying; CLOSED (2): it gave up.
      this.st.set('error');
    };
  }
}
