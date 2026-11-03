import { Component, computed, input } from '@angular/core';

export type Tone = 'blocked' | 'working' | 'done' | 'idle';

const TONE: Record<string, Tone> = {
  blocked: 'blocked',
  error: 'blocked',
  working: 'working',
  done: 'done',
};

// Whole class names, so Tailwind's scanner finds them.
export const TEXT: Record<Tone, string> = {
  blocked: 'text-status-blocked-text font-semibold',
  working: 'text-status-working-text font-medium',
  done: 'text-status-done-text font-medium',
  idle: 'text-status-idle-text font-medium',
};
export const DOT: Record<Tone, string> = {
  blocked: 'bg-status-blocked',
  working: 'bg-status-working',
  done: 'bg-status-done',
  idle: 'bg-status-idle',
};

/**
 * Agent status as a small colored dot plus its name. The dot is decoration: the word carries the
 * meaning, and its color is the AA text variant of the dot's.
 */
@Component({
  selector: 'app-status-label',
  host: {
    class: 'inline-flex shrink-0 items-center gap-1.5 text-caption',
    '[class]': 'toneClass()',
  },
  templateUrl: './status-label.html',
  styleUrl: './status-label.css',
})
export class StatusLabel {
  readonly state = input.required<string>();

  protected readonly tone = computed<Tone>(() => TONE[this.state()] ?? 'idle');
  protected readonly toneClass = computed(() => TEXT[this.tone()]);
  protected readonly dotClass = computed(() => DOT[this.tone()]);
}
