import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  DestroyRef,
  Injector,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideSettings } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HcClient, HcError } from '../../core/hc/hc-client';
import { TerminalStore } from '../../core/hc/terminal-store';
import type { AttachResult, ChannelCloseReason } from '../../core/hc/types';
import { LayoutProbe, measureLayout } from '../../core/pwa/layout-probe';
import { Session } from '../../core/session/session';
import { Settings } from '../../core/settings/settings';
import { ColorScheme } from '../../core/theme/color-scheme';
import { textToBytes } from '../../core/xterm/input-bytes';
import { barKeyBytes, ctrlBytes, type BarKey } from '../../core/xterm/key-bytes';
import { XtermFactory, type XtermHandle } from '../../core/xterm/xterm-factory';
import { StatusLabel } from '../status-label/status-label';
import { keyboardViewport, type KeyboardViewport } from './keyboard-viewport';
import { ComposeBar } from './compose-bar/compose-bar';
import { KeyBar } from './key-bar/key-bar';

/** `reconnecting`: the socket dropped and the client is bringing it back; we re-attach when it does. */
type Phase = 'attaching' | 'attached' | 'reconnecting' | 'ended' | 'failed';

interface Banner {
  text: string;
  /** `alert` for failures, `status` for an ordinary ending. */
  role: 'alert' | 'status';
  canReattach: boolean;
}

const HISTORY_LINES = 1000;
const RESIZE_DEBOUNCE_MS = 50;

const ATTACH_ERRORS: Record<string, string> = {
  not_found: 'Terminal not found',
  finished: 'This terminal has finished',
  unavailable: 'Terminal is unavailable (lost, or still starting)',
  machine_unknown: 'Unknown machine',
};

const CLOSE_REASONS: Record<string, string> = {
  connection_closed: 'Connection lost',
  killed: 'Terminal was killed',
  server_stop: 'Core stopped',
};

/** Failures of the socket itself, as opposed to core answering an error. */
const TRANSPORT_ERRORS = new Set([
  'connection_closed',
  'protocol_error',
  'invalid_state',
  'not_connected',
]);

@Component({
  imports: [RouterLink, ComposeBar, KeyBar, NgIcon, StatusLabel, ...HlmButtonImports],
  viewProviders: [provideIcons({ lucideChevronLeft, lucideSettings })],
  selector: 'app-terminal-view',
  styleUrl: './terminal-view.css',
  templateUrl: './terminal-view.html',
})
export class TerminalView {
  protected readonly client = inject(HcClient);
  private readonly store = inject(TerminalStore);
  private readonly session = inject(Session);
  protected readonly router = inject(Router);
  private readonly factory = inject(XtermFactory);
  private readonly document = inject(DOCUMENT);
  private readonly colorScheme = inject(ColorScheme);
  private readonly settings = inject(Settings);
  private readonly injector = inject(Injector);
  private readonly layoutProbe = inject(LayoutProbe);
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');

  /** Addresses contain `/` (`rohan/t7`); the router hands the param back decoded. */
  protected readonly address = inject(ActivatedRoute).snapshot.paramMap.get('address') ?? '';

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('screen');
  private readonly compose = viewChild(ComposeBar);
  protected readonly inputMode = this.settings.inputMode;

  protected readonly phase = signal<Phase>('attaching');
  /** One-shot Ctrl from the key bar: the next key, bar or keyboard, goes out as Ctrl+key. */
  protected readonly ctrl = signal(false);
  protected readonly banner = signal<Banner | null>(null);
  /** Visible area while the iOS keyboard is up; null means the layout viewport is right. */
  protected readonly viewport = signal<KeyboardViewport | null>(null);

  protected readonly terminal = computed(() =>
    this.store.terminals().find((t) => t.address === this.address),
  );

  private handle: XtermHandle | null = null;
  private channel: number | null = null;
  private attachedSize: { cols: number; rows: number } | null = null;
  private attachRun = 0;
  private destroyed = false;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly cleanups: (() => void)[] = [];

