import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HC_SOCKET_FACTORY, HcClient, type HcSocket } from '../../core/hc/hc-client';
import { TerminalStore } from '../../core/hc/terminal-store';
import type { Terminal } from '../../core/hc/types';
import { FrameDecoder, FrameKind, encodeFrame, type DecodedItem } from '../../core/hc/wire';
import { Settings } from '../../core/settings/settings';
import { ColorScheme } from '../../core/theme/color-scheme';
import { Session, type SessionState } from '../../core/session/session';
import { XtermFactory, type DisplayFacts, type XtermHandle } from '../../core/xterm/xterm-factory';
import { TerminalView } from './terminal-view';

const enc = new TextEncoder();
const dec = new TextDecoder();
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeSocket implements HcSocket {
  binaryType: BinaryType = 'blob';
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sent: Uint8Array<ArrayBuffer>[] = [];

  send(data: Uint8Array<ArrayBuffer>): void {
    this.sent.push(data);
  }
  close(): void {
    this.onclose?.({} as CloseEvent);
  }
  receive(data: Uint8Array): void {
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.onmessage?.({ data: buffer } as MessageEvent);
  }
  frames(): Extract<DecodedItem, { type: 'frame' }>[] {
    const d = new FrameDecoder();
    return this.sent.flatMap((chunk) => d.push(chunk)).filter((i) => i.type === 'frame');
  }
}

class FakeHandle implements XtermHandle {
  cols = 80;
  rows = 24;
  applicationCursorKeys = false;
  written: Uint8Array[] = [];
  writeGate: Promise<void> = Promise.resolve();
  resets = 0;
  disposed = false;
  facts: DisplayFacts = { bg: '#0b0b0c', fg: '#e5e5e5', cursor: '#e5e5e5', cell: [8, 16] };
  input: ((bytes: Uint8Array) => void) | null = null;
  resize: ((size: { cols: number; rows: number }) => void) | null = null;
  focus_: ((focused: boolean) => void) | null = null;

  fit(): void {}
  write(bytes: Uint8Array): Promise<void> {
    this.written.push(bytes);
    return this.writeGate;
  }
  reset(): void {
    this.resets++;
  }
  focus(): void {
    this.focuses++;
  }
  focuses = 0;
  pasted: string[] = [];
  nativeKeyboard: boolean[] = [];
  /** Like xterm: a paste comes back out through onData. */
  paste(text: string): void {
    this.pasted.push(text);
    this.input?.(enc.encode(text));
  }
  setNativeKeyboard(on: boolean): void {
    this.nativeKeyboard.push(on);
  }
  display(): DisplayFacts {
    return this.facts;
  }
  schemes: string[] = [];
  sizes: number[] = [];
  speeds: number[] = [];
  setScrollSpeed(speed: number): void {
    this.speeds.push(speed);
  }
  setScheme(scheme: string): void {
    this.schemes.push(scheme);
  }
  setFontSize(size: number): void {
    this.sizes.push(size);
  }
  onInput(cb: (bytes: Uint8Array) => void): () => void {
    this.input = cb;
    return () => (this.input = null);
  }
  onResize(cb: (size: { cols: number; rows: number }) => void): () => void {
    this.resize = cb;
    return () => (this.resize = null);
  }
  onFocus(cb: (focused: boolean) => void): () => void {
    this.focus_ = cb;
    return () => (this.focus_ = null);
  }
  dispose(): void {
    this.disposed = true;
  }
}

const helloResult = {
  generation: 1,
  version: '0.1.0',
  core: { id: 'abc', name: 'gandalf' },
  framed: true,
  methods: [],
  features: [],
};

const term = (address: string, extra: Partial<Terminal> = {}): Terminal => ({
  address,
  labels: {},
  argv: ['sh'],
  cwd: '/',
  state: 'live',
  created_ms: 1,
  screen: 'exact',
  cols: 80,
  rows: 24,
  ...extra,
});

