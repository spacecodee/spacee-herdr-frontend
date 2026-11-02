import { DOCUMENT } from '@angular/common';
import { DestroyRef, InjectionToken, Service, inject, signal } from '@angular/core';
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

  /** True once a newer version is downloaded and waiting to be activated. */
  readonly updateReady = this.ready.asReadonly();

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

  /** Activates the waiting version, then reloads so the page runs it. */
  async applyUpdate(): Promise<void> {
    await this.sw.activateUpdate();
    this.reload();
  }
}