  constructor() {
    afterNextRender(() => this.init());
    // Read the signal before touching the handle, or a null handle would hide the dependency.
    effect(() => {
      const scheme = this.colorScheme.scheme();
      this.handle?.setScheme(scheme);
    });
    effect(() => {
      const speed = this.settings.scrollSpeed();
      this.handle?.setScrollSpeed(speed);
    });
    effect(() => {
      const size = this.settings.terminalFontSize();
      this.handle?.setFontSize(size);
    });
    effect(() => {
      // In compose mode the message field owns the keyboard, so xterm must not summon it.
      const mode = this.inputMode();
      this.handle?.setNativeKeyboard(mode === 'direct');
      if (this.handle) untracked(() => this.focusInput());
    });
    effect(() => {
      if (this.phase() !== 'reconnecting') return;
      const state = this.client.state();
      untracked(() => {
        if (state === 'open') this.reattach();
        else if (state === 'closed') this.onGaveUp();
      });
    });
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  protected reattach(): void {
    this.ctrl.set(false);
    this.handle?.reset();
    void this.attach();
  }

  protected onBarKey(key: BarKey): void {
    if (this.channel === null || !this.handle) return;
    const bytes = barKeyBytes(key, {
      ctrl: this.ctrl(),
      appCursor: this.handle.applicationCursorKeys,
    });
    this.client.sendData(this.channel, bytes);
    this.ctrl.set(false);
  }

  protected toggleMode(): void {
    this.settings.setInputMode(this.inputMode() === 'compose' ? 'direct' : 'compose');
  }

  /** A message from the compose field: pasted (so bracketed paste and newlines work), then Enter. */
  protected onCompose(text: string): void {
    if (this.channel === null || !this.handle) return;
    this.ctrl.set(false);
    this.handle.paste(text);
    this.client.sendData(this.channel, barKeyBytes('enter', { ctrl: false, appCursor: false }));
  }

  /** The character typed into the compose field while Ctrl was on. */
  protected onComposeCtrl(char: string): void {
    if (this.channel === null) return;
    const bytes = textToBytes(char);
    this.client.sendData(this.channel, ctrlBytes(bytes) ?? bytes);
    this.ctrl.set(false);
  }

  /** Focus goes to whichever input the current mode uses. */
  private focusInput(): void {
    if (this.inputMode() === 'direct') {
      this.handle?.focus();
      return;
    }
    // The field may have just been rendered by the mode switch.
    afterNextRender(() => this.compose()?.focus(), { injector: this.injector });
  }

  private init(): void {
    const handle = this.factory.create(
      this.container().nativeElement,
      this.colorScheme.scheme(),
      this.settings.terminalFontSize(),
      this.settings.scrollSpeed(),
    );
    this.handle = handle;
    handle.setNativeKeyboard(this.inputMode() === 'direct');
    this.cleanups.push(
      handle.onInput((bytes) => {
        if (this.channel === null) return;
        if (this.ctrl()) {
          this.ctrl.set(false);
          this.client.sendData(this.channel, ctrlBytes(bytes) ?? bytes);
          return;
        }
        this.client.sendData(this.channel, bytes);
      }),
      handle.onResize((size) => this.scheduleResize(size)),
      handle.onFocus((focused) => {
        if (this.channel !== null) this.client.sendFocus(this.channel, focused);
      }),
      this.trackVisualViewport(),
      this.trackLayout(),
    );
    void this.attach();
  }

  private async attach(): Promise<void> {
    const run = ++this.attachRun;
    const stale = () => this.destroyed || run !== this.attachRun;
    const handle = this.handle;
    if (!handle) return;
    this.banner.set(null);
    this.phase.set('attaching');
    this.attachedSize = null;

    try {
      await this.client.ensureOpen();
      if (stale()) return;
      void this.store.ensureStarted().catch(() => undefined);
      handle.fit();
      const { cols, rows } = handle;
      const result = await this.client.call<AttachResult>('terminal.attach', {
        terminal: this.address,
        cols,
        rows,
        history: HISTORY_LINES,
        display: handle.display(),
      });
      const channel = result.channel;
      if (stale()) {
        // Left the screen while core was answering: give the channel straight back.
        this.client.openChannel(
          channel,
          () => undefined,
          () => undefined,
        );
        this.client.closeChannel(channel);
        return;
      }
      this.channel = channel;
      this.attachedSize = { cols, rows };
      this.client.openChannel(
        channel,
        (bytes) => handle.write(bytes),
        (reason) => this.onChannelClosed(channel, reason),
      );
      this.phase.set('attached');
      if (handle.cols !== cols || handle.rows !== rows)
        this.sendSize({ cols: handle.cols, rows: handle.rows });
      this.focusInput();
    } catch (error) {
      if (stale()) return;
      await this.onAttachFailed(error);
    }
  }

  private async onAttachFailed(error: unknown): Promise<void> {
    if (error instanceof HcError && TRANSPORT_ERRORS.has(error.kind)) {
      // The client is already bringing the socket back; the effect above re-attaches when it is.
      if (this.client.state() !== 'closed') {
        this.phase.set('reconnecting');
        return;
      }
      this.phase.set('failed');
      // A rejected upgrade (401) and a dead bridge look the same here; ask the bridge which it is.
      if ((await this.session.check()) === 'anonymous') {
        await this.router.navigateByUrl('/login');
        return;
      }
      this.banner.set({ text: 'Could not reach the bridge', role: 'alert', canReattach: true });
      return;
    }
    this.phase.set('failed');
    const kind = error instanceof HcError ? error.kind : '';
    const text =
      ATTACH_ERRORS[kind] ?? (error instanceof Error ? error.message : 'Could not attach');
    this.banner.set({ text, role: 'alert', canReattach: false });
  }

  private onChannelClosed(channel: number, reason: ChannelCloseReason | null): void {
    if (this.channel !== channel) return;
    this.channel = null;
    this.attachedSize = null;
    if (reason?.reason === 'exited') {
      const code = reason.exit_code ?? 'unknown';
      this.phase.set('ended');
      this.banner.set({
        text: `Program exited (code ${code})`,
        role: 'status',
        canReattach: false,
      });
      return;
    }
    if (reason?.reason === 'connection_closed' && this.client.state() !== 'closed') {
      this.ctrl.set(false);
      this.phase.set('reconnecting');
      return;
    }
    const why = reason ? (CLOSE_REASONS[reason.reason] ?? `Closed (${reason.reason})`) : 'Detached';
    this.phase.set('failed');
    this.banner.set({ text: why, role: 'alert', canReattach: true });
  }

  private onGaveUp(): void {
    this.phase.set('failed');
    this.banner.set({ text: 'Connection lost', role: 'alert', canReattach: true });
  }

  private scheduleResize(size: { cols: number; rows: number }): void {
    if (this.channel === null || this.attachedSize === null) return;
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.sendSize(size), RESIZE_DEBOUNCE_MS);
  }

