import { Component, computed, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown, lucideCircleAlert, lucideLoaderCircle, lucideTerminal } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import type { PermissionPrompt } from '../../../core/answers/permission';
import type { PermissionState } from '../../../core/answers/permissions';

/**
 * The "Needs attention" card of an agent waiting on a permission prompt: the request it shows, and
 * the choices read off its screen as buttons. Presentational: the parent answers.
 */
@Component({
  selector: 'app-permission-card',
  imports: [NgIcon, ...HlmButtonImports],
  viewProviders: [provideIcons({ lucideCheck, lucideChevronDown, lucideCircleAlert, lucideLoaderCircle, lucideTerminal })],
  host: { class: 'block' },
  styleUrl: './permission-card.css',
  templateUrl: './permission-card.html',
})
export class PermissionCard {
  readonly prompt = input.required<PermissionPrompt>();
  readonly state = input<PermissionState | undefined>(undefined);
  /** The "No, and tell …" row the user is typing the reason for, in the compose field. */
  readonly typing = input<number | null>(null);
  readonly choose = output<number>();
  readonly denyText = output<number>();
  readonly openTerminal = output<void>();

  protected readonly expanded = signal(false);
  protected readonly tapped = signal<number | null>(null);
  protected readonly request = computed(() => this.prompt().request.join('\n'));
  protected readonly sending = computed(() => this.state()?.phase === 'sending');
  protected readonly failed = computed(() => this.state()?.phase === 'failed');
  protected readonly answered = computed(() => {
    const s = this.state();
    return s?.phase === 'answered' ? s.label : null;
  });
  /** Only the first approve is the primary button. */
  protected readonly primary = computed(() => this.prompt().choices.findIndex((c) => c.kind === 'approve'));

  protected tap(index: number): void {
    if (this.sending()) return;
    if (this.prompt().choices[index].kind === 'deny-text') {
      this.denyText.emit(index);
      return;
    }
    this.tapped.set(index);
    this.choose.emit(index);
  }
}
