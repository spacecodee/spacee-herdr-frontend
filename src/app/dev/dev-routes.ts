import type { Routes } from '@angular/router';

/** Dev-only screens. The production build swaps this file for `dev-routes.production.ts`. */
export const devRoutes: Routes = [
  {
    path: 'dev/chat',
    loadComponent: () => import('./chat-fixture/chat-fixture').then((m) => m.ChatFixture),
  },
  {
    path: 'dev/home',
    loadComponent: () => import('./home-fixture/home-fixture').then((m) => m.HomeFixture),
  },
];
