import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmToaster } from '@spartan-ng/helm/sonner';
import { LayoutHost } from './features/layout/layout-host/layout-host';
import { AppUpdates } from './core/pwa/app-updates';
import { Push } from './core/pwa/push';
import { LayoutActions } from './core/layout/layout-actions';
import { ColorScheme } from './core/theme/color-scheme';

@Component({
  selector: 'app-root',
  imports: [LayoutHost, RouterOutlet, HlmToaster],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  /** The layout sheets load on the first request; `when` stays true once the host is in. */
  protected readonly layout = inject(LayoutActions);
  /** Injected so the `dark` class tracks the system scheme on every route. */
  protected readonly colorScheme = inject(ColorScheme);
  /** Injected so the update check starts with the app; the card itself lives in each screen. */
  protected readonly updates = inject(AppUpdates);
  /** Injected so an existing push subscription is re-sent to the bridge on every start. */
  protected readonly push = inject(Push);
}
