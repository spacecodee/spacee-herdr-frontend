import { Service, signal } from '@angular/core';

export type ViewMode = 'chat' | 'terminal';
export const VIEW_MODE_KEY = 'spacee-herdr.view-mode';

const isMode = (v: unknown): v is ViewMode => v === 'chat' || v === 'terminal';

function load(): Record<string, ViewMode> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VIEW_MODE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => isMode(v))) as Record<
      string,
      ViewMode
    >;
  } catch {
    return {};
  }
}

/** Plain shells have no conversation; anything that reports an agent app opens as chat. */
export function defaultMode(app: string | undefined | null): ViewMode {
  return app && app.trim() !== '' && app !== 'shell' ? 'chat' : 'terminal';
}

/** Chat or Terminal, remembered per terminal address in localStorage. */
@Service()
export class ViewModes {
  private readonly saved = signal(load());

  /** The user's saved choice for this terminal, if any. */
  get(address: string): ViewMode | undefined {
    return this.saved()[address];
  }

  set(address: string, mode: ViewMode): void {
    if (!isMode(mode)) return;
    const next = { ...this.saved(), [address]: mode };
    this.saved.set(next);
    try {
      localStorage.setItem(VIEW_MODE_KEY, JSON.stringify(next));
    } catch {
      // private mode or quota: the choice just does not survive a reload
    }
  }
}
