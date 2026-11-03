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
import { lucideFileDiff, lucideSettings } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { LayoutMenu } from '../layout/layout-menu/layout-menu';
import { ChatStream } from '../../core/chat/chat-stream';
import { slashCommands } from '../../core/chat/slash-commands';
import { defaultMode, ViewModes, type ViewMode } from '../../core/chat/view-mode';
import { Changes } from '../../core/changes/changes';
import { HcClient, HcError } from '../../core/hc/hc-client';
import { agentKind, programOf, type AgentKind, type ProgramKind } from '../../core/list/conversations';
import { tabNameOf } from '../../core/hc/spaces';
import { TerminalStore, machineOf } from '../../core/hc/terminal-store';
import type { AttachResult, ChannelCloseReason } from '../../core/hc/types';
import { LayoutProbe, measureLayout } from '../../core/pwa/layout-probe';
import { Session } from '../../core/session/session';
import { Settings } from '../../core/settings/settings';
import { ColorScheme } from '../../core/theme/color-scheme';
import { textToBytes } from '../../core/xterm/input-bytes';
import { barKeyBytes, ctrlBytes, type BarKey } from '../../core/xterm/key-bytes';
import { XtermFactory, type XtermHandle } from '../../core/xterm/xterm-factory';
import { ChangesChip } from '../changes-chip/changes-chip';
import { ChatView } from '../chat-view/chat-view';
import type { Tone } from '../status-label/status-label';
import { keyboardViewport, type KeyboardViewport } from './keyboard-viewport';
import { ComposeBar } from './compose-bar/compose-bar';
import { UpdateCard } from '../update-card/update-card';
import { ConnectionCard } from './connection-card/connection-card';
import { KeyBar } from './key-bar/key-bar';
import { ViewHeader } from './view-header/view-header';

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
  imports: [RouterLink, ChangesChip, ChatView, ComposeBar, ConnectionCard, KeyBar, NgIcon, UpdateCard, ViewHeader, ...HlmButtonImports, LayoutMenu],
  providers: [ChatStream],
  viewProviders: [
    provideIcons({ lucideFileDiff, lucideSettings }),
  ],
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
  protected readonly chat = inject(ChatStream);
  private readonly viewModes = inject(ViewModes);
  private readonly gitChanges = inject(Changes);
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

  /** The terminal's folder and the git changes in it (null when clean or not a repository). */
  protected readonly cwd = computed(() => this.terminal()?.cwd ?? '');
  private readonly machine = machineOf(this.address) ?? '';
  protected readonly changes = computed(() => (this.cwd() ? this.gitChanges.summaryOf(this.machine, this.cwd())() : null));

  /** Who this is, as on the home list: its tab, else the terminal's name, else the address. */
  protected readonly heading = computed(
    () => tabNameOf(this.store.spaces(), this.address) || this.terminal()?.name || this.address,
  );

  /** The user's explicit Chat/Terminal choice; until then agents open as chat and shells as terminal. */
  private readonly chosenMode = signal<ViewMode | undefined>(this.viewModes.get(this.address));
  protected readonly agent = computed(() => this.terminal()?.status?.app ?? '');
  protected readonly mode = computed<ViewMode>(
    () => this.chosenMode() ?? defaultMode(this.agent()),
  );
  /** Which agent this is (the avatar), or a plain shell. */
  protected readonly kind = computed<AgentKind>(() =>
    defaultMode(this.agent()) === 'chat' ? agentKind(this.agent()) : 'shell',
  );
  protected readonly program = computed<ProgramKind | null>(() =>
    this.kind() === 'shell' ? (programOf(this.terminal()?.foreground?.name)?.kind ?? null) : null,
  );
  /** The header's one status line: the connection while it is not live, else the agent's state. */
  protected readonly statusLine = computed<{ text: string; tone: Tone }>(() => {
    switch (this.phase()) {
      case 'attaching':
        return {
          text: this.client.state() === 'reconnecting' ? 'Reconnecting…' : 'Connecting…',
          tone: 'working',
        };
      case 'reconnecting':
        return { text: 'Reconnecting…', tone: 'working' };
      case 'ended':
        return { text: 'Ended', tone: 'blocked' };
      case 'failed':
        return { text: 'Disconnected', tone: 'blocked' };
    }
    if (this.kind() === 'shell') return { text: 'Shell', tone: 'idle' };
    switch (this.terminal()?.status?.state) {
      case 'working':
        return { text: 'Working', tone: 'working' };
      case 'done':
        return { text: 'Done', tone: 'done' };
      case 'blocked':
      case 'error':
        return { text: 'Blocked', tone: 'blocked' };
      default:
        return { text: 'Idle', tone: 'idle' };
    }
  });
  protected readonly slashOpen = signal(false);
  protected readonly composeFocused = signal(false);
  private readonly xtermFocused = signal(false);
  /** The key row shows only while the field that takes the keys (message field or xterm) has focus. */
  protected readonly accessoryVisible = computed(() =>
    this.mode() === 'chat' || this.inputMode() === 'compose'
      ? this.composeFocused()
      : this.xtermFocused(),
  );
  protected readonly slashChips = computed(() => slashCommands(this.chat.agent() || this.agent()));

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
    // Look at git when the folder is known (the screen opened) and each time the agent's turn ends;
    // the service spaces its calls 15 s apart.
    effect(() => {
      const cwd = this.cwd();
      if (cwd) untracked(() => void this.gitChanges.refresh(this.machine, cwd));
    });
    let state: string | undefined;
    effect(() => {
      const next = this.terminal()?.status?.state;
      const turnEnded = state === 'working' && next !== 'working';
      state = next;
      const cwd = untracked(() => this.cwd());
      if (turnEnded && cwd) untracked(() => void this.gitChanges.refresh(this.machine, cwd));
    });
    // The transcript streams only while the chat is on screen.
    effect(() => {
      if (this.mode() === 'chat') untracked(() => this.chat.connect(this.address));
      else untracked(() => this.chat.close());
    });
    inject(DestroyRef).onDestroy(() => {
      this.chat.close();
      this.teardown();
    });
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

  protected setViewMode(mode: ViewMode): void {
    if (this.mode() === mode) return;
    this.chosenMode.set(mode);
    this.viewModes.set(this.address, mode);
    this.slashOpen.set(false);
    // The terminal kept its size while hidden; refit in case the window changed meanwhile.
    afterNextRender(
      () => {
        if (mode === 'terminal') this.handle?.fit();
        this.focusInput();
      },
      { injector: this.injector },
    );
  }

  /** Ctrl+C from the chat's key row. */
  protected interrupt(): void {
    if (this.channel === null) return;
    this.client.sendData(this.channel, new Uint8Array([3]));
  }

  protected useSlash(command: string): void {
    this.slashOpen.set(false);
    this.compose()?.fill(`${command} `);
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
    if (this.mode() === 'terminal' && this.inputMode() === 'direct') {
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
        this.xtermFocused.set(focused);
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
