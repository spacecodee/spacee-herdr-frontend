import { Service, computed, inject } from '@angular/core';
import { HcClient, HcError } from '../hc/hc-client';
import { TerminalStore } from '../hc/terminal-store';
import type { MachineView } from '../hc/types';
import { addProblem, machineStatus, terminalCount, writeProblem, type MachineStatus } from './machine-format';

export interface MachineRow {
  name: string;
  /** The ssh target (or command) core reaches it with; empty for this machine. */
  target: string;
  local: boolean;
  status: MachineStatus | null;
}

/** `ok: false` carries a sentence for the person, not a code. */
export type Outcome = { ok: true } | { ok: false; message: string };

function kindOf(error: unknown): string {
  return error instanceof HcError ? error.kind : 'unknown';
}

/** The machines this core knows (`machine.*`): this one first, then the added ones. */
@Service()
export class Machines {
  private readonly client = inject(HcClient);
  private readonly store = inject(TerminalStore);

  /** The core this app talks to, as the rows and the login hint call it. */
  readonly localName = computed(() => this.client.hello()?.core.name ?? 'this machine');

  readonly rows = computed<MachineRow[]>(() => {
    const localVersion = this.client.hello()?.version;
    const groups = new Map(this.store.groups().map((g) => [g.name, g]));
    const local: MachineRow = {
      name: this.localName(),
      target: '',
      local: true,
      status: null,
    };
    const remote = this.store.machines().map<MachineRow>((m) => ({
      name: m.name,
      target: m.target,
      local: false,
      status: machineStatus(m, localVersion, terminalCount(groups.get(m.name)?.terminals ?? [])),
    }));
    return [local, ...remote];
  });

  load(): Promise<void> {
    return this.store.refreshMachines();
  }

  async add(host: string, name: string): Promise<Outcome> {
    const target = host.trim();
    const label = name.trim();
    return this.write(() => this.client.call('machine.add', { target, ...(label ? { name: label } : {}) }), (k) =>
      addProblem(k, target),
    );
  }

  rename(machine: string, newName: string): Promise<Outcome> {
    return this.write(
      () => this.client.call('machine.rename', { machine, new_name: newName.trim() }),
      (k) => writeProblem(k, 'rename'),
    );
  }

  reconnect(machine: string): Promise<Outcome> {
    return this.write(
      () => this.client.call<MachineView>('machine.connect', { machine }),
      (k) => writeProblem(k, 'reconnect'),
    );
  }

  /** Its terminals keep running there; here it leaves the list and the home screen. */
  async remove(machine: string): Promise<Outcome> {
    const outcome = await this.write(
      () => this.client.call('machine.rm', { machine }),
      (k) => writeProblem(k, 'remove'),
    );
    // A new snapshot drops the removed machine's terminals from home.
    if (outcome.ok) await this.store.start().catch(() => undefined);
    return outcome;
  }

  private async write(call: () => Promise<unknown>, problem: (kind: string) => string): Promise<Outcome> {
    try {
      await call();
    } catch (error) {
      return { ok: false, message: problem(kindOf(error)) };
    }
    await this.store.refreshMachines();
    return { ok: true };
  }
}
