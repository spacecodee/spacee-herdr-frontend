import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, effect, inject, signal } from '@angular/core';

const QUERY = '(prefers-color-scheme: dark)';

/** The system color scheme, kept in sync with the `dark` class on <html> (what styles.css keys on). */
@Service()
export class ColorScheme {
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<'light' | 'dark'>('light');
  readonly scheme = this.state.asReadonly();

  constructor() {
    const mql = this.document.defaultView?.matchMedia?.(QUERY);
    if (mql) {
      this.state.set(mql.matches ? 'dark' : 'light');
      const onChange = (e: { matches: boolean }) => this.state.set(e.matches ? 'dark' : 'light');
      mql.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', onChange));
    }
    effect(() =>
      this.document.documentElement.classList.toggle('dark', this.state() === 'dark'),
    );
  }
}
