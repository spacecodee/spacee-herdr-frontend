import { Routes } from '@angular/router';
import { authGuard } from './core/session/auth-guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.Login) },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () => import('./features/terminal-list/terminal-list').then((m) => m.TerminalList),
  },
  { path: '**', redirectTo: '' },
];
