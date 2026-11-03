import { Component, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight } from '@ng-icons/lucide';
import { HlmCollapsibleImports } from '@spartan-ng/helm/collapsible';
import { DOT, TEXT } from '../../status-label/status-label';
import type { GroupSummary } from '../../../core/hc/group-summary';
import { CollapsedGroups } from '../../../core/list/collapsed-groups';

/**
 * A collapsible list section: a space, a tab or a machine. The header is a button inside a
 * heading (so heading levels stay in the outline) and shows the terminal count and, when
 * something needs attention, a compact status summary. Open state is remembered per `sectionId`.
 */
@Component({
  selector: 'app-list-section',
  imports: [NgIcon, ...HlmCollapsibleImports],
  viewProviders: [provideIcons({ lucideChevronRight })],
  templateUrl: './list-section.html',
  styleUrl: './list-section.css',
})
export class ListSection {
  protected readonly groups = inject(CollapsedGroups);

  /** Stable id for the stored open state, for example `space:abc`. */
  readonly sectionId = input.required<string>();
  readonly name = input.required<string>();
  /** Heading level: 2 for a top-level section, 3 when nested. */
  readonly level = input<2 | 3>(2);
  readonly summary = input.required<GroupSummary>();
  /** Extra state shown beside the name, such as an unreachable machine. */
  readonly note = input<string | null>(null);

  protected readonly open = computed(() => this.groups.isOpen(this.sectionId()));
  protected readonly summaryTextClass = computed(() => TEXT[this.summary().kind ?? 'idle']);
  protected readonly summaryDotClass = computed(() => DOT[this.summary().kind ?? 'idle']);
  protected readonly summaryText = computed(() => {
    const { kind, count } = this.summary();
    return kind ? `${count} ${kind}` : '';
  });
}
