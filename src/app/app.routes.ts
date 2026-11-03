import { Routes } from '@angular/router';
import { authGuard } from './core/session/auth-guard';
import { devRoutes } from './dev/dev-routes';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.Login) },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/terminal-list/terminal-list').then((m) => m.TerminalList),
  },
  {
    path: 't/:address/changes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/changes-screen/changes-screen').then((m) => m.ChangesScreen),
  },
  {
    path: 't/:address/changes/file',
    canActivate: [authGuard],
    loadComponent: () => import('./features/change-diff/change-diff').then((m) => m.ChangeDiff),
  },
  {
    path: 't/:address/file',
    canActivate: [authGuard],
    loadComponent: () => import('./features/file-viewer/file-viewer').then((m) => m.FileViewer),
  },
  {
    path: 't/:address',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/terminal-view/terminal-view').then((m) => m.TerminalView),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsPage),
  },
  {
    path: 'usage',
    canActivate: [authGuard],
    loadComponent: () => import('./features/usage/usage/usage').then((m) => m.Usage),
  },
  {
    path: 'stats',
    canActivate: [authGuard],
    loadComponent: () => import('./features/stats/stats').then((m) => m.StatsPage),
  },
  ...devRoutes,
  { path: '**', redirectTo: '' },
];
