import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideCircleQuestionMark,
  lucideEye,
  lucideEyeOff,
  lucideListChecks,
  lucideLoaderCircle,
  lucideLock,
  lucidePencil,
  lucideShieldCheck,
  lucideTerminal,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Answers, answerKey } from '../../../core/answers/answers';
import {
  MASK,
  answeredLine,
  chooseOther,
  display,
  emptySelection,
  isComplete,
  toAnswer,
  toggle,
  topic,
  type Selection,
} from '../../../core/answers/card-model';
import { canDrive, canOther, driverAgent } from '../../../core/answers/profiles';
import type { ToolPart } from '../../../core/chat/types';

type Mode = 'form' | 'sending' | 'answered' | 'fallback';

/**
 * An agent's question as a card in the chat: pick (tap selects, Submit sends), steps with a review
 * when there are several, then "Sending…" until the agent's transcript confirms, then a summary.
 * What the agent cannot be driven for shows the question and "Open terminal" only.
 */
@Component({
  selector: 'app-question-card',
  imports: [NgIcon, HlmInput, HlmTextarea, ...HlmButtonImports],
  viewProviders: [
    provideIcons({
      lucideCheck,
      lucideChevronDown,
      lucideCircleQuestionMark,
      lucideEye,
      lucideEyeOff,
      lucideListChecks,
      lucideLoaderCircle,
      lucideLock,
      lucidePencil,
      lucideShieldCheck,
      lucideTerminal,
    }),
  ],
  host: { class: 'block' },
  styleUrl: './question-card.css',
  templateUrl: './question-card.html',
})
export class QuestionCard {
  readonly part = input.required<ToolPart>();
  /** The terminal this question is asked in. */
  readonly address = input('');
  /** The agent's name as the transcript reports it. */
  readonly agent = input('');
  /** Asks the parent to switch to the real terminal. */
  readonly openTerminal = output<void>();

  private readonly answers = inject(Answers);

  protected readonly questions = computed(() => this.part().questions ?? []);
  private readonly driver = computed(() => driverAgent(this.agent()));
  private readonly state = computed(() => this.answers.stateOf(answerKey(this.address(), this.part().id)));

  protected readonly mode = computed<Mode>(() => {
    if (this.part().status !== 'running') return 'answered';
    if (this.state() === 'failed' || !canDrive(this.driver(), this.questions(), this.part().truncated)) return 'fallback';
    return this.state() === 'sending' ? 'sending' : 'form';
  });
  protected readonly failed = computed(() => this.state() === 'failed');

  protected readonly selections = linkedSignal<Selection[]>(() => this.questions().map(() => emptySelection()));
  protected readonly step = signal(0);
  protected readonly revealed = signal(false);
  protected readonly collapsed = signal(false);
  /** The review rows kept while sending: the secret is already masked, the raw answers are gone. */
  protected readonly sent = signal<{ topic: string; value: string; secret: boolean }[]>([]);

  protected readonly count = computed(() => this.questions().length);
  protected readonly reviewing = computed(() => this.count() > 1 && this.step() >= this.count());
  protected readonly question = computed(() => this.questions()[Math.min(this.step(), this.count() - 1)]);
  protected readonly selection = computed(() => this.selections()[Math.min(this.step(), this.count() - 1)]);
  protected readonly index = computed(() => Math.min(this.step(), this.count() - 1));
  protected readonly complete = computed(() => {
    const q = this.question();
    const s = this.selection();
    return !!q && !!s && isComplete(q, s);
  });
  protected readonly canOther = computed(() => {
    const agent = this.driver();
    const q = this.question();
    return !!agent && !!q && q.options.length > 0 && canOther(agent, q);
  });
  protected readonly freeText = computed(() => (this.question()?.options.length ?? 0) === 0);
  protected readonly summary = computed(() => {
    const q = this.question();
    const s = this.selection();
    if (!q || !s) return '';
    return s.picks.map((i) => q.options[i]?.label ?? '').join(', ');
  });
  protected readonly review = computed(() =>
    this.questions().map((q, i) => ({ topic: topic(q, i), value: display(q, this.selections()[i]), secret: !!q.secret })),
  );
  protected readonly answered = computed(() => answeredLine(this.part()));
  protected readonly chips = computed(() => this.questions().map((q, i) => topic(q, i)));

  protected readonly buttonLabel = computed(() => {
    if (this.reviewing()) return 'Submit answers';
    if (this.count() === 1) return 'Submit';
    return this.step() === this.count() - 1 ? 'Review' : 'Next';
  });

  protected pick(option: number): void {
    this.update((q, s) => toggle(q, s, option));
  }

  /** The keyboard is up for the "Other" field: fold the options away, keeping what was chosen in view. */
  protected collapse(): void {
    if ((this.selection()?.picks.length ?? 0) > 0) this.collapsed.set(true);
  }

  protected pickOther(): void {
    this.update((q, s) => chooseOther(q, s));
    this.collapsed.set(false);
  }

  protected type(text: string): void {
    this.update((_q, s) => ({ ...s, text }));
  }

  protected back(): void {
    this.step.update((s) => Math.max(0, s - 1));
    this.revealed.set(false);
    this.collapsed.set(false);
  }

  protected edit(i: number): void {
    this.step.set(i);
  }

  /** Next question, the review, or (one question, or the review) the answer itself. */
  protected advance(): void {
    if (this.reviewing() || this.count() === 1) {
      this.submit();
      return;
    }
    this.step.update((s) => s + 1);
    this.revealed.set(false);
    this.collapsed.set(false);
  }

  protected isPicked(option: number): boolean {
    return this.selection()?.picks.includes(option) ?? false;
  }

  private update(change: (q: NonNullable<ReturnType<typeof this.question>>, s: Selection) => Selection): void {
    const q = this.question();
    const i = this.index();
    if (!q) return;
    this.selections.update((all) => all.map((s, at) => (at === i ? change(q, s) : s)));
  }

  private submit(): void {
    const questions = this.questions();
    const selections = this.selections();
    const answers = questions.map((q, i) => toAnswer(q, selections[i]));
    this.sent.set(this.review());
    // The typed text lives only in `answers` from here: the card forgets it at once.
    this.selections.set(questions.map(() => emptySelection()));
    this.revealed.set(false);
    void this.answers.submit(this.address(), this.agent(), this.part(), answers);
  }

  protected readonly mask = MASK;
}
