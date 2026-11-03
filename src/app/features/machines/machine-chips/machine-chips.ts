import { Component, computed, inject, model } from '@angular/core';
import { Machines } from '../../../core/machines/machines';

/** Picks a machine: this one first (`''`), then the added ones; the ones that are not connected cannot run anything, so they are disabled. */
@Component({
  selector: 'app-machine-chips',
  templateUrl: './machine-chips.html',
  styleUrl: './machine-chips.css',
})
export class MachineChips {
  private readonly machines = inject(Machines);

  /** `''` for the core this app talks to, else the added machine's name. */
  readonly machine = model('');

  protected readonly chips = computed(() =>
    this.machines
      .rows()
      .map((r) => ({ value: r.local ? '' : r.name, label: r.name, online: r.local || r.status?.kind === 'connected' })),
  );
}
