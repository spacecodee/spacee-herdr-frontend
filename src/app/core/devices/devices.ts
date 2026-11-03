import { Service, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '../session/session';

export type Platform = 'ios' | 'android' | 'ipad' | 'mac' | 'other';

export interface Device {
  id: string;
  name: string;
  platform: Platform;
  created: string;
  lastSeen: string;
  current: boolean;
}

/** A pairing code and the moment it stops working (epoch milliseconds). */
export interface Pairing {
  code: string;
  expires: number;
}

const DEVICES = '/api/devices';

/** The devices signed in to this bridge: list, pair a new one, rename, sign out. */
@Service()
export class Devices {
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  private readonly listSignal = signal<Device[] | null>(null);
  private readonly failedSignal = signal(false);
  /** Null until the first load finishes. */
  readonly list = this.listSignal.asReadonly();
  readonly failed = this.failedSignal.asReadonly();

  async load(): Promise<void> {
    const res = await this.request(DEVICES, {});
    if (res === 'signed-out') return;
    if (res?.ok) {
      this.listSignal.set((await res.json()) as Device[]);
      this.failedSignal.set(false);
    } else {
      this.failedSignal.set(true);
    }
  }

  async pair(): Promise<Pairing | null> {
    const res = await this.request(`${DEVICES}/pair`, { method: 'POST' });
    if (!res || res === 'signed-out' || !res.ok) return null;
    const body = (await res.json()) as { code: string; expires: string };
    return { code: body.code, expires: Date.parse(body.expires) };
  }

  async rename(id: string, name: string): Promise<boolean> {
    const trimmed = name.trim();
    const res = await this.request(`${DEVICES}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res || res === 'signed-out' || !res.ok) return false;
    this.listSignal.update((list) => list?.map((d) => (d.id === id ? { ...d, name: trimmed } : d)) ?? null);
    return true;
  }

  /** Signs a device out. This device goes through the session and lands on the login. */
  async signOut(device: Device): Promise<boolean> {
    if (device.current) {
      if (!(await this.session.logout())) return false;
      await this.router.navigateByUrl('/login');
      return true;
    }
    const res = await this.request(`${DEVICES}/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
    // 404: another screen already signed it out, which is what was asked for.
    if (!res || res === 'signed-out' || !(res.ok || res.status === 404)) return false;
    this.listSignal.update((list) => list?.filter((d) => d.id !== device.id) ?? null);
    return true;
  }

  /**
   * Null when the bridge cannot be reached. On 401 this device was signed out elsewhere: ask the
   * session (it becomes anonymous), go to login and report `signed-out` so callers stop quietly.
   */
  private async request(url: string, init: RequestInit): Promise<Response | 'signed-out' | null> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, credentials: 'same-origin' });
    } catch {
      return null;
    }
    if (res.status === 401) {
      await this.session.check();
      await this.router.navigateByUrl('/login');
      return 'signed-out';
    }
    return res;
  }
}
