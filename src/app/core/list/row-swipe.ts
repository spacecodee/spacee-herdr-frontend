import { Service, signal } from '@angular/core';

/** Which row has its swipe actions open: one at a time, by terminal address. */
@Service()
export class RowSwipe {
  private readonly openSignal = signal<string | null>(null);
  readonly open = this.openSignal.asReadonly();

  set(address: string | null): void {
    this.openSignal.set(address);
  }

  close(): void {
    this.openSignal.set(null);
  }
}
