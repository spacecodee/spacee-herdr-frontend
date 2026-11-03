import { Component, ElementRef, inject, signal, viewChildren } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock, lucideSquareTerminal } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { CODE_LENGTH, normalizeCode } from '../../core/devices/device-format';
import { Session, type LoginResult } from '../../core/session/session';

type Mode = 'code' | 'token';

const CODE_ERRORS: Record<Exclude<LoginResult, 'ok'>, string> = {
  invalid: 'Code expired or wrong',
  locked: 'Too many attempts. Try again in 10 minutes or use the access token.',
  unreachable: 'Could not reach the bridge',
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, NgIcon, ...HlmButtonImports, ...HlmInputImports, ...HlmLabelImports],
  viewProviders: [provideIcons({ lucideLock, lucideSquareTerminal })],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly mode = signal<Mode>('code');
  protected readonly slots = Array.from({ length: CODE_LENGTH }, (_, i) => i);
  protected readonly chars = signal<string[]>(this.slots.map(() => ''));
  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  protected readonly token = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    // The QR on the pairing sheet opens /login?code=K7M2QX.
    const code = normalizeCode(inject(ActivatedRoute).snapshot.queryParamMap.get('code') ?? '');
    if (code) {
      this.chars.set(this.slots.map((i) => code[i] ?? ''));
      if (code.length === CODE_LENGTH) void this.submitCode();
    }
  }

  protected setMode(mode: Mode): void {
    this.error.set(null);
    this.mode.set(mode);
  }

  protected typed(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const typed = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Typing replaces the box; several characters (autofill, a paste that skipped our handler)
    // spill into the boxes after it.
    this.fill(index, typed || '');
    input.value = this.chars()[index];
  }

  protected pasted(event: ClipboardEvent): void {
    event.preventDefault();
    this.fill(0, normalizeCode(event.clipboardData?.getData('text') ?? ''));
  }

  protected keydown(index: number, event: KeyboardEvent): void {
    if (event.key !== 'Backspace' || this.chars()[index] !== '' || index === 0) return;
    event.preventDefault();
    this.chars.update((c) => c.map((v, i) => (i === index - 1 ? '' : v)));
    this.focus(index - 1);
  }

  /** Writes `text` into the boxes from `start`, moves on, and signs in once all six are filled. */
  private fill(start: number, text: string): void {
    if (this.busy()) return;
    const typed = [...text].slice(0, CODE_LENGTH - start);
    this.chars.update((c) => {
      const next = [...c];
      if (typed.length === 0) next[start] = '';
      typed.forEach((ch, i) => (next[start + i] = ch));
      return next;
    });
    this.boxes().forEach((box, i) => (box.nativeElement.value = this.chars()[i]));
    if (typed.length === 0) return;
    this.focus(Math.min(start + typed.length, CODE_LENGTH - 1));
    if (this.chars().every((c) => c !== '')) void this.submitCode();
  }

  private focus(index: number): void {
    this.boxes()[index]?.nativeElement.focus();
  }

  private async submitCode(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const result = await this.session.loginWithCode(this.chars().join(''));
    this.busy.set(false);
    if (result === 'ok') {
      await this.router.navigateByUrl('/');
      return;
    }
    this.error.set(CODE_ERRORS[result]);
    this.chars.set(this.slots.map(() => ''));
    this.boxes().forEach((box) => (box.nativeElement.value = ''));
    this.focus(0);
  }

  protected async submit(): Promise<void> {
    if (this.token.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const result = await this.session.login(this.token.value.trim());
    this.busy.set(false);
    if (result === 'ok') await this.router.navigateByUrl('/');
    else this.error.set(result === 'invalid' ? 'Token not valid' : 'Could not reach the bridge');
  }
}
