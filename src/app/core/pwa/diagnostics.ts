import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { RELOAD_PAGE } from './app-updates';
import { LayoutProbe, formatLayout } from './layout-probe';

interface Size {
  width: number;
  height: number;
}

export interface DiagnosticsSnapshot {
  build: string | null;
  sw: string;
  standalone: { navigator: boolean | null; displayMode: boolean };
  statusBarMeta: string | null;
  inner: Size;
  screen: Size;
  dpr: number;
  visual: (Size & { offsetTop: number; scale: number }) | null;
  units: { vh: number; dvh: number; svh: number; lvh: number };
  safeArea: { top: number; right: number; bottom: number; left: number };
}

const na = (value: unknown) => (value === null || value === undefined ? 'n/a' : String(value));

export function formatDiagnostics(s: DiagnosticsSnapshot): string {
  const v = s.visual;
  return [
    `build: ${na(s.build)}`,
    `sw: ${s.sw}`,
    `standalone: navigator=${na(s.standalone.navigator)} display-mode=${s.standalone.displayMode}`,
    `status-bar meta: ${na(s.statusBarMeta)}`,
    `inner: ${s.inner.width}x${s.inner.height}`,
    `screen: ${s.screen.width}x${s.screen.height} @${s.dpr}x`,
    `visualViewport: ${v ? `${v.width}x${v.height} top=${v.offsetTop} scale=${v.scale}` : 'n/a'}`,
    `vh=${s.units.vh} dvh=${s.units.dvh} svh=${s.units.svh} lvh=${s.units.lvh}`,
    `safe-area: top=${s.safeArea.top} right=${s.safeArea.right} bottom=${s.safeArea.bottom} left=${s.safeArea.left}`,
  ].join('\n');
}

/**
 * What build the page runs: the file name of the hashed main bundle in the DOM. It is the code the
 * phone actually loaded (possibly from the service-worker cache), unlike what the server serves now.
 */
export function scriptBuildId(doc: Document): string | null {
  for (const script of Array.from(doc.querySelectorAll('script[src]'))) {
    const name = (script.getAttribute('src') ?? '').split('/').pop() ?? '';
    if (/^main[-.]/.test(name)) return name;
  }
  return null;
}

/** Height of a hidden element sized with one CSS length, in px. */
function measure(doc: Document, css: string): number {
  const probe = doc.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;width:0;${css}`;
  doc.body.appendChild(probe);
  const value = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.round(value * 100) / 100;
}

function measureInset(doc: Document, side: 'top' | 'right' | 'bottom' | 'left'): number {
  const probe = doc.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;padding-${side}:env(safe-area-inset-${side},0px)`;
  doc.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return Math.round((side === 'top' || side === 'bottom' ? rect.height : rect.width) * 100) / 100;
}

/** Live device measurements for Settings > Diagnostics, and the Force update recovery. */
@Service()
export class Diagnostics {
  private readonly document = inject(DOCUMENT);
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly reload = inject(RELOAD_PAGE);
  private readonly layout = inject(LayoutProbe);

  readonly text = signal('');
  readonly updating = signal(false);

  /** Re-reads every value; the page calls it on open and on resize. */
  refresh(): void {
    this.text.set(this.render('measuring…'));
    void this.serviceWorkerState().then((sw) =>
      this.text.set(this.render(sw)),
    );
  }

  async forceUpdate(): Promise<void> {
    this.updating.set(true);
    try {
      if (!this.sw?.isEnabled) throw new Error('service worker not enabled');
      await this.sw.checkForUpdate();
      await this.sw.activateUpdate();
    } catch {
      await this.wipe();
    }
    this.reload();
  }

  private async wipe(): Promise<void> {
    const win = this.document.defaultView;
    try {
      const registrations = (await win?.navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(registrations.map((r) => r.unregister()));
      const keys = (await win?.caches?.keys()) ?? [];
      await Promise.all(keys.map((k) => win?.caches.delete(k)));
    } catch {
      // Reload anyway; there is nothing more to clean up.
    }
  }

  private async serviceWorkerState(): Promise<string> {
    const container = this.document.defaultView?.navigator.serviceWorker;
    if (!container) return 'none (unsupported)';
    const controller = container.controller;
    return controller ? `controlling (${controller.state})` : 'none';
  }

  private render(sw: string): string {
    return `${formatDiagnostics(this.snapshot(sw))}\n${formatLayout(this.layout.last())}`;
  }

  private snapshot(sw: string): DiagnosticsSnapshot {
    const doc = this.document;
    const win = doc.defaultView;
    const vv = win?.visualViewport;
    const nav = win?.navigator as (Navigator & { standalone?: boolean }) | undefined;
    return {
      build: scriptBuildId(doc),
      sw,
      standalone: {
        navigator: nav?.standalone ?? null,
        displayMode: win?.matchMedia?.('(display-mode: standalone)').matches ?? false,
      },
      statusBarMeta:
        doc
          .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
          ?.getAttribute('content') ?? null,
      inner: { width: win?.innerWidth ?? 0, height: win?.innerHeight ?? 0 },
      screen: { width: win?.screen.width ?? 0, height: win?.screen.height ?? 0 },
      dpr: win?.devicePixelRatio ?? 1,
      visual: vv
        ? { width: vv.width, height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale }
        : null,
      units: {
        vh: measure(doc, 'height:100vh'),
        dvh: measure(doc, 'height:100dvh'),
        svh: measure(doc, 'height:100svh'),
        lvh: measure(doc, 'height:100lvh'),
      },
      safeArea: {
        top: measureInset(doc, 'top'),
        right: measureInset(doc, 'right'),
        bottom: measureInset(doc, 'bottom'),
        left: measureInset(doc, 'left'),
      },
    };
  }
}
