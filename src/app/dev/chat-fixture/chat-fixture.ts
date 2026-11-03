import { afterNextRender, Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { ChatMessage, ChatState, NoneReason } from '../../core/chat/types';
import type { ViewMode } from '../../core/chat/view-mode';
import type { Tone } from '../../features/status-label/status-label';
import { ChatView } from '../../features/chat-view/chat-view';
import { ComposeBar } from '../../features/terminal-view/compose-bar/compose-bar';
import { ConnectionCard } from '../../features/terminal-view/connection-card/connection-card';
import { KeyBar } from '../../features/terminal-view/key-bar/key-bar';
import { ViewHeader } from '../../features/terminal-view/view-header/view-header';
import { UpdateCard } from '../../features/update-card/update-card';
import { provideFixtureUpdates } from '../update-fixture';
import { Answers, type AnswerState } from '../../core/answers/answers';
import { Permissions } from '../../core/answers/permissions';
import { CLAUDE_PROMPT, fixturePermissions } from '../permission-fixture';
import { Rewind } from '../../core/answers/rewind';
import type { MessageEdit } from '../../features/chat-view/chat-view';
import { CONVERSATION, EDIT_QUEUE, QUESTIONS } from './fixtures';

const LINES = [
  '\u001b[32m~/code/web\u001b[0m on main',
  '$ pnpm test --watch=false',
  ' Test Files  63 passed (63)',
  '      Tests  760 passed (760)',
  '   Duration  5.32s',
  '$ git status --short',
  ' M src/app/features/terminal-view/terminal-view.ts',
  '$ ',
];

/**
 * Dev-only: the chat and terminal screens against canned data (no bridge, no xterm).
 * `?s=conversation|working|blocked|empty|none|loading|terminal|disconnected`; `kb=1` focuses the
 * message field so the key row shows, as it does while the keyboard is up.
 */
@Component({
  imports: [ChatView, ComposeBar, ConnectionCard, KeyBar, UpdateCard, ViewHeader],
  providers: [
    provideFixtureUpdates,
    {
      provide: Permissions,
      useFactory: () => {
        const s = new URLSearchParams(location.search).get('s') ?? '';
        return fixturePermissions('fixture/t1', CLAUDE_PROMPT, s === 'p-answered' ? { phase: 'answered', label: 'Yes' } : undefined);
      },
    },
    {
      // Canned results; `?hang=1` never finishes a rewind, which is the "Rewinding…" state.
      provide: Rewind,
      useFactory: () => {
        const hang = new URLSearchParams(location.search).get('hang') === '1';
        const forever = () => new Promise<never>(() => undefined);
        return {
          peek: async () => ({ ok: true, codeChanges: true }),
          rewind: async () => (hang ? forever() : { ok: true }),
          takeQueued: async () => ({ ok: true }),
          requeue: async () => true,
        };
      },
    },
    {
      provide: Answers,
      useFactory: () => {
        const states = signal<Record<string, AnswerState>>({});
        const failed = new URLSearchParams(location.search).get('s') === 'q-failed';
        return {
          stateOf: (key: string) => (failed ? 'failed' : states()[key]),
          clear: () => undefined,
          submit: async (address: string, _agent: string, part: { id: string }) => states.update((s) => ({ ...s, [`${address}:${part.id}`]: 'sending' })),
        };
      },
    },
  ],
  styleUrl: './chat-fixture.css',
  templateUrl: './chat-fixture.html',
})
export class ChatFixture {
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly scenario = this.query.get('s') ?? 'conversation';
  protected readonly terminalMode = this.scenario === 'terminal' || this.scenario === 'disconnected';
  protected readonly disconnected = this.scenario === 'disconnected';
  protected readonly mode: ViewMode = this.terminalMode ? 'terminal' : 'chat';
  protected readonly lines = LINES.map((l) => l.replace(/\u001b\[\d+m/g, ''));
  protected readonly messages = signal<ChatMessage[]>(
    this.scenario === 'empty' || this.scenario === 'none' || this.scenario === 'loading'
      ? []
      : this.scenario === 'e-queued'
        ? [...CONVERSATION.filter((m) => m.id !== 's1' && m.id !== 'u0'), ...EDIT_QUEUE]
        : this.scenario.startsWith('e-')
          ? CONVERSATION.filter((m) => m.id !== 's1' && m.id !== 'u0')
          : (QUESTIONS[this.scenario] ?? (this.scenario === 'q-failed' ? QUESTIONS['q-single'] : CONVERSATION)),
  );
  protected readonly rewoundId = signal<string | null>(null);
  protected readonly editing = signal<'queued' | 'sent' | null>(null);
  protected readonly state: ChatState = (
    { none: 'none', loading: 'connecting' } as Record<string, ChatState>
  )[this.scenario] ?? 'live';
  protected readonly reason: NoneReason | null = this.scenario === 'none' ? 'unsupported' : null;
  protected readonly status =
    this.scenario === 'blocked' || this.scenario === 'p-choices' || (this.scenario.startsWith('p-') && this.scenario !== 'p-answered') || (this.scenario.startsWith('q-') && this.scenario !== 'q-answered') ? 'blocked' : this.scenario === 'working' || this.scenario === 'e-queued' || this.scenario === 'e-busy' || this.scenario === 'q-answered' || this.scenario === 'p-answered' ? 'working' : 'idle';
  protected readonly line = computed<{ text: string; tone: Tone }>(() => {
    if (this.disconnected) return { text: 'Disconnected', tone: 'blocked' };
    return (
      {
        working: { text: 'Working', tone: 'working' },
        blocked: { text: 'Blocked', tone: 'blocked' },
      } as Record<string, { text: string; tone: Tone }>
    )[this.status] ?? { text: 'Done', tone: 'done' };
  });
  protected readonly agent = this.query.get('agent') ?? 'claude';
  protected readonly focused = signal(this.query.get('kb') === '1');
  protected readonly compose = viewChild(ComposeBar);
  protected readonly typing = signal<number | null>(null);
  protected readonly placeholder = computed(() => (this.typing() === null ? 'Message' : 'Tell Claude what to do instead'));

  /** What the terminal view does with a message that came back: hide what followed, fill the field. */
  protected onEdit(edit: MessageEdit): void {
    if (edit.mode !== 'queued') {
      const all = this.messages();
      const removed = edit.removed;
      this.rewoundId.set(edit.id);
      this.messages.set([
        ...all.slice(0, all.findIndex((m) => m.id === edit.id) + 1),
        { id: 'rewound-divider', role: 'system', time: 0, parts: [{ type: 'text', text: `Rewound · ${removed} ${removed === 1 ? 'message' : 'messages'} removed` }] },
      ]);
    } else this.messages.update((all) => all.filter((m) => m.id !== edit.id));
    this.editing.set(edit.mode === 'rewind' ? null : edit.mode);
    this.compose()?.fill(edit.text);
  }

  protected startDenyText(choice: number): void {
    if (this.typing() === choice) return this.typing.set(null);
    this.typing.set(choice);
    this.focused.set(true);
    setTimeout(() => this.compose()?.focus());
  }

  constructor() {
    afterNextRender(() => {
      if (this.focused()) this.compose()?.focus();
    });
  }
}
