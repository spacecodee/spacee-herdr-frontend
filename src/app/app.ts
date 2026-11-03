import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { LayoutHost } from './features/layout/layout-host/layout-host';
import { AppUpdates } from './core/pwa/app-updates';
import { Push } from './core/pwa/push';
import { ColorScheme } from './core/theme/color-scheme';

@Component({
  selector: 'app-root',
  imports: [LayoutHost, RouterOutlet, HlmToasterImports],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  /** Injected so the `dark` class tracks the system scheme on every route. */
  protected readonly colorScheme = inject(ColorScheme);
  /** Injected so the update check starts with the app; the card itself lives in each screen. */
  protected readonly updates = inject(AppUpdates);
  /** Injected so an existing push subscription is re-sent to the bridge on every start. */
  protected readonly push = inject(Push);
}
