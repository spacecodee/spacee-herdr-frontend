import { Component, DestroyRef, afterNextRender, computed, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Diagnostics } from '../../core/pwa/diagnostics';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChartNoAxesColumn, lucideCheck, lucideChevronLeft, lucideChevronRight, lucideInfo, lucideRefreshCw } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import {
  MAX_FONT_SIZE,
  MAX_SCROLL_SPEED,
  MIN_FONT_SIZE,
  MIN_SCROLL_SPEED,
  Settings,
  type InputMode,
  type ReturnKey,
} from '../../core/settings/settings';
import { APP_VERSION } from '../../core/pwa/app-version';
import { AppUpdates } from '../../core/pwa/app-updates';
import { Push } from '../../core/pwa/push';
import { Quota } from '../../core/quota/quota';
import { claudeFigures } from '../../core/quota/quota-view';
import { UsageDisplay } from '../../core/quota/usage-display';
import { DevicesSection } from '../devices/devices-section/devices-section';
import { MachinesSection } from '../machines/machines-section/machines-section';
import { UpdateCard } from '../update-card/update-card';
import { backTarget } from './back-target';
import { ColorScheme } from '../../core/theme/color-scheme';
import { TERMINAL_THEMES } from '../../core/xterm/terminal-themes';
import { TERMINAL_FONT_FAMILY } from '../../core/xterm/xterm-factory';

@Component({
  imports: [NgIcon, RouterLink, DevicesSection, MachinesSection, UpdateCard, ...HlmButtonImports, ...HlmSpinnerImports],
  viewProviders: [provideIcons({ lucideChartNoAxesColumn, lucideCheck, lucideChevronLeft, lucideChevronRight, lucideInfo, lucideRefreshCw })],
  selector: 'app-settings',
  styleUrl: './settings.css',
  templateUrl: './settings.html',
})
export class SettingsPage {
  private readonly settings = inject(Settings);
  private readonly colorScheme = inject(ColorScheme);
  private readonly router = inject(Router);
  protected readonly push = inject(Push);
  protected readonly diagnostics = inject(Diagnostics);
  protected readonly updates = inject(AppUpdates);
  protected readonly version = APP_VERSION;
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
  private readonly quota = inject(Quota);
  private readonly usageDisplay = inject(UsageDisplay);
  private readonly usage = this.quota.view('');
  /** "Claude 72%": the 5-hour window of this machine, as used or as left like the Usage screen. */
  protected readonly usageFigure = computed(() => {
    const session = claudeFigures(this.usage().report?.providers ?? []).session;
    if (!session) return '';
    return `Claude ${this.usageDisplay.remaining() ? 100 - session.percentUsed : session.percentUsed}%`;
  });
  protected readonly palette = computed(() => TERMINAL_THEMES[this.colorScheme.scheme()]);

  constructor() {
    const win = inject(DOCUMENT).defaultView;
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(this.quota.track(''));
    afterNextRender(() => {
      const refresh = () => this.diagnostics.refresh();
      refresh();
      win?.addEventListener('resize', refresh);
      win?.visualViewport?.addEventListener('resize', refresh);
      destroyRef.onDestroy(() => {
        win?.removeEventListener('resize', refresh);
        win?.visualViewport?.removeEventListener('resize', refresh);
      });
    });
  }

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
