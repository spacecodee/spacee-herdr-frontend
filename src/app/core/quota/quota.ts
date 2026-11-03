import { DOCUMENT } from '@angular/common';
import { Service, computed, inject, signal, type Signal } from '@angular/core';
import { decodeOutput } from '../folders/folder-listing';
import { OFFLINE_KINDS, type ExecResult } from '../folders/folders';
import { HcClient, HcError } from '../hc/hc-client';
import { parseQuota, type QuotaReport } from './quota-parse';

/**
 * Constant, no user data. Core runs as a service whose PATH may miss the user's npm/pnpm bin, so a
 * missing `quota-axi` is retried through the user's login shell; still missing means exit 127.
 */
export const QUOTA_ARGV: readonly string[] = [
  'sh',
  '-c',
  'command -v quota-axi >/dev/null 2>&1 && exec quota-axi --json || exec "${SHELL:-sh}" -lic \'quota-axi --json\'',
];
const TIMEOUT_S = 30;
export const REFRESH_MS = 2 * 60_000;

export interface MachineQuota {
  status: 'idle' | 'loading' | 'ready' | 'not-installed' | 'error';
  /** The last good numbers, kept while a refresh runs or after one fails. */
  report: QuotaReport | null;
  /** When the numbers were read (epoch ms). */
  at: number | null;
  /** A refresh is running. */
  refreshing: boolean;
  /** The last refresh failed but older numbers are still shown. */
  failed: boolean;
  message: string;
}

const IDLE: MachineQuota = { status: 'idle', report: null, at: null, refreshing: false, failed: false, message: '' };

/** Agent quota per machine, read with core's `machine.exec` (`quota-axi --json`); only parsed numbers are kept, in memory. */
@Service()
export class Quota {
  private readonly client = inject(HcClient);
  private readonly document = inject(DOCUMENT);
  private readonly states = signal<Record<string, MachineQuota>>({});
  private readonly running = new Map<string, Promise<void>>();
  private readonly watchers = new Map<string, { count: number; timer: ReturnType<typeof setInterval> }>();

  /** `machine` is `''` for the core this app talks to, else the added machine's name. */
  view(machine: string): Signal<MachineQuota> {
    return computed(() => this.states()[machine] ?? IDLE);
  }

  load(machine: string): Promise<void> {
    const running = this.running.get(machine);
    if (running) return running;
    const run = this.read(machine).finally(() => this.running.delete(machine));
    this.running.set(machine, run);
    return run;
  }

  /**
   * Keeps `machine` fresh while the page is visible: reads now if the numbers are older than the
   * refresh period, then every period. Returns the function that releases it.
   */
  track(machine: string): () => void {
    const stale = () => {
      const at = this.states()[machine]?.at ?? null;
      return at === null || Date.now() - at >= REFRESH_MS;
    };
    const tick = () => {
      if (this.document.visibilityState !== 'hidden') void this.load(machine);
    };
    if (stale()) tick();
    let watcher = this.watchers.get(machine);
    if (watcher) {
      watcher.count++;
    } else {
      watcher = { count: 1, timer: setInterval(tick, REFRESH_MS) };
      this.watchers.set(machine, watcher);
    }
    const onVisible = () => {
      if (this.document.visibilityState === 'visible' && stale()) void this.load(machine);
    };
    this.document.addEventListener('visibilitychange', onVisible);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.document.removeEventListener('visibilitychange', onVisible);
      const w = this.watchers.get(machine);
      if (w && --w.count === 0) {
        clearInterval(w.timer);
        this.watchers.delete(machine);
      }
    };
  }

  private set(machine: string, patch: Partial<MachineQuota>): void {
    this.states.update((all) => ({ ...all, [machine]: { ...(all[machine] ?? IDLE), ...patch } }));
  }

  private async read(machine: string): Promise<void> {
    const before = this.states()[machine] ?? IDLE;
    this.set(machine, before.report ? { refreshing: true } : { status: 'loading' });
    try {
      const r = await this.exec(machine);
      if (r.timed_out) throw new QuotaError('Reading the quota took too long.');
      const stdout = decodeOutput(r.stdout);
      if (r.code === 127 || (r.code !== 0 && stdout.trim() === '' && /not found/i.test(decodeOutput(r.stderr)))) {
        this.set(machine, { status: 'not-installed', report: null, at: null, refreshing: false, failed: false });
        return;
      }
      const report = parseQuota(stdout);
      if (r.code !== 0 || report === null) throw new QuotaError('Could not read the quota.');
      this.set(machine, { status: 'ready', report, at: Date.now(), refreshing: false, failed: false, message: '' });
    } catch (error) {
      const message = error instanceof QuotaError ? error.message : 'Could not read the quota.';
      this.set(
        machine,
        before.report
          ? { status: 'ready', refreshing: false, failed: true, message }
          : { status: 'error', refreshing: false, message },
      );
    }
  }

  private async exec(machine: string): Promise<ExecResult> {
    try {
      return await this.client.call<ExecResult>('machine.exec', {
        argv: [...QUOTA_ARGV],
        timeout: TIMEOUT_S,
        ...(machine ? { on: machine } : {}),
      });
    } catch (error) {
      const kind = error instanceof HcError ? error.kind : '';
      throw new QuotaError(OFFLINE_KINDS.has(kind) ? (machine ? `${machine} is offline.` : 'Could not run on this machine.') : 'Could not read the quota.');
    }
  }
}

class QuotaError extends Error {}
