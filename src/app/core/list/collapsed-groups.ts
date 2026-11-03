import { Service, signal } from '@angular/core';

export const COLLAPSED_KEY = 'spacee-herdr.collapsed';

/** Remembers the sections that start closed and that the user opened. */
export const EXPANDED_KEY = 'spacee-herdr.expanded';

/** Sections that start closed; the others start open. */
const CLOSED_BY_DEFAULT = new Set(['terminals']);

function load(key: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Which list sections the user collapsed (or opened, for the ones closed by default), kept per
 * section id in localStorage. Storage failures never break the session value.
 */
@Service()
export class CollapsedGroups {
  private readonly collapsed = signal(load(COLLAPSED_KEY));
  private readonly expanded = signal(load(EXPANDED_KEY));
  private blocked = new Set<string>();

  isOpen(id: string): boolean {
    return CLOSED_BY_DEFAULT.has(id) ? this.expanded().has(id) : !this.collapsed().has(id);
  }

  setOpen(id: string, open: boolean): void {
    const closedByDefault = CLOSED_BY_DEFAULT.has(id);
    const store = closedByDefault ? this.expanded : this.collapsed;
    const next = new Set(store());
    // The set holds what differs from the default.
    if (open === closedByDefault) next.add(id);
    else next.delete(id);
    store.set(next);
    try {
      localStorage.setItem(closedByDefault ? EXPANDED_KEY : COLLAPSED_KEY, JSON.stringify([...next]));
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
