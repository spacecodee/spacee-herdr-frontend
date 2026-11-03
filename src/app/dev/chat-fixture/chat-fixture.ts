import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { ChatMessage, ChatState, NoneReason } from '../../core/chat/types';
import { ChatView } from '../../features/chat-view/chat-view';
import { ComposeBar } from '../../features/terminal-view/compose-bar/compose-bar';
import { KeyBar } from '../../features/terminal-view/key-bar/key-bar';
import { CONVERSATION } from './fixtures';

/** Dev-only: the chat UI against canned data. `?s=conversation|working|blocked|empty|none|loading`. */
@Component({
  imports: [ChatView, ComposeBar, KeyBar],
  styleUrl: './chat-fixture.css',
  templateUrl: './chat-fixture.html',
})
export class ChatFixture {
  private readonly scenario = inject(ActivatedRoute).snapshot.queryParamMap.get('s') ?? 'conversation';
  protected readonly messages: ChatMessage[] =
    this.scenario === 'empty' || this.scenario === 'none' || this.scenario === 'loading'
      ? []
      : CONVERSATION;
  protected readonly state: ChatState = (
    { none: 'none', loading: 'connecting' } as Record<string, ChatState>
  )[this.scenario] ?? 'live';
  protected readonly reason: NoneReason | null = this.scenario === 'none' ? 'unsupported' : null;
  protected readonly status =
    this.scenario === 'blocked' ? 'blocked' : this.scenario === 'working' ? 'working' : 'idle';
}
