import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { relativeTime, type Conversation } from '../../../core/list/conversations';
import { AgentAvatar } from '../agent-avatar/agent-avatar';

const AGENT_NAME: Record<string, string> = {
  claude: 'Claude',
  pi: 'pi',
  codex: 'Codex',
  opencode: 'opencode',
  antigravity: 'Antigravity',
  generic: 'Agent',
};

/** One conversation: agent mark, title and time, a two-line preview, then tab and address. */
@Component({
  selector: 'app-conversation-row',
  imports: [AgentAvatar, RouterLink],
  host: { class: 'block' },
  templateUrl: './conversation-row.html',
  styleUrl: './conversation-row.css',
})
export class ConversationRow {
  readonly conversation = input.required<Conversation>();
  /** Epoch milliseconds the relative time is measured against. */
  readonly now = input.required<number>();

  protected readonly time = computed(() => {
    const ms = this.conversation().time;
    return ms === null ? '' : relativeTime(ms, this.now());
  });
  protected readonly working = computed(() => this.conversation().status === 'working');
  protected readonly label = computed(() => {
    const c = this.conversation();
    const status = c.status && c.status !== 'idle' ? `, ${c.status}` : '';
    return `${c.title}, ${AGENT_NAME[c.agent]}${status}`;
  });
}