  private sendSize(size: { cols: number; rows: number }): void {
    if (this.channel === null) return;
    this.attachedSize = size;
    this.client.sendResize(this.channel, size.cols, size.rows);
  }

  /** Keeps the terminal above the iOS keyboard: the layout viewport does not shrink, this one does. */
  private trackVisualViewport(): () => void {
    const win = this.document.defaultView;
    const viewport = win?.visualViewport;
    if (!win || !viewport) return () => undefined;
    const update = () =>
      this.viewport.set(
        keyboardViewport({
          innerHeight: win.innerHeight,
          height: viewport.height,
          offsetTop: viewport.offsetTop,
        }),
      );
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }

  /** Feeds Settings > Diagnostics with where the parts of this screen really sit. */
  private trackLayout(): () => void {
    const root = this.root().nativeElement;
    const measure = () => this.layoutProbe.last.set(measureLayout(root, this.document));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root);
    this.document.defaultView?.addEventListener('resize', measure);
    measure();
    return () => {
      observer?.disconnect();
      this.document.defaultView?.removeEventListener('resize', measure);
    };
  }

  private teardown(): void {
    this.destroyed = true;
    clearTimeout(this.resizeTimer);
    if (this.channel !== null) this.client.closeChannel(this.channel);
    this.channel = null;
    for (const cleanup of this.cleanups) cleanup();
    this.handle?.dispose();
    this.handle = null;
  }
}
