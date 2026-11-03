import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideUnplug } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';

/**
 * Shown over the dimmed last frame when the terminal is gone: what happened, a way to reattach
 * (when that can work) and a way back.
 */
@Component({
  selector: 'app-connection-card',
  imports: [RouterLink, NgIcon, ...HlmButtonImports],
  viewProviders: [provideIcons({ lucideUnplug })],
  host: { class: 'block' },
  styleUrl: './connection-card.css',
  templateUrl: './connection-card.html',
})
export class ConnectionCard {
  /** `alert` for failures, `status` for an ordinary ending. */
  readonly role = input<'alert' | 'status'>('alert');
  readonly title = input('Disconnected');
  readonly text = input.required<string>();
  readonly canReattach = input(false);
  readonly reattach = output<void>();
}
