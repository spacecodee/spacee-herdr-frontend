import { Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideActivity, lucideBookOpen, lucideContainer, lucideGlobe, lucideSquarePen } from '@ng-icons/lucide';
import type { AgentKind, ProgramKind } from '../../../core/list/conversations';

const PROGRAM_ICON: Record<ProgramKind, string> = {
  editor: 'lucideSquarePen',
  monitor: 'lucideActivity',
  pager: 'lucideBookOpen',
  docker: 'lucideContainer',
  ssh: 'lucideGlobe',
};

const GLYPH: Record<AgentKind, string> = {
  claude: 'C',
  pi: 'π',
  codex: 'Cx',
  opencode: 'O',
  antigravity: 'A',
  gemini: 'G',
  generic: 'AI',
  shell: '>_',
};

interface Icon {
  src: string;
  srcset?: string;
  /** Single-color artwork (black fill): inverted in the dark theme. */
  mono?: boolean;
}

/** Real artwork per agent; shell and unknown agents keep their glyph. Credits: public/agents/README.md */
const ICON: Partial<Record<AgentKind, Icon>> = {
  claude: { src: '/agents/claude-color.svg' },
  codex: { src: '/agents/codex-color.svg' },
  opencode: { src: '/agents/opencode.svg', mono: true },
  antigravity: { src: '/agents/antigravity-color.svg' },
  gemini: { src: '/agents/gemini-color.svg' },
  pi: { src: '/agents/pi-96.webp', srcset: '/agents/pi-96.webp 1x, /agents/pi-192.webp 2x' },
};

/**
 * An agent's mark: a small rounded square with the agent's icon (a glyph when it has none), and the
 * terminal's status as a dot on its corner. Decoration only; the row names the agent and status.
 */
@Component({
  selector: 'app-agent-avatar',
  imports: [NgIcon],
  viewProviders: [provideIcons({ lucideActivity, lucideBookOpen, lucideContainer, lucideGlobe, lucideSquarePen })],
  host: { class: 'relative inline-flex shrink-0', 'aria-hidden': 'true' },
  templateUrl: './agent-avatar.html',
  styleUrl: './agent-avatar.css',
})
export class AgentAvatar {
  readonly agent = input.required<AgentKind>();
  /** Terminal status; only blocked, working and done get a dot. */
  readonly status = input<string | null>(null);
  /** A shell running a known program shows that program's glyph instead of `>_`. */
  readonly program = input<ProgramKind | null>(null);
  readonly size = input<'md' | 'sm'>('md');

  protected readonly icon = computed(() => ICON[this.agent()] ?? null);
  protected readonly programIcon = computed(() => (this.program() ? PROGRAM_ICON[this.program()!] : null));
  protected readonly glyph = computed(() => GLYPH[this.agent()]);
  protected readonly dot = computed(() => {
    const s = this.status();
    return s === 'blocked' || s === 'working' || s === 'done' ? s : null;
  });
}
