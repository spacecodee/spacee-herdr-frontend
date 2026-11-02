import { Service, computed, inject, signal } from '@angular/core';
import { HcClient } from './hc-client';
import { EventLineParser, applyMessage, type Snapshot } from './terminal-events';
import type { MachineListResult, MachineView, SubscribeResult, Terminal } from './types';

export type StreamState = 'idle' | 'live' | 'closed';

export interface MachineGroup {
  name: string;
  /** The core this client is connected to. */
  local: boolean;
  /** Machine state from `machine.list`; `local` for the core itself, `unknown` if not listed. */
  state: string;
  terminals: Terminal[];
}

/** `rohan/t7` lives on `rohan`; no slash means the local core. */
function machineOf(address: string): string | null {
  const slash = address.indexOf('/');
  return slash < 0 ? null : address.slice(0, slash);
}

@Service()
export class TerminalStore {
  private readonly client = inject(HcClient);

  private readonly snapshot = signal<Snapshot>({ seq: 0, terminals: [] });
  private readonly machinesSignal = signal<MachineView[]>([]);

  readonly terminals = computed(() => this.snapshot().terminals);
  readonly machines = this.machinesSignal.asReadonly();

  private readonly streamSignal = signal<StreamState>('idle');
  /** `live` while the events channel is open; `closed` once core or the socket ended it. */
  readonly stream = this.streamSignal.asReadonly();

  readonly groups = computed<MachineGroup[]>(() => {
    const local: MachineGroup = {
      name: this.client.hello()?.core.name ?? 'local',
      local: true,
      state: 'local',
      terminals: [],
    };
    const remote = new Map<string, MachineGroup>();
    for (const m of this.machinesSignal()) {
      remote.set(m.name, { name: m.name, local: false, state: m.state, terminals: [] });
    }
    for (const t of this.terminals()) {
      const name = machineOf(t.address);
      if (name === null) {
        local.terminals.push(t);
        continue;
      }
      let group = remote.get(name);
      if (!group) {
        group = { name, local: false, state: 'unknown', terminals: [] };
        remote.set(name, group);
      }
      group.terminals.push(t);
    }
    return [local, ...remote.values()];
  });

  private parser = new EventLineParser();

  /** Subscribes, loads the snapshot and keeps it live. Call once the client is open. */
  async start(): Promise<void> {
    const sub = await this.client.call<SubscribeResult>('events.subscribe', {});
    if (sub.channel == null) throw new Error('events.subscribe returned no channel');
    this.parser = new EventLineParser();
    this.snapshot.set({ seq: sub.seq, terminals: sub.terminals });
    this.streamSignal.set('live');
    this.client.openChannel(
      sub.channel,
      (bytes) => this.onBytes(bytes),
      () => this.streamSignal.set('closed'),
    );
    await this.refreshMachines();
  }

  private onBytes(bytes: Uint8Array): void {
    for (const message of this.parser.push(bytes)) {
      this.snapshot.update((s) => applyMessage(s, message));
      if (message.method === 'missed') void this.refreshMachines();
    }
  }

  private async refreshMachines(): Promise<void> {
    try {
      const { machines } = await this.client.call<MachineListResult>('machine.list', {});
      this.machinesSignal.set(machines);
    } catch {
      // keep the last known machines; the terminal list does not depend on them
    }
  }
}
