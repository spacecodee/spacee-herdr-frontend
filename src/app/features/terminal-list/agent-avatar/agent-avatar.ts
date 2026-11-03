import { Component, computed, input } from '@angular/core';
import type { AgentKind } from '../../../core/list/conversations';

const GLYPH: Record<AgentKind, string> = {
  claude: 'C',
  pi: 'π',
  codex: 'Cx',
  opencode: 'O',
  antigravity: 'A',
  generic: 'AI',
  shell: '>_',
};

/**
 * An agent's mark: a small rounded square with a glyph and a stable color per agent, and the
 * terminal's status as a dot on its corner. Decoration only; the row names the agent and status.
 */
@Component({
  selector: 'app-agent-avatar',
  host: { class: 'relative inline-flex shrink-0', 'aria-hidden': 'true' },
  templateUrl: './agent-avatar.html',
  styleUrl: './agent-avatar.css',
})
export class AgentAvatar {
  readonly agent = input.required<AgentKind>();
  /** Terminal status; only blocked, working and done get a dot. */
  readonly status = input<string | null>(null);
  readonly size = input<'md' | 'sm'>('md');

  protected readonly glyph = computed(() => GLYPH[this.agent()]);
  protected readonly dot = computed(() => {
    const s = this.status();
    return s === 'blocked' || s === 'working' || s === 'done' ? s : null;
  });
}
