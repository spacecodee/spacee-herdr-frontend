import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideFolderOpen, lucidePlus, lucideSearch, lucideSettings } from '@ng-icons/lucide';
import { Router, RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { Summaries } from '../../core/chat/summaries';
import { HcClient } from '../../core/hc/hc-client';
import { TerminalStore, type MachineGroup } from '../../core/hc/terminal-store';
import { summarizeStates, type GroupSummary } from '../../core/hc/group-summary';
import { CollapsedGroups } from '../../core/list/collapsed-groups';
import {
  AGENT_LABEL,
  attention,
  toHome,
  type Conversation,
  type ConversationGroup,
  type PlacedGroup,
} from '../../core/list/conversations';
import { RowSwipe } from '../../core/list/row-swipe';
import { arrangeSpaces } from '../../core/hc/spaces';
import { LayoutActions } from '../../core/layout/layout-actions';
import { AppUpdates } from '../../core/pwa/app-updates';
import { Session } from '../../core/session/session';
import { UpdateCard } from '../update-card/update-card';
import { UsageIndicator } from '../usage/usage-indicator/usage-indicator';
import { AgentAvatar } from './agent-avatar/agent-avatar';
import { ConversationRow } from './conversation-row/conversation-row';
import { ListSection } from './list-section/list-section';
import { RowMenu } from './row-menu/row-menu';

type Connection = 'connecting' | 'reconnecting' | 'live' | 'disconnected';

interface GroupView extends ConversationGroup {
  summary: GroupSummary;
  /** Id of the herdr space the section shows; null for a machine section. */
  spaceId: string | null;
}

@Component({
  selector: 'app-terminal-list',
  imports: [
    AgentAvatar,
    ConversationRow,
    ListSection,
    NgIcon,
    RouterLink,
    RowMenu,
    UpdateCard,
    UsageIndicator,
    ...HlmButtonImports,
    ...HlmEmptyImports,
    ...HlmInputImports,
    ...HlmSkeletonImports,
  ],
  viewProviders: [provideIcons({ lucideChevronRight, lucideFolderOpen, lucidePlus, lucideSearch, lucideSettings })],
  host: {
    '(window:scroll)': 'onScroll()',
    '(document:pointerdown)': 'dismissSwipe($event)',
  },
  templateUrl: './terminal-list.html',
  styleUrl: './terminal-list.css',
})
export class TerminalList implements OnInit {
  private readonly client = inject(HcClient);
  private readonly store = inject(TerminalStore);
  private readonly session = inject(Session);
  private readonly collapsed = inject(CollapsedGroups);
  protected readonly summaries = inject(Summaries);
  protected readonly router = inject(Router);
  protected readonly layout = inject(LayoutActions);
  protected readonly updates = inject(AppUpdates);
  private readonly swipe = inject(RowSwipe);

  /** The page scrolled: the large title shrinks into the bar and the bar gets its edge. */
  protected readonly scrolled = signal(false);
  /** The row whose long-press menu is open, with where it sits on screen. */
  protected readonly menu = signal<{ conversation: Conversation; rect: DOMRect } | null>(null);

  private readonly connecting = signal(false);
  protected readonly query = signal('');

  protected readonly connection = computed<Connection>(() => {
    if (this.client.state() === 'reconnecting') return 'reconnecting';
    if (this.connecting()) return 'connecting';
    // The socket is open but the events channel is still being set up: not a failure.
    if (this.client.state() === 'open' && this.store.syncing()) {
      return this.store.stream() === 'idle' ? 'connecting' : 'reconnecting';
    }
    return this.client.state() === 'open' && this.store.stream() === 'live'
      ? 'live'
      : 'disconnected';
  });

  /** Live terminals placed in their space (desktop order) or, without a layout, their machine. */
  private readonly placed = computed<PlacedGroup[]>(() => {
    const live = this.store
      .groups()
      .flatMap((g) => g.terminals)
      .filter((t) => t.state !== 'finished');
    const spaces = this.store.spaces();
    const arranged = spaces.length > 0 ? arrangeSpaces(spaces, live) : null;
    const other = new Set((arranged ? arranged.other : live).map((t) => t.address));
    const groups: PlacedGroup[] = (arranged?.spaces ?? []).map((space) => ({
      id: `space:${space.id}`,
      name: space.name,
      note: null,
      items: space.tabs.flatMap((tab) => tab.terminals.map((terminal) => ({ terminal, tab: tab.name }))),
    }));
    for (const g of this.store.groups()) {
      const items = g.terminals
        .filter((t) => other.has(t.address))
        .map((terminal) => ({ terminal, tab: '' }));
      const note = g.local || g.state === 'connected' ? null : g.state.replaceAll('_', ' ');
      if (items.length > 0 || note !== null) {
        groups.push({ id: `machine:${g.name}`, name: g.name, note, items });
      }
    }
    return groups;
  });
  private readonly searching = computed(() => this.query().trim() !== '');
  private readonly home = computed(() => toHome(this.placed(), this.summaries.list(), this.query()));
  protected readonly groups = computed<GroupView[]>(() =>
    this.home().groups.map((g) => ({
      ...g,
      summary: summarizeStates(g.conversations.map((c) => c.status)),
      spaceId: g.id.startsWith('space:') ? g.id.slice('space:'.length) : null,
    })),
  );
  protected readonly attention = computed(() =>
    attention(
      this.placed().flatMap((g) => g.items),
      this.summaries.list(),
    ).map((card) => ({ ...card, agentLabel: AGENT_LABEL[card.agent] })),
  );
  /** Skeletons stand in for conversations until the first summaries answer arrives. */
  protected readonly loading = computed(
    () => !this.summaries.loaded() && this.connection() !== 'disconnected' && !this.empty(),
  );
  protected readonly empty = computed(() => this.placed().every((g) => g.items.length === 0));
  protected readonly noMatches = computed(
    () => this.searching() && this.groups().length === 0,
  );
  /** Ids of every section that holds a blocked terminal, so a collapsed one can open itself. */
  private readonly blockedSections = computed(() =>
    this.groups()
      .filter((g) => g.summary.blocked > 0)
      .map((g) => g.id),
  );

  constructor() {
    effect(() => {
      const ids = this.blockedSections();
      untracked(() => this.collapsed.noteBlocked(ids));
    });
    inject(DestroyRef).onDestroy(() => this.summaries.stop());
  }

  ngOnInit(): void {
    this.summaries.start();
    void this.connect();
  }

  protected async connect(): Promise<void> {
    this.connecting.set(true);
    try {
      await this.client.ensureOpen();
      await this.store.ensureStarted();
    } catch {
      // A rejected upgrade (401) and a dead bridge look the same here; ask the bridge which it is.
      if ((await this.session.check()) === 'anonymous') await this.router.navigateByUrl('/login');
    } finally {
      this.connecting.set(false);
    }
  }

  protected onScroll(): void {
    this.scrolled.set(window.scrollY > 24);
    this.swipe.close();
  }

  /** A tap anywhere but the open row closes its swipe actions. */
  protected dismissSwipe(event: Event): void {
    if (this.swipe.open() !== null && !(event.target as Element).closest('[data-swipe-open]')) this.swipe.close();
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
