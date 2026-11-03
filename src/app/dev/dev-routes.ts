import type { Routes } from '@angular/router';
import { changesFixtureProviders } from './changes-fixture/changes-fixtures';

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
  {
    path: 'dev/folders',
    loadComponent: () => import('./folder-fixture/folder-fixture').then((m) => m.FolderFixture),
  },
  {
    path: 'dev/usage',
    loadComponent: () => import('./usage-fixture/usage-fixture').then((m) => m.UsageFixture),
  },
  {
    path: 'dev/stats',
    loadComponent: () => import('./stats-fixture/stats-fixture').then((m) => m.StatsFixture),
  },
  {
    path: 'dev/changes',
    loadComponent: () => import('./changes-fixture/changes-fixture').then((m) => m.ChangesFixture),
  },
  {
    path: 'dev/t/:address/changes',
    providers: changesFixtureProviders,
    loadComponent: () => import('../features/changes-screen/changes-screen').then((m) => m.ChangesScreen),
  },
  {
    path: 'dev/t/:address/changes/file',
    providers: changesFixtureProviders,
    loadComponent: () => import('../features/change-diff/change-diff').then((m) => m.ChangeDiff),
  },
  {
    path: 'dev/t/:address/file',
    providers: changesFixtureProviders,
    loadComponent: () => import('../features/file-viewer/file-viewer').then((m) => m.FileViewer),
  },
  {
    path: 'dev/settings',
    loadComponent: () => import('./settings-fixture/settings-fixture').then((m) => m.SettingsFixture),
  },
];
