import { Service, inject, signal } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

export type SessionState = 'unknown' | 'anonymous' | 'authenticated';
export type LoginResult = 'ok' | 'invalid' | 'unreachable';

const ENDPOINT = '/api/session';

/** Bridge session: an HttpOnly cookie we cannot read, so we ask the bridge. */
@Service()
export class Session {
  private readonly stateSignal = signal<SessionState>('unknown');
  readonly state = this.stateSignal.asReadonly();

  async check(): Promise<SessionState> {
    try {
      const res = await fetch(ENDPOINT, { credentials: 'same-origin' });
      this.stateSignal.set(res.status === 204 ? 'authenticated' : 'anonymous');
    } catch {
      this.stateSignal.set('anonymous');
    }
    return this.stateSignal();
  }

  async login(token: string): Promise<LoginResult> {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'same-origin',
      });
      if (res.status === 204) {
        this.stateSignal.set('authenticated');
        return 'ok';
      }
      if (res.status === 401) {
        this.stateSignal.set('anonymous');
        return 'invalid';
      }
    } catch {
      // fall through
    }
    return 'unreachable';
  }
}

export const authGuard: CanActivateFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  const state = session.state() === 'unknown' ? await session.check() : session.state();
  return state === 'authenticated' ? true : router.createUrlTree(['/login']);
};
