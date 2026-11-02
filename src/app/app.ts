import { Component, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { toast } from '@spartan-ng/brain/sonner';
import { AppUpdates } from './core/pwa/app-updates';
import { Push } from './core/pwa/push';
import { ColorScheme } from './core/theme/color-scheme';

/** Largest delay setTimeout accepts (~24 days): sonner does not treat Infinity as "stay" and would close the toast at once. */
const STAY_OPEN_MS = 2_147_483_647;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HlmToasterImports],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  /** Injected so the `dark` class tracks the system scheme on every route. */
  protected readonly colorScheme = inject(ColorScheme);
  private readonly updates = inject(AppUpdates);
  /** Injected so an existing push subscription is re-sent to the bridge on every start. */
  protected readonly push = inject(Push);

  constructor() {
    effect(() => {
      if (!this.updates.updateReady()) return;
      // untracked: toast() reads and writes sonner's own signals, which would re-run this effect.
      untracked(() =>
        toast('New version available', {
          duration: STAY_OPEN_MS,
          action: { label: 'Reload', onClick: () => void this.updates.applyUpdate() },
        }),
      );
    });
  }
}
