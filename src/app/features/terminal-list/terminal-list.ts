import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HcClient } from '../../core/hc/hc-client';
import { TerminalStore, type MachineGroup } from '../../core/hc/terminal-store';
import type { Terminal } from '../../core/hc/types';
import { Session } from '../../core/session/session';

type Connection = 'connecting' | 'live' | 'disconnected';

/** Text always rides with the color; every pair is >= 4.5:1 (white on *-700/800, dark on light). */
const BADGE: Record<string, string> = {
  blocked: 'bg-red-700 text-white ring-2 ring-red-700/40',
  working: 'bg-blue-800 text-white',
  done: 'bg-green-800 text-white',
  error: 'bg-rose-950 text-white',
  idle: 'bg-zinc-200 text-zinc-900',
};
const BADGE_OTHER = 'bg-zinc-200 text-zinc-900';

const RANK: Record<string, number> = { blocked: 0, working: 1 };

const byAddress = (a: Terminal, b: Terminal) =>
  a.address.localeCompare(b.address, undefined, { numeric: true });

function sortTerminals(terminals: Terminal[]): Terminal[] {
  const rank = (t: Terminal) => RANK[t.status?.state ?? ''] ?? 2;
  return terminals.filter((t) => t.state !== 'finished').sort((a, b) => rank(a) - rank(b) || byAddress(a, b));
}

@Component({
  selector: 'app-terminal-list',
  imports: [...HlmButtonImports, ...HlmEmptyImports],
  templateUrl: './terminal-list.html',
  styleUrl: './terminal-list.css',
})
export class TerminalList implements OnInit {
  private readonly client = inject(HcClient);
  private readonly store = inject(TerminalStore);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  private readonly connecting = signal(false);

  protected readonly connection = computed<Connection>(() => {
    if (this.connecting()) return 'connecting';
    return this.client.state() === 'open' && this.store.stream() === 'live' ? 'live' : 'disconnected';
  });

  protected readonly sections = computed<MachineGroup[]>(() =>
    this.store.groups().map((g) => ({ ...g, terminals: sortTerminals(g.terminals) })),
  );
  protected readonly empty = computed(() => this.sections().every((g) => g.terminals.length === 0));

  ngOnInit(): void {
    void this.connect();
  }

  protected async connect(): Promise<void> {
    this.connecting.set(true);
    try {
      if (this.client.state() !== 'open') await this.client.connect();
      await this.store.start();
    } catch {
      // A rejected upgrade (401) and a dead bridge look the same here; ask the bridge which it is.
      if ((await this.session.check()) === 'anonymous') await this.router.navigateByUrl('/login');
    } finally {
      this.connecting.set(false);
    }
  }

  protected badge(state: string): string {
    return BADGE[state] ?? BADGE_OTHER;
  }

  protected machineState(group: MachineGroup): string | null {
    return group.local || group.state === 'connected' ? null : group.state.replaceAll('_', ' ');
  }
}
