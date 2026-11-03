import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock, lucideSquareTerminal } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { Session } from '../../core/session/session';

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

  protected readonly token = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

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
