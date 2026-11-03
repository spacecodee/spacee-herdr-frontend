import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideMonitor, lucidePencil, lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { lastSeenLabel, nameProblem, platformMark, signedInLabel } from '../../../core/devices/device-format';
import { Devices, type Device } from '../../../core/devices/devices';
import { PairingSheet } from '../pairing-sheet/pairing-sheet';

type View = 'none' | 'actions' | 'rename' | 'signout' | 'pair';

/** Settings → Devices: who is signed in, add a device, rename or sign one out. */
@Component({
  selector: 'app-devices-section',
  imports: [
    NgIcon,
    PairingSheet,
    ...HlmAlertDialogImports,
    ...HlmButtonImports,
    ...HlmInputImports,
    ...HlmLabelImports,
    ...HlmSheetImports,
  ],
  viewProviders: [provideIcons({ lucideChevronRight, lucideMonitor, lucidePencil, lucidePlus, lucideTrash2 })],
  templateUrl: './devices-section.html',
  styleUrl: './devices-section.css',
})
export class DevicesSection {
  protected readonly devices = inject(Devices);

  protected readonly view = signal<View>('none');
  /** The device the open sheet or dialog is about; kept while it slides out so its content stays. */
  protected readonly target = signal<Device | null>(null);
  protected readonly name = signal('');
  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  private readonly now = signal(Date.now());

  protected readonly actionsState = computed(() => (this.view() === 'actions' ? 'open' : 'closed'));
  protected readonly renameState = computed(() => (this.view() === 'rename' ? 'open' : 'closed'));
  protected readonly signoutState = computed(() => (this.view() === 'signout' ? 'open' : 'closed'));
  protected readonly pairing = computed(() => this.view() === 'pair');
  protected readonly problem = computed(() => (this.submitted() ? nameProblem(this.name()) : ''));

  protected readonly rows = computed(() =>
    (this.devices.list() ?? []).map((device) => ({
      device,
      mark: platformMark(device.platform),
      seen: lastSeenLabel(device.lastSeen, this.now()),
      signedIn: signedInLabel(device.created),
    })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    await this.devices.load();
    this.now.set(Date.now());
  }

  protected open(view: View, device: Device | null = this.target()): void {
    this.target.set(device);
    this.failure.set('');
    this.submitted.set(false);
    if (view === 'rename') this.name.set(device?.name ?? '');
    this.view.set(view);
  }

  /** A sheet reports `closed` also when we switch away from it: only its own view may reset. */
  protected close(view: View): void {
    if (this.view() === view && !this.busy()) this.view.set('none');
  }

  protected setName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected async rename(event: Event): Promise<void> {
    event.preventDefault();
    const device = this.target();
    this.submitted.set(true);
    if (!device || this.busy() || nameProblem(this.name())) return;
    this.busy.set(true);
    const ok = await this.devices.rename(device.id, this.name());
    this.busy.set(false);
    if (ok) this.view.set('none');
    else this.failure.set('Could not rename the device. Try again.');
  }

  protected async signOut(): Promise<void> {
    const device = this.target();
    if (!device || this.busy()) return;
    this.busy.set(true);
    const ok = await this.devices.signOut(device);
    this.busy.set(false);
    if (ok) this.view.set('none');
    else this.failure.set('Could not sign out the device. Try again.');
  }
}
