import { Service, computed, inject, signal, type Signal } from '@angular/core';
import { decodeOutput } from '../folders/folder-listing';
import { OFFLINE_KINDS, type ExecResult } from '../folders/folders';
import { HcClient, HcError } from '../hc/hc-client';
import { buildStats, type Stats as StatsNumbers } from './stats-count';
import { StatsError, loadRaw, type Outcome } from './stats-load';

/** How long the computed numbers stay good; Refresh reloads sooner. */
export const CACHE_MS = 30 * 60_000;
/** Seconds core gives one gh call. */
const TIMEOUT_S = 60;
const WEEKS = 12;

export const cacheKey = (machine: string): string => `spacee-herdr.stats.${machine || '@local'}`;

export interface MachineStats {
  status: 'idle' | 'loading' | 'ready' | 'not-logged-in' | 'error';
  /** The last good numbers, kept while a refresh runs or after one fails. */
  stats: StatsNumbers | null;
  /** When the numbers were computed (epoch ms). */
  at: number | null;
  /** A refresh is running. */
  refreshing: boolean;
  /** The last refresh failed but older numbers are still shown. */
  failed: boolean;
  message: string;
}

const IDLE: MachineStats = { status: 'idle', stats: null, at: null, refreshing: false, failed: false, message: '' };

/**
 * Your PR numbers per machine, counted from `gh` run with core's `machine.exec`. Only the computed
 * numbers are kept (in memory and in localStorage, 30 minutes), never PR titles or texts.
 */
@Service()
export class Stats {
  private readonly client = inject(HcClient);
  private readonly states = signal<Record<string, MachineStats>>({});
  private readonly running = new Map<string, Promise<void>>();

  /** `machine` is `''` for the core this app talks to, else the added machine's name. */
  view(machine: string): Signal<MachineStats> {
    return computed(() => this.states()[machine] ?? IDLE);
  }

  /** Opens from the cache while it is fresh; `force` (Refresh) always asks gh. */
  load(machine: string, force = false): Promise<void> {
    const running = this.running.get(machine);
    if (running) return running;
    if (!force && this.fromCache(machine)) return Promise.resolve();
    const run = this.read(machine).finally(() => this.running.delete(machine));
    this.running.set(machine, run);
    return run;
  }

  private set(machine: string, patch: Partial<MachineStats>): void {
    this.states.update((all) => ({ ...all, [machine]: { ...(all[machine] ?? IDLE), ...patch } }));
  }

  /** True when fresh numbers are on screen. An older cache is shown too, while gh is asked again. */
  private fromCache(machine: string): boolean {
    const now = this.states()[machine];
    const cached = now?.stats ? { at: now.at!, stats: now.stats } : readCache(machine);
    if (!cached) return false;
    const fresh = Date.now() - cached.at < CACHE_MS;
    if (!now?.stats) this.set(machine, { status: 'ready', stats: cached.stats, at: cached.at });
    return fresh;
  }

  private async read(machine: string): Promise<void> {
    const before = this.states()[machine] ?? IDLE;
    this.set(machine, before.stats ? { refreshing: true } : { status: 'loading' });
    try {
      const raw = await loadRaw((argv) => this.exec(machine, argv), Date.now(), WEEKS);
      const stats = buildStats(raw);
      const at = Date.now();
      this.set(machine, { status: 'ready', stats, at, refreshing: false, failed: false, message: '' });
      writeCache(machine, at, stats);
    } catch (error) {
      if (error instanceof StatsError && error.kind === 'not-logged-in') {
        this.set(machine, { status: 'not-logged-in', stats: null, at: null, refreshing: false, failed: false, message: '' });
        return;
      }
      const message = error instanceof StatsError ? error.message : 'Could not count your PRs.';
      this.set(machine, before.stats ? { status: 'ready', refreshing: false, failed: true, message } : { status: 'error', refreshing: false, message });
    }
  }

  private async exec(machine: string, argv: readonly string[]): Promise<Outcome> {
    let r: ExecResult;
    try {
      r = await this.client.call<ExecResult>('machine.exec', { argv: [...argv], timeout: TIMEOUT_S, ...(machine ? { on: machine } : {}) });
    } catch (error) {
      const kind = error instanceof HcError ? error.kind : '';
      throw new StatsError('failed', OFFLINE_KINDS.has(kind) ? (machine ? `${machine} is offline.` : 'Could not run on this machine.') : 'Could not count your PRs.');
    }
    return { code: r.code ?? null, stdout: decodeOutput(r.stdout), stderr: decodeOutput(r.stderr), truncated: r.truncated, timedOut: r.timed_out };
  }
}

const isNumbers = (v: unknown): v is StatsNumbers => {
  const s = v as Partial<StatsNumbers> | null;
  return (
    !!s &&
    Array.isArray(s.weeks) && s.weeks.length > 0 &&
    Array.isArray(s.days) &&
    Array.isArray(s.repos) &&
    typeof s.ai === 'object' && s.ai !== null &&
    typeof s.reviews === 'object' && s.reviews !== null &&
    typeof s.mergedThisWeek === 'number' &&
    typeof s.open === 'number'
  );
};

function readCache(machine: string): { at: number; stats: StatsNumbers } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey(machine)) ?? 'null') as { at?: unknown; stats?: unknown } | null;
    return saved && typeof saved.at === 'number' && isNumbers(saved.stats) ? { at: saved.at, stats: saved.stats } : null;
  } catch {
    return null;
  }
}

function writeCache(machine: string, at: number, stats: StatsNumbers): void {
  try {
    localStorage.setItem(cacheKey(machine), JSON.stringify({ at, stats }));
  } catch {
    // private mode or full: the numbers still show for this session
  }
}
