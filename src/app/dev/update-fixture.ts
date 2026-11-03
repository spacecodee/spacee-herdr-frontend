import { inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AppUpdates } from '../core/pwa/app-updates';

export type UpdateScenario = 'none' | 'ready' | 'later' | 'reloading';

/**
 * Dev-only: an `AppUpdates` stand-in driven by `?u=none|ready|later|reloading`, so the update
 * card, gear dot, Settings row and About can be seen without a new service-worker version.
 */
export function fixtureUpdates(scenario: string | null) {
  const state = (scenario ?? 'none') as UpdateScenario;
  const ready = signal(state !== 'none');
  const postponed = signal(state === 'later');
  const applying = signal(state === 'reloading');
  return {
    updateReady: ready.asReadonly(),
    postponed: postponed.asReadonly(),
    applying: applying.asReadonly(),
    cardVisible: () => ready() && !postponed(),
    later: () => postponed.set(true),
    applyUpdate: async () => applying.set(true),
  } as unknown as AppUpdates;
}

/** Provider for a fixture component: reads `?u=` from the current URL. */
export const provideFixtureUpdates = {
  provide: AppUpdates,
  useFactory: () => fixtureUpdates(inject(ActivatedRoute).snapshot.queryParamMap.get('u')),
};
