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
  ...devRoutes,
  { path: '**', redirectTo: '' },
];
