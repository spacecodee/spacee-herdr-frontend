import { Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { HcClient } from './hc-client';
import { LAYOUT_DOC, parseSpaces, type Space } from './spaces';
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

  private readonly spacesSignal = signal<Space[]>([]);
  /** Spaces and tabs from the desktop app's `herdr-app` document; empty if there is none. */
  readonly spaces = this.spacesSignal.asReadonly();
  private spacesRequest = 0;

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
  private eventsChannel: number | null = null;
  private starting: Promise<void> | null = null;
  private subscribedEpoch = 0;
  private readonly startedSignal = signal(false);
  private readonly attemptedEpoch = signal(0);
  private readonly inFlight = signal(false);

  /**
   * True while the events subscription is being (re)established: a subscribe is in flight, or a
   * reconnect landed and its resubscribe has not begun. False once it settled, even if it failed.
   */
  readonly syncing = computed(
    () =>
      this.inFlight() ||
      (this.startedSignal() && this.attemptedEpoch() !== this.client.epoch()),
  );

  constructor() {
    // A reconnect invalidates the events channel: subscribe again, nobody has to tap anything.
    effect(() => {
      const epoch = this.client.epoch();
      untracked(() => {
        if (this.eventsChannel !== null && epoch !== this.subscribedEpoch) {
          void this.ensureStarted().catch(() => undefined);
        }
      });
    });
  }

  /** Starts unless a live subscription already runs on the current socket. */
  async ensureStarted(): Promise<void> {
    if (
      this.streamSignal() === 'live' &&
      this.client.state() === 'open' &&
      this.subscribedEpoch === this.client.epoch()
    )
      return;
    await this.start();
  }

  /** Subscribes, loads the snapshot and keeps it live. Call once the client is open. */
  start(): Promise<void> {
    // One subscription at a time: a reconnect and a freshly opened view can ask together.
    this.startedSignal.set(true);
    this.inFlight.set(true);
    return (this.starting ??= this.subscribe().finally(() => {
      this.starting = null;
      this.inFlight.set(false);
    }));
  }

  private async subscribe(): Promise<void> {
    const epoch = this.client.epoch();
    this.attemptedEpoch.set(epoch);
    const sub = await this.client.call<SubscribeResult>('events.subscribe', {});
    if (sub.channel == null) throw new Error('events.subscribe returned no channel');
    if (this.eventsChannel !== null) this.client.closeChannel(this.eventsChannel);
    this.eventsChannel = sub.channel;
    this.subscribedEpoch = epoch;
    this.parser = new EventLineParser();
    this.snapshot.set({ seq: sub.seq, terminals: sub.terminals });
    this.streamSignal.set('live');
    this.client.openChannel(
      sub.channel,
      (bytes) => this.onBytes(bytes),
      () => this.streamSignal.set('closed'),
    );
    await Promise.all([this.refreshMachines(), this.refreshSpaces()]);
  }

  private onBytes(bytes: Uint8Array): void {
    for (const message of this.parser.push(bytes)) {
      this.snapshot.update((s) => applyMessage(s, message));
      if (message.method === 'missed') void this.refreshMachines();
      if (
        message.method === 'event' &&
        message.params.type === 'doc' &&
        message.params.data.name === LAYOUT_DOC
      ) {
        void this.refreshSpaces();
      }
    }
  }

  /** Re-reads `machine.list`; keeps the last known machines if core does not answer. */
  async refreshMachines(): Promise<void> {
    try {
      const { machines } = await this.client.call<MachineListResult>('machine.list', {});
      this.machinesSignal.set(machines);
    } catch {
      // keep the last known machines; the terminal list does not depend on them
    }
  }

  private async refreshSpaces(): Promise<void> {
    const request = ++this.spacesRequest;
    try {
      const result = await this.client.call<unknown>('doc.get', { name: LAYOUT_DOC });
      // A slower, older answer must not overwrite a newer one.
      if (request === this.spacesRequest) this.spacesSignal.set(parseSpaces(result));
    } catch {
      // keep the last known layout; the list falls back to machines without it
    }
  }
}
