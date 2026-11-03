import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSettings } from '@ng-icons/lucide';
import { Router, RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HcClient } from '../../core/hc/hc-client';
import { TerminalStore, type MachineGroup } from '../../core/hc/terminal-store';
import { summarize, type GroupSummary } from '../../core/hc/group-summary';
import { CollapsedGroups } from '../../core/list/collapsed-groups';
import { arrangeSpaces, type ArrangedSpace } from '../../core/hc/spaces';
import type { Terminal } from '../../core/hc/types';
import { Session } from '../../core/session/session';
import { StatusLabel } from '../status-label/status-label';
import { ListSection } from './list-section/list-section';

type Connection = 'connecting' | 'reconnecting' | 'live' | 'disconnected';

const RANK: Record<string, number> = { blocked: 0, working: 1 };

const byAddress = (a: Terminal, b: Terminal) =>
  a.address.localeCompare(b.address, undefined, { numeric: true });

function sortTerminals(terminals: Terminal[]): Terminal[] {
  const rank = (t: Terminal) => RANK[t.status?.state ?? ''] ?? 2;
  return terminals
    .filter((t) => t.state !== 'finished')
    .sort((a, b) => rank(a) - rank(b) || byAddress(a, b));
}

interface TabView {
  id: string;
  name: string;
  terminals: Terminal[];
  summary: GroupSummary;
}

interface SpaceView {
  id: string;
  name: string;
  tabs: TabView[];
  summary: GroupSummary;
}

interface MachineView {
  name: string;
  terminals: Terminal[];
  summary: GroupSummary;
  note: string | null;
}

@Component({
  selector: 'app-terminal-list',
  imports: [
    ListSection,
    NgIcon,
    NgTemplateOutlet,
    RouterLink,
    StatusLabel,
    ...HlmButtonImports,
    ...HlmEmptyImports,
  ],
  viewProviders: [provideIcons({ lucideSettings })],
  templateUrl: './terminal-list.html',
  styleUrl: './terminal-list.css',
})
export class TerminalList implements OnInit {
  private readonly client = inject(HcClient);
  private readonly store = inject(TerminalStore);
  private readonly session = inject(Session);
  private readonly collapsed = inject(CollapsedGroups);
  protected readonly router = inject(Router);

  private readonly connecting = signal(false);

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

  protected readonly sections = computed<MachineGroup[]>(() =>
    this.store.groups().map((g) => ({ ...g, terminals: sortTerminals(g.terminals) })),
  );
  private readonly arranged = computed(() => {
    const spaces = this.store.spaces();
    if (spaces.length === 0) return null;
    const live = this.store
      .groups()
      .flatMap((g) => g.terminals)
      .filter((t) => t.state !== 'finished');
    return arrangeSpaces(spaces, live);
  });
  /** Spaces from the desktop layout; empty when there is no layout (machine grouping only). */
  protected readonly spaceSections = computed<ArrangedSpace[]>(() => this.arranged()?.spaces ?? []);
  /** Machine groups of what no tab holds; every machine group when there is no layout. */
  protected readonly machineSections = computed<MachineGroup[]>(() => {
    const arranged = this.arranged();
    if (!arranged) return this.sections();
    const other = new Set(arranged.other.map((t) => t.address));
    return this.sections()
      .map((g) => ({ ...g, terminals: g.terminals.filter((t) => other.has(t.address)) }))
      .filter((g) => g.terminals.length > 0 || this.machineState(g) !== null);
  });
  protected readonly spaceViews = computed<SpaceView[]>(() =>
    this.spaceSections().map((space) => ({
      id: space.id,
      name: space.name,
      summary: summarize(space.tabs.flatMap((tab) => tab.terminals)),
      tabs: space.tabs.map((tab) => ({ ...tab, summary: summarize(tab.terminals) })),
    })),
  );
  protected readonly machineViews = computed<MachineView[]>(() =>
    this.machineSections().map((group) => ({
      name: group.name,
      terminals: group.terminals,
      summary: summarize(group.terminals),
      note: this.machineState(group),
    })),
  );
  protected readonly otherSummary = computed(() =>
    summarize(this.machineSections().flatMap((group) => group.terminals)),
  );
  /** Ids of every section that holds a blocked terminal, so a collapsed one can open itself. */
  private readonly blockedSections = computed(() => {
    const ids: string[] = [];
    for (const space of this.spaceViews()) {
      if (space.summary.kind === 'blocked') ids.push(`space:${space.id}`);
      for (const tab of space.tabs) if (tab.summary.kind === 'blocked') ids.push(`tab:${tab.id}`);
    }
    if (this.otherSummary().kind === 'blocked') ids.push('other');
    for (const machine of this.machineViews()) {
      if (machine.summary.kind === 'blocked') ids.push(`machine:${machine.name}`);
    }
    return ids;
  });
  protected readonly showOther = computed(
    () => this.spaceSections().length > 0 && this.machineSections().length > 0,
  );
  protected readonly empty = computed(() => this.sections().every((g) => g.terminals.length === 0));

  constructor() {
    effect(() => {
      const ids = this.blockedSections();
      untracked(() => this.collapsed.noteBlocked(ids));
    });
  }

  ngOnInit(): void {
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

  protected label(t: Terminal): string {
    const name = t.name || t.address;
    return t.title ? `${name}, ${t.title}` : name;
  }

  protected machineState(group: MachineGroup): string | null {
    return group.local || group.state === 'connected' ? null : group.state.replaceAll('_', ' ');
  }
}
