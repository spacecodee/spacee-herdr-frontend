import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import type { AgentKind, ProgramKind } from '../../../core/list/conversations';
import type { ViewMode } from '../../../core/chat/view-mode';
import { AgentAvatar } from '../../terminal-list/agent-avatar/agent-avatar';
import { DOT, TEXT, type Tone } from '../../status-label/status-label';

/**
 * The top of the chat and terminal screens: back, who this is (avatar, name, one status line),
 * the Chat/Terminal switch under them, and the screen's menu (projected) on the right.
 */
@Component({
  selector: 'app-view-header',
  imports: [RouterLink, NgIcon, AgentAvatar, ...HlmButtonImports],
  viewProviders: [provideIcons({ lucideChevronLeft })],
  host: { class: 'block' },
  styleUrl: './view-header.css',
  templateUrl: './view-header.html',
})
export class ViewHeader {
  readonly heading = input.required<string>();
  readonly agent = input.required<AgentKind>();
  readonly program = input<ProgramKind | null>(null);
  /** The terminal's status, for the avatar dot. */
  readonly status = input<string | null>(null);
  /** The single status line: its words and the tone of its dot. */
  readonly line = input.required<{ text: string; tone: Tone }>();
  readonly mode = input.required<ViewMode>();
  readonly modeChange = output<ViewMode>();

  protected readonly dot = DOT;
  protected readonly text = TEXT;
}
