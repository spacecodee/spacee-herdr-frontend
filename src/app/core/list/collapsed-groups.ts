import { Service, signal } from '@angular/core';

export const COLLAPSED_KEY = 'spacee-herdr.collapsed';

function load(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Which list sections the user collapsed, kept per section id in localStorage. Everything is open
 * by default. Storage failures never break the session value.
 */
@Service()
export class CollapsedGroups {
  private readonly collapsed = signal(load());
  private blocked = new Set<string>();

  isOpen(id: string): boolean {
    return !this.collapsed().has(id);
  }

  setOpen(id: string, open: boolean): void {
    const next = new Set(this.collapsed());
    if (open) next.delete(id);
    else next.add(id);
    this.collapsed.set(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // private mode or quota: the choice just does not survive a reload
    }
  }

  /**
   * Gets the ids of every section that currently holds a blocked terminal. Sections that just
   * became blocked open; nothing is ever closed here.
   */
  noteBlocked(ids: string[]): void {
    const now = new Set(ids);
    for (const id of now) if (!this.blocked.has(id) && !this.isOpen(id)) this.setOpen(id, true);
    this.blocked = now;
  }
}
