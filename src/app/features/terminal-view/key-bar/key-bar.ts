import { Component, input, model, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowLeft,
  lucideArrowRight,
  lucideArrowUp,
  lucideCornerDownLeft,
  lucideKeyboard,
  lucideMessageSquare,
} from '@ng-icons/lucide';
import type { BarKey } from '../../../core/xterm/key-bytes';

@Component({
  selector: 'app-key-bar',
  imports: [NgIcon],
  viewProviders: [
    provideIcons({
      lucideArrowDown,
      lucideArrowLeft,
      lucideArrowRight,
      lucideArrowUp,
      lucideCornerDownLeft,
      lucideKeyboard,
      lucideMessageSquare,
    }),
  ],
  styleUrl: './key-bar.css',
  templateUrl: './key-bar.html',
})
export class KeyBar {
  readonly disabled = input(false);
  /** One-shot Ctrl modifier; the parent clears it once a key consumed it. */
  readonly ctrl = model(false);
  /** Where typing goes: the message field (`compose`) or xterm itself (`direct`). */
  readonly mode = input<'compose' | 'direct'>('compose');
  /** The iOS keyboard covers the home-indicator area, so no bottom inset is needed. */
  readonly keyboardOpen = input(false);
  readonly modeToggle = output<void>();
  readonly key = output<BarKey>();

  /** Keeps focus on the terminal so the iOS keyboard stays open. */
  protected keepFocus(event: Event): void {
    event.preventDefault();
  }

  protected toggleCtrl(): void {
    this.ctrl.update((on) => !on);
  }
}
