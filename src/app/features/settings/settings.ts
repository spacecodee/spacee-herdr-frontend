import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  MAX_FONT_SIZE,
  MAX_SCROLL_SPEED,
  MIN_FONT_SIZE,
  MIN_SCROLL_SPEED,
  Settings,
  type InputMode,
  type ReturnKey,
} from '../../core/settings/settings';
import { Push } from '../../core/pwa/push';
import { backTarget } from './back-target';
import { ColorScheme } from '../../core/theme/color-scheme';
import { TERMINAL_THEMES } from '../../core/xterm/terminal-themes';
import { TERMINAL_FONT_FAMILY } from '../../core/xterm/xterm-factory';

@Component({
  imports: [...HlmButtonImports],
  selector: 'app-settings',
  styleUrl: './settings.css',
  templateUrl: './settings.html',
})
export class SettingsPage {
  private readonly settings = inject(Settings);
  private readonly colorScheme = inject(ColorScheme);
  private readonly router = inject(Router);
  protected readonly push = inject(Push);
  protected readonly back = backTarget(
    inject(ActivatedRoute).snapshot.queryParamMap.get('from'),
  );

  protected readonly min = MIN_FONT_SIZE;
  protected readonly max = MAX_FONT_SIZE;
  protected readonly minSpeed = MIN_SCROLL_SPEED;
  protected readonly maxSpeed = MAX_SCROLL_SPEED;
  protected readonly fontFamily = TERMINAL_FONT_FAMILY;
  protected readonly mode = this.settings.inputMode;
  protected readonly returnKey = this.settings.returnKey;
  protected readonly speed = this.settings.scrollSpeed;
  protected readonly size = this.settings.terminalFontSize;
  protected readonly palette = computed(() => TERMINAL_THEMES[this.colorScheme.scheme()]);

  protected setMode(mode: InputMode): void {
    this.settings.setInputMode(mode);
  }

  protected setReturnKey(key: ReturnKey): void {
    this.settings.setReturnKey(key);
  }

  protected goBack(event: Event): void {
    event.preventDefault();
    void this.router.navigateByUrl(this.back, { replaceUrl: true });
  }

  protected set(value: string | number): void {
    this.settings.setTerminalFontSize(Number(value));
  }

  protected setSpeed(value: string | number): void {
    this.settings.setScrollSpeed(Number(value));
  }

  protected stepSpeed(delta: number): void {
    this.settings.setScrollSpeed(this.speed() + delta);
  }

  protected step(delta: number): void {
    this.settings.setTerminalFontSize(this.size() + delta);
  }
}
