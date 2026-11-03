import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronLeft, lucideCopy, lucideKeyRound, lucideMinus, lucidePackage, lucideRefreshCw, lucideTrendingDown, lucideTrendingUp } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { Machines } from '../../../core/machines/machines';
import { Quota } from '../../../core/quota/quota';
import { updatedText } from '../../../core/quota/quota-format';
import { barOf, planLabel, providerAgent, providerName, shownProviders } from '../../../core/quota/quota-view';
import { UsageDisplay } from '../../../core/quota/usage-display';
import { AgentAvatar } from '../../terminal-list/agent-avatar/agent-avatar';
import { settingsChildBack } from '../../settings/back-target';
import { MachineChips } from '../../machines/machine-chips/machine-chips';
import { QuotaBar } from '../quota-bar/quota-bar';

export const INSTALL_COMMAND = 'npm install -g quota-axi';

/** Agent quota per machine: the plan limits quota-axi reports, with how fast they are being used. */
@Component({
  selector: 'app-usage',
  imports: [AgentAvatar, MachineChips, NgIcon, QuotaBar, ...HlmButtonImports, ...HlmSkeletonImports, ...HlmSwitchImports],
  viewProviders: [provideIcons({ lucideCheck, lucideChevronLeft, lucideCopy, lucideKeyRound, lucideMinus, lucidePackage, lucideRefreshCw, lucideTrendingDown, lucideTrendingUp })],
  templateUrl: './usage.html',
  styleUrl: './usage.css',
})
export class Usage {
  private readonly quota = inject(Quota);
  private readonly machines = inject(Machines);
  protected readonly display = inject(UsageDisplay);
  protected readonly installCommand = INSTALL_COMMAND;

  protected readonly back = settingsChildBack(inject(ActivatedRoute).snapshot.queryParamMap.get('from'));
  protected readonly machine = signal('');
  protected readonly copied = signal(false);
  private readonly now = signal(Date.now());

  private readonly views = new Map<string, ReturnType<Quota['view']>>();
  protected readonly state = computed(() => this.viewOf(this.machine())());

  protected readonly shown = computed(() => shownProviders(this.state().report?.providers ?? []));
  protected readonly cards = computed(() =>
    this.shown().cards.map((p) => ({
      name: providerName(p.provider),
      agent: providerAgent(p.provider),
      plan: planLabel(p.plan),
      error: p.status === 'error',
      bars: p.windows.map((w) => barOf(w, this.now(), this.display.remaining())),
    })),
  );
  protected readonly updated = computed(() => updatedText(this.state().at, this.now()));
  protected readonly machineLabel = computed(() => this.machines.rows().find((r) => (r.local ? '' : r.name) === this.machine())?.name ?? this.machine());

  constructor() {
    effect((onCleanup) => onCleanup(this.quota.track(this.machine())));
    const clock = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
  }

  protected refresh(): void {
    void this.quota.load(this.machine());
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // clipboard blocked: the command stays on screen to copy by hand
    }
  }

  private viewOf(machine: string) {
    let view = this.views.get(machine);
    if (!view) {
      view = this.quota.view(machine);
      this.views.set(machine, view);
    }
    return view;
  }
}
