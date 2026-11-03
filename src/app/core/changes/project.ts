import { computed, inject, type Signal } from '@angular/core';
import { HcClient } from '../hc/hc-client';
import { TerminalStore, machineOf } from '../hc/terminal-store';

export interface Project {
  /** The machine the terminal runs on: `''` for the core this app talks to. */
  machine: string;
  /** The terminal's working folder, `''` until the terminal list has arrived. */
  cwd: Signal<string>;
}

/** Where the terminal `address` works: its machine and folder. The list is started if a deep link got here first. */
export function injectProject(address: string): Project {
  const store = inject(TerminalStore);
  const client = inject(HcClient);
  void client
    .ensureOpen()
    .then(() => store.ensureStarted())
    .catch(() => undefined);
  return {
    machine: machineOf(address) ?? '',
    cwd: computed(() => store.terminals().find((t) => t.address === address)?.cwd ?? ''),
  };
}
