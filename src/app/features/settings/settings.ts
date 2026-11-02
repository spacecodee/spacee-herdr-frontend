import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  Settings,
} from '../../core/settings/settings';
import { ColorScheme } from '../../core/theme/color-scheme';
import { TERMINAL_THEMES } from '../../core/xterm/terminal-themes';

@Component({
  imports: [RouterLink, ...HlmButtonImports],
  selector: 'app-settings',
  styleUrl: './settings.css',
  templateUrl: './settings.html',
})
export class SettingsPage {
  private readonly settings = inject(Settings);
  private readonly colorScheme = inject(ColorScheme);

  protected readonly min = MIN_FONT_SIZE;
  protected readonly max = MAX_FONT_SIZE;
  protected readonly size = this.settings.terminalFontSize;
  protected readonly palette = computed(() => TERMINAL_THEMES[this.colorScheme.scheme()]);

  protected set(value: string | number): void {
    this.settings.setTerminalFontSize(Number(value));
  }

  protected step(delta: number): void {
    this.settings.setTerminalFontSize(this.size() + delta);
  }
}
