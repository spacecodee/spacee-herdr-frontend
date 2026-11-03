import { Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRefreshCw } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { AppUpdates } from '../../core/pwa/app-updates';

/**
 * The "Update ready" card. Sits in the page flow at the bottom of a screen (sticky on scrolling
 * pages, above the compose bar in chat and terminal), so content scrolls above it and it never
 * covers the header. Hidden for the session after "Later".
 */
@Component({
  selector: 'app-update-card',
  imports: [NgIcon, ...HlmButtonImports, ...HlmSpinnerImports],
  viewProviders: [provideIcons({ lucideRefreshCw })],
  host: { class: 'block' },
  styleUrl: './update-card.css',
  templateUrl: './update-card.html',
})
export class UpdateCard {
  protected readonly updates = inject(AppUpdates);
}
