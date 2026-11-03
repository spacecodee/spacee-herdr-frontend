import { Service, signal } from '@angular/core';

/** `unreachable`: no answer from the bridge (fetch rejected, or a gateway error): not a refusal. */
export type SessionState = 'unknown' | 'anonymous' | 'authenticated' | 'unreachable';
/** `locked`: too many wrong pairing codes, the bridge answers 429 for a while. */
export type LoginResult = 'ok' | 'invalid' | 'locked' | 'unreachable';

const ENDPOINT = '/api/session';
/** What `tailscale serve` answers when the bridge behind it is down. */
const GATEWAY_ERRORS = new Set([502, 503, 504]);

/** Bridge session: an HttpOnly cookie we cannot read, so we ask the bridge. */
@Service()
export class Session {
  private readonly stateSignal = signal<SessionState>('unknown');
  readonly state = this.stateSignal.asReadonly();

  async check(): Promise<SessionState> {
    try {
      const res = await fetch(ENDPOINT, { credentials: 'same-origin' });
      this.stateSignal.set(
        res.status === 204
          ? 'authenticated'
          : GATEWAY_ERRORS.has(res.status)
            ? 'unreachable'
            : 'anonymous',
      );
    } catch {
      this.stateSignal.set('unreachable');
    }
    return this.stateSignal();
  }

  login(token: string): Promise<LoginResult> {
    return this.post({ token });
  }

  loginWithCode(code: string): Promise<LoginResult> {
    return this.post({ code });
  }

  /** Signs this device out. False when the bridge could not be reached (nothing changed). */
  async logout(): Promise<boolean> {
    try {
      await fetch(ENDPOINT, { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      return false;
    }
    this.stateSignal.set('anonymous');
    return true;
  }

  private async post(body: { token: string } | { code: string }): Promise<LoginResult> {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
      if (res.status === 429) return 'locked';
    } catch {
      // fall through
    }
    return 'unreachable';
  }
}
