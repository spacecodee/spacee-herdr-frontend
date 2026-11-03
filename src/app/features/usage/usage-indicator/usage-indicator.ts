import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Quota } from '../../../core/quota/quota';
import { barOf, claudeFigures } from '../../../core/quota/quota-view';
import { UsageDisplay } from '../../../core/quota/usage-display';
import { QuotaBar } from '../quota-bar/quota-bar';

/** Home header: this machine's Claude 5-hour and weekly bars; a tap opens Usage. Hidden until there are numbers. */
@Component({
  selector: 'app-usage-indicator',
  imports: [QuotaBar, RouterLink],
  host: { '[class.hidden]': '!bars().length' },
  templateUrl: './usage-indicator.html',
  styleUrl: './usage-indicator.css',
})
export class UsageIndicator {
  private readonly quota = inject(Quota);
  private readonly display = inject(UsageDisplay);
  protected readonly router = inject(Router);
  private readonly state = this.quota.view('');
  private readonly now = signal(Date.now());

  protected readonly bars = computed(() => {
    const { session, weekly } = claudeFigures(this.state().report?.providers ?? []);
    return [session, weekly].filter((w) => w !== null).map((w) => barOf(w, this.now(), this.display.remaining()));
  });

  protected readonly summary = computed(
    () => 'Usage. Claude ' + this.bars().map((b) => `${b.label} ${b.figure}`).join(', '),
  );

  constructor() {
    const stop = this.quota.track('');
    const clock = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => {
      stop();
      clearInterval(clock);
    });
  }
}
