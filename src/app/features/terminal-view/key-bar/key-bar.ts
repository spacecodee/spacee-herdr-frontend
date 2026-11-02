import { Component, input, model, output } from '@angular/core';
import type { BarKey } from '../../../core/xterm/key-bytes';

@Component({
  selector: 'app-key-bar',
  styleUrl: './key-bar.css',
  templateUrl: './key-bar.html',
})
export class KeyBar {
  readonly disabled = input(false);
  /** One-shot Ctrl modifier; the parent clears it once a key consumed it. */
  readonly ctrl = model(false);
  readonly key = output<BarKey>();

  /** Keeps focus on the terminal so the iOS keyboard stays open. */
  protected keepFocus(event: Event): void {
    event.preventDefault();
  }

  protected toggleCtrl(): void {
    this.ctrl.update((on) => !on);
  }
}
