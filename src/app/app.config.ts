import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // CDK overlays default to the browser top layer (popover), which no z-index can beat: toasts
    // would hide behind sheets and dialogs. Plain z-index overlays leave the toaster on top.
    { provide: OVERLAY_DEFAULT_CONFIG, useValue: { usePopover: false } },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
