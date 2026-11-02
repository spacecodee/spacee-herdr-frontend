import { Routes } from '@angular/router';
import { authGuard } from './session';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login').then((m) => m.Login) },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () => import('./terminal-list/terminal-list').then((m) => m.TerminalList),
  },
  { path: '**', redirectTo: '' },
];
