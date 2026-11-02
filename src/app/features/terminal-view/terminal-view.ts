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
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HcClient, HcError } from '../../core/hc/hc-client';
import { statusBadgeClass } from '../../core/hc/status-badge';
import { TerminalStore } from '../../core/hc/terminal-store';
import type { AttachResult, ChannelCloseReason } from '../../core/hc/types';
import { Session } from '../../core/session/session';
import { Settings } from '../../core/settings/settings';
import { ColorScheme } from '../../core/theme/color-scheme';
import { barKeyBytes, ctrlBytes, type BarKey } from '../../core/xterm/key-bytes';
import { XtermFactory, type XtermHandle } from '../../core/xterm/xterm-factory';
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
  imports: [RouterLink, KeyBar, ...HlmButtonImports],
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

  /** Addresses contain `/` (`rohan/t7`); the router hands the param back decoded. */
  protected readonly address = inject(ActivatedRoute).snapshot.paramMap.get('address') ?? '';

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('screen');

  protected readonly phase = signal<Phase>('attaching');
  /** One-shot Ctrl from the key bar: the next key, bar or keyboard, goes out as Ctrl+key. */
  protected readonly ctrl = signal(false);
  protected readonly banner = signal<Banner | null>(null);
  /** Visible area while the iOS keyboard is up; null means the layout viewport is right. */
  protected readonly viewport = signal<{ height: number; top: number } | null>(null);

  protected readonly terminal = computed(() =>
    this.store.terminals().find((t) => t.address === this.address),
  );
  protected readonly badge = statusBadgeClass;

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

  private init(): void {
    const handle = this.factory.create(
      this.container().nativeElement,
      this.colorScheme.scheme(),
      this.settings.terminalFontSize(),
      this.settings.scrollSpeed(),
    );
    this.handle = handle;
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
      handle.focus();
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
    const viewport = this.document.defaultView?.visualViewport;
    if (!viewport) return () => undefined;
    const update = () => this.viewport.set({ height: viewport.height, top: viewport.offsetTop });
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
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
