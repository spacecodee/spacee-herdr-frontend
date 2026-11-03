import { DOCUMENT } from '@angular/common';
import { DestroyRef, InjectionToken, Service, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** Reloads the page; a token so tests do not navigate. */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  factory: () => {
    const location = inject(DOCUMENT).defaultView?.location;
    return () => location?.reload();
  },
});

/**
 * Keeps the installed app current: flags a ready new version, checks for one whenever the page
 * becomes visible again (an installed PWA is rarely cold-started), and recovers from a broken
 * service-worker cache by reloading. Owns its own visibility listener on purpose: HcClient's one
 * is about the socket, and this must also work on the login screen where no socket exists.
 */
@Service()
export class AppUpdates {
  private readonly sw = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);
  private readonly reload = inject(RELOAD_PAGE);
  private readonly ready = signal(false);
  private readonly later_ = signal(false);
  private readonly pending = signal(false);

  /** True once a newer version is downloaded and waiting to be activated. */
  readonly updateReady = this.ready.asReadonly();
  /** True while the update is being applied; stays true until the page reloads. */
  readonly applying = this.pending.asReadonly();
  /** True when an update is ready and the person chose "Later" (in memory: gone on reload). */
  readonly postponed = computed(() => this.ready() && this.later_());
  /** The update card shows while an update is ready and was not postponed. */
  readonly cardVisible = computed(() => this.ready() && !this.later_());

  constructor() {
    if (!this.sw.isEnabled) return;
    const destroyRef = inject(DestroyRef);

    const versions = this.sw.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') this.ready.set(true);
    });
    const unrecoverable = this.sw.unrecoverable.subscribe(() => this.reload());
    const onVisible = () => {
      if (this.document.visibilityState === 'visible') this.sw.checkForUpdate().catch(() => {});
    };
    this.document.addEventListener('visibilitychange', onVisible);
    destroyRef.onDestroy(() => {
      versions.unsubscribe();
      unrecoverable.unsubscribe();
      this.document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** Hides the update card for the rest of the session; the gear dot and Settings row remain. */
  later(): void {
    this.later_.set(true);
  }

  /** Activates the waiting version, then reloads so the page runs it. */
  async applyUpdate(): Promise<void> {
    this.pending.set(true);
    try {
      await this.sw.activateUpdate();
    } catch (error) {
      this.pending.set(false);
      throw error;
    }
    this.reload();
  }
}
