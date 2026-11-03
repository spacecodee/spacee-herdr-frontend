import { Service, signal } from '@angular/core';

const KEY = 'spacee-herdr.usage-remaining';

/** "Show remaining instead of used": a per-device display choice; colors always follow what was used. */
@Service()
export class UsageDisplay {
  private readonly value = signal(read());
  readonly remaining = this.value.asReadonly();

  set(on: boolean): void {
    this.value.set(on);
    try {
      if (on) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      // private mode: the choice still applies for this session
    }
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
