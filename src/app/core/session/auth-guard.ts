import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Session } from './session';

export const authGuard: CanActivateFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  const known = session.state();
  const state = known === 'unknown' || known === 'unreachable' ? await session.check() : known;
  // Unreachable is not a refusal: open the (cached) shell, which shows Reconnecting… and keeps trying.
  return state === 'anonymous' ? router.createUrlTree(['/login']) : true;
};
