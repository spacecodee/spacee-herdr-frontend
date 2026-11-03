import { Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight } from '@ng-icons/lucide';
import { HlmCollapsibleImports } from '@spartan-ng/helm/collapsible';
import type { GroupSummary } from '../../../core/hc/group-summary';
import { CollapsedGroups } from '../../../core/list/collapsed-groups';
import { LayoutMenu } from '../../layout/layout-menu/layout-menu';

/**
 * A collapsible list section: a space, a tab or a machine. The header is a button inside a
 * heading (so heading levels stay in the outline) and shows the terminal count and, when
 * something needs attention, a compact status summary (working, needs you). Open state is remembered per `sectionId`.
 */
@Component({
  selector: 'app-list-section',
  imports: [LayoutMenu, NgIcon, NgTemplateOutlet, ...HlmCollapsibleImports],
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
  /** The herdr space this section shows; set, it gets a "…" menu for tabs, rename, move and close. */
  readonly spaceId = input<string | null>(null);
  /** Extra state shown beside the name, such as an unreachable machine. */
  readonly note = input<string | null>(null);

  protected readonly open = computed(() => this.groups.isOpen(this.sectionId()));
  /** What the header calls out, working first: each part has its dot and text color. */
  protected readonly callouts = computed(() => {
    const { working, blocked } = this.summary();
    return [
      ...(working > 0 ? [{ text: `${working} working`, dot: 'bg-status-working', ink: 'text-status-working-text' }] : []),
      ...(blocked > 0 ? [{ text: `${blocked} needs you`, dot: 'bg-status-blocked', ink: 'text-status-blocked-text' }] : []),
    ];
  });
}
