import { DOCUMENT } from '@angular/common';
import { InjectionToken, Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { HcClient } from '../hc/hc-client';
import { TerminalStore } from '../hc/terminal-store';
import type { Summary } from '../list/conversations';

/** Sends the request; swapped for a fake in tests and the dev fixtures. */
export type SummariesFetch = (url: string, init?: RequestInit) => Promise<Response>;
export const SUMMARIES_FETCH = new InjectionToken<SummariesFetch>('SUMMARIES_FETCH', {
  factory: () => (url, init) => fetch(url, init),
});

export const SUMMARIES_URL = '/api/chat/summaries';
const POLL_MS = 30_000;
const DEBOUNCE_MS = 1000;

const isSummary = (v: unknown): v is Summary =>
  typeof v === 'object' && v !== null && typeof (v as Summary).terminal === 'string';

/**
 * The home screen's conversation summaries from the bridge. Refreshes when it starts, after each
 * reconnect, 1 s after any terminal's status or turn changes, when the tab becomes visible and every
 * 30 s while visible. A failed or malformed answer keeps the last good data.
 */
@Service()
export class Summaries {
  private readonly send = inject(SUMMARIES_FETCH);
  private readonly client = inject(HcClient);
  private readonly store = inject(TerminalStore);
  private readonly document = inject(DOCUMENT);

  private readonly items = signal<Summary[]>([]);
  private readonly isLoaded = signal(false);
  private readonly clock = signal(Date.now());

  readonly list = this.items.asReadonly();
  /** True once one answer arrived; until then the list shows skeletons. */
  readonly loaded = this.isLoaded.asReadonly();
  /** Epoch milliseconds, moved on every tick so relative times stay fresh. */
  readonly now = this.clock.asReadonly();

  private running = false;
  private request = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private lastEpoch: number | undefined;
  private lastSignature: string | undefined;

  private readonly signature = computed(() =>
    this.store
      .terminals()
      .map((t) => `${t.address}:${t.status?.state ?? ''}:${t.turn ?? ''}`)
      .join('|'),
  );

  private readonly onVisible = () => {
    if (this.visible()) void this.refresh();
  };

  constructor() {
    effect(() => {
      const epoch = this.client.epoch();
      untracked(() => {
        if (this.running && this.lastEpoch !== undefined && epoch !== this.lastEpoch) {
          void this.refresh();
        }
        this.lastEpoch = epoch;
      });
    });
    effect(() => {
      const signature = this.signature();
      untracked(() => {
        if (this.running && this.lastSignature !== undefined && signature !== this.lastSignature) {
          if (this.debounce !== null) clearTimeout(this.debounce);
          this.debounce = setTimeout(() => {
            this.debounce = null;
            void this.refresh();
          }, DEBOUNCE_MS);
        }
        this.lastSignature = signature;
      });
    });
  }

  /** Starts refreshing; pair with `stop()` when the home screen is left. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.refresh();
    this.interval = setInterval(() => {
      this.clock.set(Date.now());
      if (this.visible()) void this.refresh();
    }, POLL_MS);
    this.document.addEventListener('visibilitychange', this.onVisible);
  }

  stop(): void {
    this.running = false;
    if (this.interval !== null) clearInterval(this.interval);
    if (this.debounce !== null) clearTimeout(this.debounce);
    this.interval = this.debounce = null;
    this.document.removeEventListener('visibilitychange', this.onVisible);
  }

  async refresh(): Promise<void> {
    const request = ++this.request;
    try {
      const response = await this.send(SUMMARIES_URL, { credentials: 'same-origin' });
      if (!response.ok) return;
      const body: unknown = await response.json();
      const summaries = (body as { summaries?: unknown } | null)?.summaries;
      // A slower, older answer must not overwrite a newer one.
      if (!Array.isArray(summaries) || request !== this.request) return;
      this.items.set(summaries.filter(isSummary));
      this.clock.set(Date.now());
      this.isLoaded.set(true);
    } catch {
      // offline or a bridge without the endpoint: keep whatever we had
    }
  }

  private visible(): boolean {
    return this.document.visibilityState === 'visible';
  }
}
