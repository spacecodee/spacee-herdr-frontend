import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ColorScheme } from './core/theme/color-scheme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  /** Injected so the `dark` class tracks the system scheme on every route. */
  private readonly colorScheme = inject(ColorScheme);
}
