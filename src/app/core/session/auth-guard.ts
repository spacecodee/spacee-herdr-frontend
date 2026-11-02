import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Session } from './session';

export const authGuard: CanActivateFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  const state = session.state() === 'unknown' ? await session.check() : session.state();
  return state === 'authenticated' ? true : router.createUrlTree(['/login']);
};
