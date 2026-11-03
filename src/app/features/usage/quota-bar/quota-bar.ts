import { Component, computed, input } from '@angular/core';
import { HlmProgressImports } from '@spartan-ng/helm/progress';
import type { Tier } from '../../../core/quota/quota-format';

/** A usage bar: length and color follow what was used; the tick marks how far into the window we are. */
@Component({
  selector: 'app-quota-bar',
  imports: [...HlmProgressImports],
  host: { class: 'block' },
  templateUrl: './quota-bar.html',
  styleUrl: './quota-bar.css',
})
export class QuotaBar {
  /** 0-100. */
  readonly used = input.required<number>();
  readonly tier = input<Tier>('ink');
  /** 0-100, or null when there is nothing to compare with. */
  readonly tick = input<number | null>(null);
  readonly label = input.required<string>();
  readonly thin = input(false);

  protected readonly fill = computed(() => {
    switch (this.tier()) {
      case 'blocked':
        return 'bg-status-blocked';
      case 'low':
      case 'amber':
        return 'bg-amber';
      default:
        return 'bg-foreground';
    }
  });
}
