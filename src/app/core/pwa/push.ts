import { DOCUMENT } from '@angular/common';
import { InjectionToken, Service, computed, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { take } from 'rxjs';

/** `unknown` only until the browser answered whether a subscription exists. */
export type PushState = 'unknown' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

export interface PushEnv {
  /** Running as the installed app (home-screen icon), not in a browser tab. */
  standalone: boolean;
  ios: boolean;
  /** The browser has the Push API and notifications. */
  supported: boolean;
  permission: () => NotificationPermission;
}

/** What the browser offers; a token so tests do not depend on the real one. */
export const PUSH_ENV = new InjectionToken<PushEnv>('PUSH_ENV', {
  factory: () => {
    const win = inject(DOCUMENT).defaultView;
    const nav = win?.navigator as (Navigator & { standalone?: boolean }) | undefined;
    return {
      standalone:
        nav?.standalone === true || win?.matchMedia?.('(display-mode: standalone)').matches === true,
      ios:
        /iPad|iPhone|iPod/.test(nav?.userAgent ?? '') ||
        (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1),
      supported: !!win && 'PushManager' in win && 'Notification' in win,
      permission: () => (win && 'Notification' in win ? win.Notification.permission : 'denied'),
    };
  },
});

const KEY = '/api/push/key';
const SUBSCRIPTION = '/api/push/subscription';
const TEST = '/api/push/test';

/**
 * Web Push on this device: subscribes through the service worker and tells the bridge, which
 * sends the notifications. Never asks for permission by itself; only `enable()` does.
 */
@Service()
export class Push {
  private readonly sw = inject(SwPush);
  private readonly env = inject(PUSH_ENV);

  private readonly subscribed = signal<boolean | null>(null);
  private readonly permission = signal<NotificationPermission>(this.env.permission());
  private readonly errorSignal = signal<string | null>(null);
  private readonly busySignal = signal(false);
  private endpoint: string | null = null;

  readonly error = this.errorSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();

  readonly state = computed<PushState>(() => {
    if (!this.sw.isEnabled) return this.env.ios && !this.env.standalone ? 'needs-install' : 'unsupported';
    if (!this.env.standalone && this.env.ios) return 'needs-install';
    if (!this.env.supported) return 'unsupported';
    if (this.permission() === 'denied') return 'denied';
    const subscribed = this.subscribed();
    return subscribed === null ? 'unknown' : subscribed ? 'on' : 'off';
  });

  constructor() {
    if (!this.sw.isEnabled) return;
    // Resync on start: a bridge that lost its store (reinstall) learns this device again.
    this.sw.subscription.pipe(take(1)).subscribe((sub) => {
      this.endpoint = sub?.endpoint ?? null;
      this.subscribed.set(sub !== null);
      if (sub) void this.send('POST', SUBSCRIPTION, sub.toJSON()).catch(() => undefined);
    });
  }

  async enable(): Promise<void> {
    await this.run(async () => {
      const key = await this.send('GET', KEY);
      const { publicKey } = (await key.json()) as { publicKey: string };
      let sub: PushSubscription;
      try {
        sub = await this.sw.requestSubscription({ serverPublicKey: publicKey });
      } catch (e) {
        this.permission.set(this.env.permission());
        if (this.permission() === 'denied') return;
        throw e;
      }
      await this.send('POST', SUBSCRIPTION, sub.toJSON());
      // On only once the bridge knows this device; otherwise the next start re-sends it.
      this.endpoint = sub.endpoint;
      this.subscribed.set(true);
    });
  }

  async disable(): Promise<void> {
    await this.run(async () => {
      const endpoint = this.endpoint;
      await this.sw.unsubscribe();
      this.endpoint = null;
      this.subscribed.set(false);
      if (endpoint) await this.send('DELETE', SUBSCRIPTION, { endpoint });
    });
  }

  async test(): Promise<void> {
    await this.run(async () => {
      await this.send('POST', TEST);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.errorSignal.set(null);
    this.busySignal.set(true);
    try {
      await action();
    } catch {
      this.errorSignal.set('Something went wrong. Check the connection and try again.');
    } finally {
      this.busySignal.set(false);
    }
  }

  private async send(method: string, url: string, body?: unknown): Promise<Response> {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`${method} ${url}: ${res.status}`);
    return res;
  }
}
