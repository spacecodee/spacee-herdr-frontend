import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronLeft, lucideCircleAlert, lucideCopy, lucideGitBranch, lucideRefreshCw } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { updatedText } from '../../core/quota/quota-format';
import { Stats } from '../../core/stats/stats';
import { aiSegments, mergedToday, medianText, repoRows, startLabel, weekBars } from '../../core/stats/stats-view';
import { settingsChildBack } from '../settings/back-target';
import { MachineChips } from '../machines/machine-chips/machine-chips';

export const GH_LOGIN_COMMAND = 'gh auth login';

/** Your delivery numbers: PRs merged, how fast, reviews, AI share and a line per repository, counted with `gh` on the chosen machine. */
@Component({
  selector: 'app-stats',
  imports: [MachineChips, NgIcon, ...HlmButtonImports, ...HlmSkeletonImports],
  viewProviders: [provideIcons({ lucideCheck, lucideChevronLeft, lucideCircleAlert, lucideCopy, lucideGitBranch, lucideRefreshCw })],
  templateUrl: './stats.html',
  styleUrl: './stats.css',
})
export class StatsPage {
  private readonly stats = inject(Stats);
  protected readonly loginCommand = GH_LOGIN_COMMAND;

  protected readonly back = settingsChildBack(inject(ActivatedRoute).snapshot.queryParamMap.get('from'));
  protected readonly machine = signal('');
  protected readonly copied = signal(false);
  private readonly now = signal(Date.now());

  private readonly views = new Map<string, ReturnType<Stats['view']>>();
  protected readonly state = computed(() => this.viewOf(this.machine())());

  protected readonly numbers = computed(() => this.state().stats);
  protected readonly top = computed(() => {
    const s = this.numbers();
    return s
      ? [
          { key: 'today', label: 'Today', value: String(mergedToday(s)) },
          { key: 'week', label: 'This week', value: String(s.mergedThisWeek) },
        ]
      : [];
  });
  protected readonly bottom = computed(() => {
    const s = this.numbers();
    return s
      ? [
          { key: 'median', label: 'Median time to merge', value: medianText(s.medianHours) },
          { key: 'open', label: 'Open PRs', value: String(s.open) },
          { key: 'reviews', label: 'Reviews given', value: String(s.reviews.last30) },
          { key: 'rate', label: 'Merge rate', value: s.mergeRate === null ? '—' : `${s.mergeRate}%` },
        ]
      : [];
  });
  protected readonly bars = computed(() => weekBars(this.numbers()?.weeks ?? []));
  protected readonly chartLabel = computed(
    () => `PRs merged per week, oldest first: ${this.bars().map((b) => b.merged).join(', ')}`,
  );
  protected readonly since = computed(() => startLabel(this.numbers()?.weeks ?? []));
  protected readonly ai = computed(() => aiSegments(this.numbers()?.ai ?? { claude: 0, codex: 0, both: 0, none: 0, total: 0 }));
  protected readonly repos = computed(() => repoRows(this.numbers()?.repos ?? []));
  protected readonly updated = computed(() => updatedText(this.state().at, this.now()));
  protected readonly busy = computed(() => this.state().status === 'loading' || this.state().refreshing);

  constructor() {
    // Reads the cache first; asking gh again happens only when it is 30 minutes old or on Refresh.
    effect(() => {
      const machine = this.machine();
      untracked(() => void this.stats.load(machine));
    });
    const clock = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
  }

  protected refresh(): void {
    void this.stats.load(this.machine(), true);
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(GH_LOGIN_COMMAND);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // clipboard blocked: the command stays on screen to copy by hand
    }
  }

  private viewOf(machine: string) {
    let view = this.views.get(machine);
    if (!view) {
      view = this.stats.view(machine);
      this.views.set(machine, view);
    }
    return view;
  }
}
