import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideCheck,
  lucideCopy,
  lucideDownload,
  lucideMonitor,
  lucidePencil,
  lucidePlus,
  lucideRefreshCw,
  lucideServer,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { hostProblem, machineNameProblem } from '../../../core/machines/machine-format';
import { Machines, type MachineRow, type Outcome } from '../../../core/machines/machines';

type View = 'none' | 'actions' | 'add' | 'rename' | 'remove';

/** Settings → Machines: this machine, the ones added over ssh, their state and what to do about it. */
@Component({
  selector: 'app-machines-section',
  imports: [NgIcon, ...HlmAlertDialogImports, ...HlmButtonImports, ...HlmInputImports, ...HlmLabelImports, ...HlmSheetImports],
  viewProviders: [
    provideIcons({
      lucideCheck,
      lucideChevronRight,
      lucideCopy,
      lucideDownload,
      lucideMonitor,
      lucidePencil,
      lucidePlus,
      lucideRefreshCw,
      lucideServer,
      lucideTrash2,
    }),
  ],
  templateUrl: './machines-section.html',
  styleUrl: './machines-section.css',
})
export class MachinesSection {
  protected readonly machines = inject(Machines);

  protected readonly view = signal<View>('none');
  /** The machine the open sheet or dialog is about; kept while it slides out so its content stays. */
  protected readonly target = signal<MachineRow | null>(null);
  protected readonly host = signal('');
  protected readonly name = signal('');
  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  /** What was just copied (`login:gandalf`, `update:gandalf`), for the checkmark and the note. */
  protected readonly copied = signal('');
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly actionsState = computed(() => (this.view() === 'actions' ? 'open' : 'closed'));
  protected readonly addState = computed(() => (this.view() === 'add' ? 'open' : 'closed'));
  protected readonly renameState = computed(() => (this.view() === 'rename' ? 'open' : 'closed'));
  protected readonly removeState = computed(() => (this.view() === 'remove' ? 'open' : 'closed'));
  protected readonly hostError = computed(() => (this.submitted() ? hostProblem(this.host()) : ''));
  protected readonly nameError = computed(() =>
    this.submitted() ? machineNameProblem(this.name(), this.view() === 'rename') : '',
  );
  /** The target's row as it is now (its status changes while a sheet is open). */
  protected readonly current = computed(() => {
    const target = this.target();
    return this.machines.rows().find((row) => row.name === target?.name) ?? target;
  });

  constructor() {
    void this.machines.load();
  }

  protected loginCommand(row: MachineRow): string {
    return `hc machine login ${row.name}`;
  }

  protected updateCommand(row: MachineRow): string {
    return `hc machine update ${row.name}`;
  }

  protected open(view: View, row: MachineRow | null = this.target()): void {
    this.target.set(row);
    this.failure.set('');
    this.submitted.set(false);
    this.copied.set('');
    if (view === 'add') {
      this.host.set('');
      this.name.set('');
    }
    if (view === 'rename') this.name.set(row?.name ?? '');
    this.view.set(view);
  }

  /** A sheet reports `closed` also when we switch away from it: only its own view may reset. */
  protected close(view: View): void {
    if (this.view() === view && !this.busy()) this.view.set('none');
  }

  protected setHost(event: Event): void {
    this.host.set((event.target as HTMLInputElement).value);
  }

  protected setName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected async copy(key: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    this.copied.set(key);
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(''), 2000);
  }

  protected add(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    if (hostProblem(this.host()) || machineNameProblem(this.name())) return Promise.resolve();
    return this.run(() => this.machines.add(this.host(), this.name()));
  }

  protected rename(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    const row = this.target();
    if (!row || machineNameProblem(this.name(), true)) return Promise.resolve();
    return this.run(() => this.machines.rename(row.name, this.name()));
  }

  protected reconnect(): Promise<void> {
    const row = this.target();
    return row ? this.run(() => this.machines.reconnect(row.name)) : Promise.resolve();
  }

  protected remove(): Promise<void> {
    const row = this.target();
    return row ? this.run(() => this.machines.remove(row.name)) : Promise.resolve();
  }

  private async run(action: () => Promise<Outcome>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.failure.set('');
    const outcome = await action();
    this.busy.set(false);
    if (outcome.ok) this.view.set('none');
    else this.failure.set(outcome.message);
  }
}
