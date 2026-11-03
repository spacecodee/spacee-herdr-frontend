import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCopy } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { countdown, formatCode } from '../../../core/devices/device-format';
import { Devices, type Pairing } from '../../../core/devices/devices';
import { qrCode } from '../../../core/devices/qr';

/** The sheet that makes a one-time code (and its QR) for signing in a new device. */
@Component({
  selector: 'app-pairing-sheet',
  imports: [NgIcon, ...HlmButtonImports, ...HlmSheetImports, ...HlmSpinnerImports],
  viewProviders: [provideIcons({ lucideCheck, lucideCopy })],
  templateUrl: './pairing-sheet.html',
  styleUrl: './pairing-sheet.css',
})
export class PairingSheet {
  private readonly devices = inject(Devices);
  private readonly origin = inject(DOCUMENT).location.origin;

  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  protected readonly state = computed(() => (this.open() ? 'open' : 'closed'));
  protected readonly pairing = signal<Pairing | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly copied = signal(false);
  private readonly now = signal(Date.now());

  protected readonly remaining = computed(() => (this.pairing()?.expires ?? 0) - this.now());
  protected readonly expired = computed(() => this.pairing() !== null && this.remaining() <= 0);
  protected readonly expiry = computed(() => countdown(this.remaining()));
  protected readonly shownCode = computed(() => formatCode(this.pairing()?.code ?? ''));
  protected readonly link = computed(() => `${this.origin}/login?code=${this.pairing()?.code ?? ''}`);
  protected readonly qr = computed(() => (this.pairing() && !this.expired() ? qrCode(this.link()) : null));

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect((onCleanup) => {
      if (!this.open()) return;
      untracked(() => void this.refresh());
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      onCleanup(() => clearInterval(timer));
    });
    destroyRef.onDestroy(() => this.copyTimer && clearTimeout(this.copyTimer));
  }

  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    this.copied.set(false);
    const pairing = await this.devices.pair();
    this.now.set(Date.now());
    this.pairing.set(pairing);
    this.failed.set(pairing === null);
    this.loading.set(false);
  }

  protected async copy(): Promise<void> {
    const code = this.pairing()?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    this.copied.set(true);
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }
}
