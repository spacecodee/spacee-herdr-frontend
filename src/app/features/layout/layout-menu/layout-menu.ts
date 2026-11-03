import { Component, computed, inject, input, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowUp,
  lucideColumns2,
  lucideEllipsis,
  lucidePencil,
  lucidePlus,
  lucideRows2,
  lucideSquareTerminal,
  lucideX,
} from '@ng-icons/lucide';
import { BrnPopover } from '@spartan-ng/brain/popover';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { ViewModes } from '../../../core/chat/view-mode';
import { locate, type Space } from '../../../core/hc/spaces';
import { TerminalStore } from '../../../core/hc/terminal-store';
import { LayoutActions } from '../../../core/layout/layout-actions';
import { closeTarget, spaceTerminals } from '../../../core/layout/layout-rules';

/**
 * The "…" menu of a project header (`spaceId`) or of a terminal (`address`): new tab, split, rename,
 * move and close. The sheets and the confirmation live in `app-layout-host`; this only opens them.
 */
@Component({
  selector: 'app-layout-menu',
  imports: [NgIcon, ...HlmButtonImports, ...HlmPopoverImports],
  viewProviders: [
    provideIcons({
      lucideArrowDown,
      lucideArrowUp,
      lucideColumns2,
      lucideEllipsis,
      lucidePencil,
      lucidePlus,
      lucideRows2,
      lucideSquareTerminal,
      lucideX,
    }),
  ],
  host: { class: 'inline-flex shrink-0' },
  templateUrl: './layout-menu.html',
  styleUrl: './layout-menu.css',
})
export class LayoutMenu {
  private readonly store = inject(TerminalStore);
  private readonly router = inject(Router);
  private readonly viewModes = inject(ViewModes);
  protected readonly actions = inject(LayoutActions);
  private readonly popover = viewChild(BrnPopover);

  /** Project menu: the space this header belongs to. */
  readonly spaceId = input<string | null>(null);
  /** Terminal menu: the terminal's address. */
  readonly address = input<string | null>(null);
  /** Accessible name of the trigger, such as the project or tab name. */
  readonly label = input('');
  /**
   * Terminal menu: `row` adds "Open terminal" for agents. `view` is the terminal screen's "More" menu:
   * it adds "New tab here" and shows its projected content (Settings) and stays even without a layout.
   */
  readonly context = input<'row' | 'view'>('row');
  /** Terminal menu on a row: the terminal runs an agent, so the row opens as chat. */
  readonly agent = input(false);

  protected readonly space = computed<Space | null>(
    () => this.store.spaces().find((s) => s.id === this.spaceId()) ?? null,
  );
  protected readonly spaceIndex = computed(() => this.store.spaces().findIndex((s) => s.id === this.spaceId()));
  protected readonly isLastSpace = computed(() => this.spaceIndex() === this.store.spaces().length - 1);
  protected readonly loc = computed(() => {
    const address = this.address();
    return address === null ? null : locate(this.store.spaces(), address);
  });
  protected readonly closeLabel = computed(() => {
    const loc = this.loc();
    return loc ? `Close ${closeTarget(loc).label}` : 'Close';
  });
  protected readonly triggerLabel = computed(() => {
    const label = this.label();
    if (this.context() === 'view') return 'More';
    return label ? `More actions for ${label}` : 'More actions';
  });
  protected readonly menuName = computed(() => (this.spaceId() !== null ? 'Project actions' : 'Terminal actions'));
  protected readonly isView = computed(() => this.context() === 'view');

  private close(): void {
    this.popover()?.close();
  }

  protected newTab(): void {
    this.close();
    const space = this.space();
    if (space) this.actions.open({ kind: 'new-tab', spaceId: space.id, spaceName: space.name });
    const loc = this.loc();
    if (loc) this.actions.open({ kind: 'new-tab', spaceId: loc.spaceId, spaceName: loc.spaceName });
  }

  protected renameSpace(): void {
    this.close();
    const space = this.space();
    if (space) this.actions.open({ kind: 'rename', target: 'space', id: space.id, name: space.name });
  }

  protected renameTab(): void {
    this.close();
    const address = this.address();
    if (address !== null) this.actions.askRename(address);
  }

  protected move(step: -1 | 1): void {
    this.close();
    const space = this.space();
    if (space) void this.actions.moveSpace(space.id, step);
  }

  protected split(direction: 'right' | 'down'): void {
    this.close();
    const address = this.address();
    if (address !== null) this.actions.askSplit(address, direction);
  }

  protected closeSpace(): void {
    this.close();
    const space = this.space();
    if (space) {
      this.actions.open({
        kind: 'close',
        target: { kind: 'space', id: space.id, label: 'project' },
        name: space.name,
        terminals: spaceTerminals(space),
      });
    }
  }

  protected closeTerminal(): void {
    this.close();
    const address = this.address();
    if (address !== null) this.actions.askClose(address);
  }

  protected openTerminal(): void {
    this.close();
    const address = this.address();
    if (address === null) return;
    this.viewModes.set(address, 'terminal');
    void this.router.navigate(['/t', address]);
  }
}
