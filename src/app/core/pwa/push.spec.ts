import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { PUSH_ENV, Push, type PushEnv } from './push';

const sub = (endpoint = 'https://push.example/1') =>
  ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }) }) as unknown as PushSubscription;

describe('Push', () => {
  let subscription: BehaviorSubject<PushSubscription | null>;
  let swPush: {
    isEnabled: boolean;
    subscription: BehaviorSubject<PushSubscription | null>;
    requestSubscription: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };
  let env: PushEnv;
  let requests: { method: string; url: string; body?: unknown }[];
  let status: Record<string, number>;

  const setup = async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SwPush, useValue: swPush },
        { provide: PUSH_ENV, useValue: env },
      ],
    });
    const push = TestBed.inject(Push);
    await vi.waitFor(() => expect(push.state()).not.toBe('unknown'));
    return push;
  };

  beforeEach(() => {
    subscription = new BehaviorSubject<PushSubscription | null>(null);
    swPush = {
      isEnabled: true,
      subscription,
      requestSubscription: vi.fn(async () => {
        const s = sub();
        subscription.next(s);
        return s;
      }),
      unsubscribe: vi.fn(async () => subscription.next(null)),
    };
    env = { standalone: true, ios: false, supported: true, permission: () => 'default' };
    requests = [];
    status = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        requests.push({
          method,
          url,
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        const code = status[`${method} ${url}`] ?? (url === '/api/push/key' ? 200 : 204);
        return new Response(url === '/api/push/key' ? '{"publicKey":"BKEY"}' : null, {
          status: code,
        });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('state', () => {
    it('is unsupported without a service worker or without push', async () => {
      swPush.isEnabled = false;
      expect((await setup()).state()).toBe('unsupported');
    });

    it('is unsupported when the browser has no push', async () => {
      env.supported = false;
      expect((await setup()).state()).toBe('unsupported');
    });

    it('is needs-install on iOS outside the installed app', async () => {
      env = { ...env, ios: true, standalone: false, supported: false };
      expect((await setup()).state()).toBe('needs-install');
    });

    it('is denied when the permission was refused', async () => {
      env.permission = () => 'denied';
      expect((await setup()).state()).toBe('denied');
    });

    it('is off without a subscription and on with one', async () => {
      expect((await setup()).state()).toBe('off');
      TestBed.resetTestingModule();
      subscription = new BehaviorSubject<PushSubscription | null>(sub());
      swPush.subscription = subscription;
      expect((await setup()).state()).toBe('on');
    });
  });

  it('never asks for permission or calls the bridge until enable, except to resync', async () => {
    await setup();
    expect(swPush.requestSubscription).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it('re-sends an existing subscription on start', async () => {
    subscription.next(sub());
    await setup();
    await vi.waitFor(() =>
      expect(requests).toEqual([
        {
          method: 'POST',
          url: '/api/push/subscription',
          body: { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } },
        },
      ]),
    );
  });

  it('enable fetches the key, subscribes and posts the subscription', async () => {
    const push = await setup();
    await push.enable();
    expect(swPush.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'BKEY' });
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /api/push/key',
      'POST /api/push/subscription',
    ]);
    expect(requests[1].body).toMatchObject({ endpoint: 'https://push.example/1' });
    expect(push.state()).toBe('on');
    expect(push.error()).toBeNull();
  });

  it('enable becomes denied when the user refuses the prompt', async () => {
    swPush.requestSubscription.mockRejectedValue(new Error('denied'));
    const push = await setup();
    env.permission = () => 'denied';
    await push.enable();
    expect(push.state()).toBe('denied');
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('enable reports a bridge failure and stays off-usable', async () => {
    status['POST /api/push/subscription'] = 500;
    const push = await setup();
    await push.enable();
    expect(push.error()).toBeTruthy();
    expect(push.state()).toBe('off');
  });

  it('disable unsubscribes and deletes the endpoint', async () => {
    subscription.next(sub());
    const push = await setup();
    requests.length = 0;
    await push.disable();
    expect(swPush.unsubscribe).toHaveBeenCalled();
    expect(requests).toEqual([
      { method: 'DELETE', url: '/api/push/subscription', body: { endpoint: 'https://push.example/1' } },
    ]);
    expect(push.state()).toBe('off');
  });

  it('test posts to the test endpoint and says so', async () => {
    subscription.next(sub());
    const push = await setup();
    requests.length = 0;
    await push.test();
    expect(requests).toEqual([{ method: 'POST', url: '/api/push/test', body: undefined }]);
    expect(push.error()).toBeNull();
    status['POST /api/push/test'] = 502;
    await push.test();
    expect(push.error()).toBeTruthy();
  });
});