describe('TerminalView', () => {
  let sockets: FakeSocket[];
  let handles: FakeHandle[];
  let terminals: ReturnType<typeof signal<Terminal[]>>;
  let ensureStarted: ReturnType<typeof vi.fn>;
  let check: ReturnType<typeof vi.fn>;
  let harness: RouterTestingHarness;
  let scheme: ReturnType<typeof signal<'light' | 'dark'>>;
  let fontSize: ReturnType<typeof signal<number>>;
  let scrollSpeed: ReturnType<typeof signal<number>>;
  let inputMode: ReturnType<typeof signal<'compose' | 'direct'>>;
  let createArgs: unknown[][];
  const socket = () => sockets[sockets.length - 1];
  const handle = () => handles[handles.length - 1];

  beforeEach(async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    sockets = [];
    handles = [];
    terminals = signal<Terminal[]>([]);
    scheme = signal<'light' | 'dark'>('dark');
    fontSize = signal(12);
    scrollSpeed = signal(2);
    inputMode = signal<'compose' | 'direct'>('compose');
    createArgs = [];
    ensureStarted = vi.fn(async () => undefined);
    check = vi.fn(async () => 'authenticated' as SessionState);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', children: [] },
          { path: 'login', children: [] },
          { path: 't/:address', component: TerminalView },
        ]),
        { provide: HC_SOCKET_FACTORY, useValue: () => sockets[sockets.push(new FakeSocket()) - 1] },
        {
          provide: XtermFactory,
          useValue: {
            create: (...args: unknown[]) => {
              createArgs.push(args.slice(1));
              return handles[handles.push(new FakeHandle()) - 1];
            },
          },
        },
        { provide: ColorScheme, useValue: { scheme } },
        {
          provide: Settings,
          useValue: {
            terminalFontSize: fontSize,
            scrollSpeed,
            inputMode,
            returnKey: signal('send'),
            setInputMode: (mode: 'compose' | 'direct') => inputMode.set(mode),
          },
        },
        { provide: Session, useValue: { check } },
        { provide: TerminalStore, useValue: { terminals, stream: signal('live'), ensureStarted } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => vi.unstubAllGlobals());

  const el = () => harness.routeNativeElement as HTMLElement;

  /** Completes the websocket handshake of the latest socket. */
  async function handshake(): Promise<void> {
    await tick();
    socket().onopen?.({} as Event);
    socket().receive(
      enc.encode(JSON.stringify({ jsonrpc: '2.0', id: 0, result: helloResult }) + '\n'),
    );
    await tick();
  }

  const requests = () =>
    socket()
      .frames()
      .filter((f) => f.channel === 0 && f.kind === FrameKind.DATA)
      .map(
        (f) =>
          JSON.parse(dec.decode(f.payload)) as {
            id: number;
            method: string;
            params: Record<string, unknown>;
          },
      );
  const attachRequests = () => requests().filter((r) => r.method === 'terminal.attach');

  function reply(id: number, result: unknown): void {
    socket().receive(
      encodeFrame(0, FrameKind.DATA, enc.encode(JSON.stringify({ jsonrpc: '2.0', id, result }))),
    );
  }
  function replyError(id: number, kind: string, message = kind): void {
    socket().receive(
      encodeFrame(
        0,
        FrameKind.DATA,
        enc.encode(
          JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message, data: { kind } } }),
        ),
      ),
    );
  }

  /** Opens `address`, handshakes and answers terminal.attach with `channel`. */
  async function attached(address = 'rohan/t7', channel = 5): Promise<void> {
    await harness.navigateByUrl(`/t/${encodeURIComponent(address)}`, TerminalView);
    await handshake();
    const attach = attachRequests().at(-1);
    reply(attach!.id, { channel, terminal: term(address), resize_notifications: false });
    await tick();
    harness.fixture.detectChanges();
  }

  const framesOn = (channel: number) =>
    socket()
      .frames()
      .filter((f) => f.channel === channel);

  it('decodes a remote address from the URL and attaches with size, history and display facts', async () => {
    await harness.navigateByUrl('/t/popos-tailscale%2Ft1', TerminalView);
    await handshake();
    expect(attachRequests()).toHaveLength(1);
    expect(attachRequests()[0].params).toEqual({
      terminal: 'popos-tailscale/t1',
      cols: 80,
      rows: 24,
      history: 1000,
      display: { bg: '#0b0b0c', fg: '#e5e5e5', cursor: '#e5e5e5', cell: [8, 16] },
    });
  });

  it('builds the link to a terminal so that its address survives the round trip', () => {
    const url = TestBed.inject(Router).serializeUrl(
      TestBed.inject(Router).createUrlTree(['/t', 'popos-tailscale/t1']),
    );
    expect(url).toBe('/t/popos-tailscale%2Ft1');
  });

  it('starts the terminal store for the header without waiting for it', async () => {
    await attached();
    expect(ensureStarted).toHaveBeenCalled();
  });

  describe('output', () => {
    it('writes channel DATA untouched, and credits it only after xterm consumed it', async () => {
      await attached();
      let consume!: () => void;
      handle().writeGate = new Promise<void>((resolve) => (consume = resolve));
      socket().receive(
        encodeFrame(5, FrameKind.DATA, new Uint8Array([0x1b, 0x5b, 0x32, 0x4a, 0xff])),
      );
      await tick();
      expect(Array.from(handle().written[0])).toEqual([0x1b, 0x5b, 0x32, 0x4a, 0xff]);
      expect(framesOn(5).filter((f) => f.kind === FrameKind.CREDIT)).toHaveLength(0);
      consume();
      await tick();
      const credit = framesOn(5).find((f) => f.kind === FrameKind.CREDIT)!;
      expect(
        new DataView(credit.payload.buffer, credit.payload.byteOffset).getUint32(0, true),
      ).toBe(5);
    });

    it('delivers the first paint that arrives in the same message as the attach reply', async () => {
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      await handshake();
      const id = attachRequests()[0].id;
      const replyFrame = encodeFrame(
        0,
        FrameKind.DATA,
        enc.encode(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { channel: 5, terminal: term('rohan/t7'), resize_notifications: false },
          }),
        ),
      );
      const paint = encodeFrame(5, FrameKind.DATA, enc.encode('prompt$ '));
      const both = new Uint8Array(replyFrame.length + paint.length);
      both.set(replyFrame);
      both.set(paint, replyFrame.length);
      socket().receive(both);
      await tick();
      expect(dec.decode(handle().written[0])).toBe('prompt$ ');
    });
  });

  describe('compose mode', () => {
    const field = () => el().querySelector<HTMLTextAreaElement>('app-compose-bar textarea')!;
    const sendButton = () =>
      el().querySelector<HTMLButtonElement>('app-compose-bar button[aria-label="Send"]')!;
    const keyButton = (label: string) =>
      Array.from(el().querySelectorAll<HTMLButtonElement>('app-key-bar button')).find(
        (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label,
      )!;
    const sentData = (channel = 5) =>
      framesOn(channel)
        .filter((f) => f.kind === FrameKind.DATA)
        .map((f) => dec.decode(f.payload));
    const typeText = (text: string) => {
      field().value = text;
      field().dispatchEvent(new Event('input'));
      harness.fixture.detectChanges();
    };

    it('is the default: the field sits between the screen and the key bar', async () => {
      await attached();
      expect(field()).toBeTruthy();
      const compose = el().querySelector('app-compose-bar')!;
      expect(compose.previousElementSibling?.querySelector('.xterm, div')).toBeTruthy();
      expect(compose.nextElementSibling?.tagName.toLowerCase()).toBe('app-key-bar');
      expect(handle().nativeKeyboard.at(-1)).toBe(false);
    });

    it('sends the text as a paste, then Enter as its own DATA, and clears the field', async () => {
      await attached();
      typeText('echo hi');
      sendButton().click();
      harness.fixture.detectChanges();
      expect(handle().pasted).toEqual(['echo hi']);
      expect(sentData()).toEqual(['echo hi', '\r']);
      expect(field().value).toBe('');
    });

    it('does not send while not attached and keeps the text', async () => {
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      await handshake();
      harness.fixture.detectChanges();
      typeText('wait');
      expect(field().disabled).toBe(true);
      expect(sendButton().disabled).toBe(true);
      expect(field().value).toBe('wait');
      expect(handle().pasted).toEqual([]);
    });

    it('sends Ctrl+char for the next character typed in the field and releases Ctrl', async () => {
      await attached();
      keyButton('Ctrl').click();
      harness.fixture.detectChanges();
      const event = new InputEvent('beforeinput', {
        data: 'c',
        inputType: 'insertText',
        cancelable: true,
      });
      field().dispatchEvent(event);
      harness.fixture.detectChanges();
      expect(event.defaultPrevented).toBe(true);
      expect(
        framesOn(5)
          .filter((f) => f.kind === FrameKind.DATA)
          .map((f) => Array.from(f.payload)),
      ).toEqual([[0x03]]);
      expect(keyButton('Ctrl').getAttribute('aria-pressed')).toBe('false');
    });

    it('the key bar Enter sends a bare CR', async () => {
      await attached();
      keyButton('Enter key').click();
      expect(sentData()).toEqual(['\r']);
    });

    it('toggles to direct typing: field hidden, xterm focused and allowed to use the keyboard', async () => {
      await attached();
      const focuses = handle().focuses;
      keyButton('Direct typing').click();
      harness.fixture.detectChanges();
      expect(inputMode()).toBe('direct');
      expect(field()).toBeNull();
      expect(handle().nativeKeyboard.at(-1)).toBe(true);
      expect(handle().focuses).toBeGreaterThan(focuses);
      expect(keyButton('Direct typing').getAttribute('aria-pressed')).toBe('true');
      handle().input?.(enc.encode('x'));
      expect(sentData()).toEqual(['x']);
    });

    it('starts in direct mode when the setting says so', async () => {
      inputMode.set('direct');
      await attached();
      expect(field()).toBeNull();
      expect(handle().nativeKeyboard.at(-1)).toBe(true);
    });

    it('toggles back to the field', async () => {
      inputMode.set('direct');
      await attached();
      keyButton('Direct typing').click();
      harness.fixture.detectChanges();
      expect(inputMode()).toBe('compose');
      expect(field()).toBeTruthy();
      expect(handle().nativeKeyboard.at(-1)).toBe(false);
    });
  });

  describe('key bar', () => {
    const bar = () => Array.from(el().querySelectorAll<HTMLButtonElement>('app-key-bar button'));
    const press = (label: string) => {
      bar()
        .find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label)!
        .click();
      harness.fixture.detectChanges();
    };
    const sent = (channel = 5) =>
      framesOn(channel)
        .filter((f) => f.kind === FrameKind.DATA)
        .map((f) => Array.from(f.payload));

    it('sends an arrow as CSI, or SS3 in application cursor mode', async () => {
      await attached();
      press('Arrow up');
      handle().applicationCursorKeys = true;
      press('Arrow up');
      expect(sent()).toEqual([
        [0x1b, 0x5b, 0x41],
        [0x1b, 0x4f, 0x41],
      ]);
    });

    it('turns the next keyboard key into Ctrl+key and releases Ctrl', async () => {
      await attached();
      press('Ctrl');
      expect(bar()[3].getAttribute('aria-pressed')).toBe('true');
      handle().input?.(enc.encode('c'));
      harness.fixture.detectChanges();
      handle().input?.(enc.encode('c'));
      expect(sent()).toEqual([[0x03], [0x63]]);
      expect(bar()[3].getAttribute('aria-pressed')).toBe('false');
    });

    it('sends Ctrl+arrow from the bar and releases Ctrl', async () => {
      await attached();
      press('Ctrl');
      press('Arrow up');
      expect(sent()).toEqual([[0x1b, 0x5b, 0x31, 0x3b, 0x35, 0x41]]);
      expect(bar()[3].getAttribute('aria-pressed')).toBe('false');
    });

    it('sends input without a Ctrl form unchanged and still releases Ctrl', async () => {
      await attached();
      press('Ctrl');
      handle().input?.(enc.encode('1'));
      expect(sent()).toEqual([[0x31]]);
    });

    it('keeps the keys disabled until attached', async () => {
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      await handshake();
      harness.fixture.detectChanges();
      expect(bar().slice(1).every((b) => b.disabled)).toBe(true);
    });
  });

  describe('input, resize, focus', () => {
    it('sends typed input as DATA on the channel', async () => {
      await attached();
      handle().input?.(enc.encode('ls\r'));
      const data = framesOn(5).filter((f) => f.kind === FrameKind.DATA);
      expect(dec.decode(data[0].payload)).toBe('ls\r');
    });

    it('drops input typed before the attach reply', async () => {
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      await handshake();
      handle().input?.(enc.encode('x'));
      expect(
        socket()
          .frames()
          .filter((f) => f.channel !== 0),
      ).toHaveLength(0);
    });

    it('sends RESIZE after the attach reply, debounced', async () => {
      await attached();
      handle().resize?.({ cols: 100, rows: 30 });
      handle().resize?.({ cols: 120, rows: 40 });
      expect(framesOn(5).filter((f) => f.kind === FrameKind.RESIZE)).toHaveLength(0);
      await tick(80);
      const resizes = framesOn(5).filter((f) => f.kind === FrameKind.RESIZE);
      expect(resizes).toHaveLength(1);
      expect(Array.from(resizes[0].payload)).toEqual([120, 0, 40, 0]);
    });

    it('ignores resizes before the attach reply, and sends the real size right after it if it changed', async () => {
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      await handshake();
      handle().resize?.({ cols: 90, rows: 20 });
      handle().cols = 90;
      handle().rows = 20;
      await tick(80);
      expect(
        socket()
          .frames()
          .filter((f) => f.kind === FrameKind.RESIZE),
      ).toHaveLength(0);
      reply(attachRequests()[0].id, {
        channel: 5,
        terminal: term('rohan/t7'),
        resize_notifications: false,
      });
      await tick(80);
      const resizes = framesOn(5).filter((f) => f.kind === FrameKind.RESIZE);
      expect(resizes.map((f) => Array.from(f.payload))).toEqual([[90, 0, 20, 0]]);
    });

    it('sends FOCUS on focus and blur', async () => {
      await attached();
      handle().focus_?.(true);
      handle().focus_?.(false);
      expect(
        framesOn(5)
          .filter((f) => f.kind === FrameKind.FOCUS)
          .map((f) => Array.from(f.payload)),
      ).toEqual([[1], [0]]);
    });
  });

  describe('endings', () => {
    it('shows "Program exited (code N)" with a way back and no Reattach when the program exited', async () => {
      await attached();
      socket().receive(
        encodeFrame(
          5,
          FrameKind.CLOSE,
          enc.encode('{"reason":"exited","exit_code":3,"signal":null}'),
        ),
      );
      harness.fixture.detectChanges();
      expect(el().querySelector('[role="status"]')?.textContent).toContain(
        'Program exited (code 3)',
      );
      expect(el().textContent).not.toContain('Reattach');
      expect(el().querySelector('a[href="/"]')).toBeTruthy();
    });

    it('shows the reason and Reattach for other closes, and reattaches on a fresh xterm reset', async () => {
      await attached();
      socket().receive(
        encodeFrame(
          5,
          FrameKind.CLOSE,
          enc.encode('{"reason":"killed","exit_code":null,"signal":"SIGKILL"}'),
        ),
      );
      harness.fixture.detectChanges();
      expect(el().textContent).toContain('killed');
      const button = Array.from(el().querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Reattach'),
      );
      expect(button).toBeTruthy();
      button!.click();
      await tick();
      expect(handle().resets).toBe(1);
      expect(attachRequests()).toHaveLength(2);
      reply(attachRequests()[1].id, {
        channel: 6,
        terminal: term('rohan/t7'),
        resize_notifications: false,
      });
      await tick();
      harness.fixture.detectChanges();
      expect(el().textContent).not.toContain('Reattach');
      handle().input?.(enc.encode('a'));
      expect(framesOn(6).some((f) => f.kind === FrameKind.DATA)).toBe(true);
    });

    it('does not shout when the connection drops: no alert, a quiet "Reconnecting…"', async () => {
      await attached();
      socket().close();
      harness.fixture.detectChanges();
      expect(el().querySelector('[role="alert"]')).toBeNull();
      expect(el().querySelector('[data-connection]')?.textContent).toContain('Reconnecting…');
      expect(el().textContent).not.toContain('Connection lost');
    });

    it.each([
      ['not_found', 'Terminal not found'],
      ['finished', 'This terminal has finished'],
      ['unavailable', 'Terminal is unavailable'],
      ['machine_unknown', 'Unknown machine'],
    ])('explains attach error %s and links back', async (kind, text) => {
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      await handshake();
      replyError(attachRequests()[0].id, kind);
      await tick();
      harness.fixture.detectChanges();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain(text);
      expect(el().querySelector('a[href="/"]')).toBeTruthy();
    });

    it('goes to /login when the websocket fails and the session is no longer valid', async () => {
      check.mockResolvedValue('anonymous');
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      await tick();
      socket().close();
      await tick();
      expect(TestBed.inject(Router).url).toBe('/login');
    });

    it('shows a retryable error when the websocket fails but the session is valid', async () => {
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      await tick();
      socket().close();
      await tick();
      harness.fixture.detectChanges();
      expect(el().querySelector('[role="alert"]')).toBeTruthy();
      expect(el().textContent).toContain('Reattach');
    });
  });

  describe('reconnect', () => {
    /** Drops the socket, then lets the network "come back" and completes the new handshake. */
    async function dropAndRecover(): Promise<void> {
      socket().close();
      await tick();
      window.dispatchEvent(new Event('online'));
      await handshake();
    }

    it('re-attaches by itself after the socket comes back, repainting from a reset screen', async () => {
      await attached();
      handle().input?.(enc.encode('a'));
      await dropAndRecover();
      expect(sockets).toHaveLength(2);
      expect(handle().resets).toBe(1);
      expect(attachRequests()).toHaveLength(1); // the new socket's own attach
      expect(attachRequests()[0].params).toMatchObject({
        terminal: 'rohan/t7',
        cols: 80,
        rows: 24,
        history: 1000,
      });
      reply(attachRequests()[0].id, {
        channel: 3,
        terminal: term('rohan/t7'),
        resize_notifications: false,
      });
      await tick();
      harness.fixture.detectChanges();
      expect(el().querySelector('[data-connection]')?.textContent).toContain('Live');
      expect(el().querySelector('[role="alert"]')).toBeNull();
      handle().input?.(enc.encode('b'));
      expect(framesOn(3).some((f) => f.kind === FrameKind.DATA)).toBe(true);
    });

    it('drops keys while disconnected and disables the key bar', async () => {
      await attached();
      const before = socket().sent.length;
      socket().close();
      harness.fixture.detectChanges();
      handle().input?.(enc.encode('x'));
      expect(socket().sent.length).toBe(before);
      expect(
        Array.from(el().querySelectorAll<HTMLButtonElement>('app-key-bar button'))
          .slice(1)
          .every((b) => b.disabled),
      ).toBe(true);
    });

    it('clears a pending Ctrl so it does not leak into the new session', async () => {
      await attached();
      const ctrl = Array.from(el().querySelectorAll<HTMLButtonElement>('app-key-bar button')).find(
        (b) => b.textContent?.trim() === 'Ctrl',
      )!;
      ctrl.click();
      harness.fixture.detectChanges();
      expect(ctrl.getAttribute('aria-pressed')).toBe('true');
      socket().close();
      harness.fixture.detectChanges();
      expect(ctrl.getAttribute('aria-pressed')).toBe('false');
    });

    it('does not re-attach after the program exited', async () => {
      await attached();
      socket().receive(
        encodeFrame(
          5,
          FrameKind.CLOSE,
          enc.encode('{"reason":"exited","exit_code":0,"signal":null}'),
        ),
      );
      await dropAndRecover();
      expect(sockets).toHaveLength(2);
      expect(attachRequests()).toHaveLength(0);
      harness.fixture.detectChanges();
      expect(el().textContent).toContain('Program exited (code 0)');
    });

    it('does not re-attach after the terminal was killed', async () => {
      await attached();
      socket().receive(
        encodeFrame(
          5,
          FrameKind.CLOSE,
          enc.encode('{"reason":"killed","exit_code":null,"signal":null}'),
        ),
      );
      await dropAndRecover();
      expect(attachRequests()).toHaveLength(0);
    });

    it('keeps the "not found" banner when the terminal is gone after the reconnect', async () => {
      await attached();
      await dropAndRecover();
      replyError(attachRequests()[0].id, 'not_found');
      await tick();
      harness.fixture.detectChanges();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('Terminal not found');
      expect(attachRequests()).toHaveLength(1);
    });

    it('goes to /login when the session expired while the socket was down', async () => {
      await attached();
      check.mockResolvedValue('anonymous');
      socket().close();
      await tick();
      window.dispatchEvent(new Event('online'));
      await tick();
      socket().close(); // the upgrade is rejected
      await tick(10);
      expect(TestBed.inject(Router).url).toBe('/login');
    });
  });

  describe('header', () => {
    it('shows a labelled back link, the terminal name, title and status badge from the store', async () => {
      terminals.set([
        term('rohan/t7', {
          name: 'build',
          title: 'cargo watch',
          status: { state: 'blocked', msg: 'Allow?' },
        }),
      ]);
      await attached();
      const back = el().querySelector('a[href="/"]')!;
      expect(back.getAttribute('aria-label')).toBe('Back to terminals');
      expect(el().querySelector('header')?.textContent).toContain('build');
      expect(el().querySelector('header')?.textContent).toContain('cargo watch');
      expect(el().querySelector('[data-status]')?.textContent?.trim()).toBe('blocked');
    });

    it('falls back to the address when the store does not know the terminal', async () => {
      await attached();
      expect(el().querySelector('header')?.textContent).toContain('rohan/t7');
      expect(el().querySelector('[data-status]')).toBeNull();
    });

    it('shows the connection state', async () => {
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      harness.fixture.detectChanges();
      expect(el().querySelector('header [data-connection]')?.textContent).toContain('Connecting');
      await handshake();
      reply(attachRequests()[0].id, {
        channel: 5,
        terminal: term('rohan/t7'),
        resize_notifications: false,
      });
      await tick();
      harness.fixture.detectChanges();
      expect(el().querySelector('header [data-connection]')?.textContent).toContain('Live');
    });
  });

  describe('theme and text size', () => {
    it('creates xterm with the current scheme and font size', async () => {
      await attached();
      expect(createArgs).toEqual([['dark', 12, 2]]);
    });

    it('pushes scheme and font size changes into xterm', async () => {
      await attached();
      scheme.set('light');
      fontSize.set(15);
      await harness.fixture.whenStable();
      expect(handle().schemes.at(-1)).toBe('light');
      expect(handle().sizes.at(-1)).toBe(15);
    });

    it('pushes scroll speed changes into xterm live', async () => {
      await attached();
      scrollSpeed.set(3.5);
      await harness.fixture.whenStable();
      expect(handle().speeds.at(-1)).toBe(3.5);
    });

    it('uses theme tokens instead of hard-coded colors', async () => {
      await attached();
      expect(el().innerHTML).not.toMatch(/#[0-9a-f]{3,6}|zinc-|white\/15/i);
    });

    it('links to the settings page from the header', async () => {
      await attached();
      const link = el().querySelector('header a[href^="/settings"]')!;
      expect(link.getAttribute('aria-label')).toBe('Settings');
      // the current URL travels along, so settings can send the user back here
      expect(link.getAttribute('href')).toBe('/settings?from=%2Ft%2Frohan%252Ft7');
    });
  });

  describe('lifecycle', () => {
    it('sends CLOSE on the channel and disposes xterm when destroyed', async () => {
      await attached();
      await harness.navigateByUrl('/');
      expect(framesOn(5).some((f) => f.kind === FrameKind.CLOSE)).toBe(true);
      expect(handles[0].disposed).toBe(true);
    });

    it('does not leak channels across list -> terminal -> back -> another terminal', async () => {
      await attached('t1', 5);
      await harness.navigateByUrl('/');
      await harness.navigateByUrl('/t/t2', TerminalView);
      await tick();
      const attach = attachRequests().at(-1)!;
      reply(attach.id, { channel: 6, terminal: term('t2'), resize_notifications: false });
      await tick();
      await harness.navigateByUrl('/');
      const closes = socket()
        .frames()
        .filter((f) => f.kind === FrameKind.CLOSE)
        .map((f) => f.channel);
      expect(closes).toEqual([5, 6]);
      expect(handles.every((h) => h.disposed)).toBe(true);
      expect(sockets).toHaveLength(1);
    });

    it('closes a channel whose attach reply arrives after the view was destroyed', async () => {
      await harness.navigateByUrl('/t/rohan%2Ft7', TerminalView);
      await handshake();
      const id = attachRequests()[0].id;
      await harness.navigateByUrl('/');
      reply(id, { channel: 9, terminal: term('rohan/t7'), resize_notifications: false });
      await tick();
      expect(framesOn(9).some((f) => f.kind === FrameKind.CLOSE)).toBe(true);
      expect(handle().written).toHaveLength(0);
    });
  });
});
