import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Answers, answerKey, type AnswerState } from '../../../core/answers/answers';
import type { AgentQuestion, ToolPart } from '../../../core/chat/types';
import { QuestionCard } from './question-card';

const approach: AgentQuestion = {
  question: 'Which architecture should I use?',
  header: 'Approach',
  other: true,
  options: [
    { label: 'Hexagonal', description: 'Keeps quota parsing behind a port.' },
    { label: 'Feature folders', description: 'Everything in one folder.' },
  ],
};
const scope: AgentQuestion = {
  question: 'Which parts should the change cover?',
  header: 'Scope',
  multiSelect: true,
  other: true,
  options: [{ label: 'API' }, { label: 'Tests' }, { label: 'Docs' }],
};
const flag: AgentQuestion = { question: 'What should the flag be called?', header: 'Name', other: true, options: [] };
const key: AgentQuestion = { question: 'Paste the deploy key.', header: 'Key', secret: true, other: true, options: [] };

const partOf = (questions: AgentQuestion[], extra: Partial<ToolPart> = {}): ToolPart => ({
  type: 'tool',
  id: 'ask-1',
  name: 'AskUserQuestion',
  summary: 'Asked',
  status: 'running',
  questions,
  ...extra,
});

describe('QuestionCard', () => {
  const states = signal<Record<string, AnswerState>>({});
  const submit = vi.fn(async (..._args: unknown[]) => undefined);

  beforeEach(() => {
    states.set({});
    submit.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: Answers, useValue: { stateOf: (k: string) => states()[k], submit, clear: vi.fn() } }],
    });
  });

  function render(part: ToolPart, agent = 'claude') {
    const fixture = TestBed.createComponent(QuestionCard);
    fixture.componentRef.setInput('part', part);
    fixture.componentRef.setInput('address', 't13');
    fixture.componentRef.setInput('agent', agent);
    let opened = 0;
    fixture.componentInstance.openTerminal.subscribe(() => opened++);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const settle = () => {
      fixture.detectChanges();
      TestBed.tick();
    };
    const click = (node: Element | null) => {
      (node as HTMLElement).click();
      settle();
    };
    const type = (node: Element | null, value: string) => {
      const input = node as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      settle();
    };
    const button = (label: RegExp) =>
      [...el.querySelectorAll('button')].find((b) => label.test(b.textContent ?? '') || label.test(b.getAttribute('aria-label') ?? '')) ?? null;
    return { fixture, el, settle, click, type, button, opened: () => opened };
  }

  describe('single question', () => {
    it('shows the header, the question and its options with descriptions', () => {
      const { el } = render(partOf([approach]));
      expect(el.querySelector('[data-chip]')?.textContent).toContain('Approach');
      expect(el.textContent).toContain('Which architecture should I use?');
      expect(el.querySelectorAll('input[type=radio]')).toHaveLength(3);
      expect(el.textContent).toContain('Keeps quota parsing behind a port.');
      expect(el.textContent).toContain('Other…');
      expect(el.querySelector('[role=radiogroup]')?.getAttribute('aria-label')).toBe('Which architecture should I use?');
    });

    it('selects on tap but sends only on Submit', () => {
      const { el, click, button } = render(partOf([approach]));
      const submitButton = button(/^\s*Submit\s*$/) as HTMLButtonElement;
      expect(submitButton.disabled).toBe(true);
      click(el.querySelectorAll('input[type=radio]')[1]);
      expect(submit).not.toHaveBeenCalled();
      expect(submitButton.disabled).toBe(false);
      click(submitButton);
      expect(submit).toHaveBeenCalledWith('t13', 'claude', expect.objectContaining({ id: 'ask-1' }), [{ picks: [1] }]);
    });

    it('"Other…" opens a field and needs text before it can be sent', () => {
      const { el, click, type, button } = render(partOf([approach]));
      expect(el.querySelector('[data-other-field]')).toBeNull();
      click(el.querySelectorAll('input[type=radio]')[2]);
      const submitButton = button(/^\s*Submit\s*$/) as HTMLButtonElement;
      expect(submitButton.disabled).toBe(true);
      type(el.querySelector('[data-other-field]'), 'Clean architecture');
      expect(submitButton.disabled).toBe(false);
      click(submitButton);
      expect(submit.mock.calls[0]).toEqual(['t13', 'claude', expect.anything(), [{ picks: [], text: 'Clean architecture' }]]);
    });

    it('omits "Other…" when the agent has no such row', () => {
      const { el } = render(partOf([{ ...approach, other: false }]));
      expect(el.querySelectorAll('input[type=radio]')).toHaveLength(2);
    });
  });

  describe('multi select', () => {
    it('shows checkboxes with the hint, and a Submit for one question', () => {
      const { el, click, button } = render(partOf([scope]), 'pi');
      expect(el.querySelectorAll('input[type=checkbox]')).toHaveLength(4);
      expect(el.textContent).toContain('Select all that apply');
      const boxes = el.querySelectorAll('input[type=checkbox]');
      click(boxes[0]);
      click(boxes[2]);
      click(button(/^\s*Submit\s*$/));
      expect(submit.mock.calls[0][3]).toEqual([{ picks: [0, 2] }]);
    });

    it('does not offer "Other…" for Claude Code (no confirmed way to type it) but does for pi', () => {
      const claude = render(partOf([scope]), 'claude');
      expect(claude.el.querySelectorAll('input[type=checkbox]')).toHaveLength(3);
      expect(claude.el.textContent).not.toContain('Other…');
      const pi = render(partOf([scope]), 'pi');
      expect(pi.el.textContent).toContain('Other…');
    });
  });

  describe('free text and secret', () => {
    it('a question without options is a text field (Codex)', () => {
      const { el, type, click, button } = render(partOf([flag]), 'codex');
      expect(el.querySelector('input[type=radio]')).toBeNull();
      type(el.querySelector('textarea'), 'usage-quota-bars');
      click(button(/^\s*Submit\s*$/));
      expect(submit.mock.calls[0][3]).toEqual([{ picks: [], text: 'usage-quota-bars' }]);
    });

    it('a secret is a masked field with an eye, and is not kept after sending', () => {
      const { el, type, click, button, fixture } = render(partOf([key]), 'codex');
      const field = el.querySelector<HTMLInputElement>('[data-secret-field]')!;
      expect(field.type).toBe('password');
      expect(el.textContent).toContain('Hidden in this chat.');
      click(button(/show answer/i));
      expect(field.type).toBe('text');
      click(button(/hide answer/i));
      expect(field.type).toBe('password');
      type(field, 'hunter2-secret');
      click(button(/^\s*Submit\s*$/));
      expect(submit.mock.calls[0][3]).toEqual([{ picks: [], text: 'hunter2-secret' }]);
      expect(JSON.stringify((fixture.componentInstance as unknown as { selections: () => unknown }).selections())).not.toContain('hunter2-secret');
      expect(el.innerHTML).not.toContain('hunter2-secret');
    });
  });

  describe('several questions', () => {
    const three = [approach, { ...scope, other: false }, key];

    it('walks the steps with "1 of 3", Back and Next, then reviews', () => {
      const { el, click, type, button } = render(partOf(three), 'opencode');
      expect(el.textContent).toContain('1 of 3');
      const next = button(/^\s*Next\s*$/) as HTMLButtonElement;
      expect(next.disabled).toBe(true);
      expect(button(/^\s*Back\s*$/)).toBeNull();
      click(el.querySelectorAll('input[type=radio]')[0]);
      click(next);
      expect(el.textContent).toContain('2 of 3');
      expect(el.textContent).toContain('Select all that apply');
      click(el.querySelectorAll('input[type=checkbox]')[0]);
      click(el.querySelectorAll('input[type=checkbox]')[1]);
      click(button(/^\s*Next\s*$/));
      type(el.querySelector('[data-secret-field]'), 'abc123');
      click(button(/^\s*Review\s*$/));
      expect(el.textContent).toContain('Check your answers');
      const rows = [...el.querySelectorAll('[data-review-row]')].map((r) => [...r.querySelectorAll('span > span')].map((x) => x.textContent!.trim()).join(' | '));
      expect(rows).toEqual(['Approach | Hexagonal', 'Scope | API, Tests', 'Key | ••••••••']);
      expect(el.innerHTML).not.toContain('abc123');
    });

    it('a review row takes you back to that question, keeping the choices', () => {
      const { el, click, type, button } = render(partOf(three), 'opencode');
      click(el.querySelectorAll('input[type=radio]')[1]);
      click(button(/^\s*Next\s*$/));
      click(el.querySelectorAll('input[type=checkbox]')[2]);
      click(button(/^\s*Next\s*$/));
      type(el.querySelector('[data-secret-field]'), 'k');
      click(button(/^\s*Review\s*$/));
      click(el.querySelectorAll('[data-review-row]')[0]);
      expect(el.textContent).toContain('1 of 3');
      expect((el.querySelectorAll('input[type=radio]')[1] as HTMLInputElement).checked).toBe(true);
    });

    it('Submit answers sends every answer in question order', () => {
      const { el, click, type, button } = render(partOf(three), 'opencode');
      click(el.querySelectorAll('input[type=radio]')[1]);
      click(button(/^\s*Next\s*$/));
      click(el.querySelectorAll('input[type=checkbox]')[2]);
      click(button(/^\s*Next\s*$/));
      type(el.querySelector('[data-secret-field]'), 'k3y');
      click(button(/^\s*Review\s*$/));
      click(button(/Submit answers/));
      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit.mock.calls[0][3]).toEqual([{ picks: [1] }, { picks: [2] }, { picks: [], text: 'k3y' }]);
    });

    it('Back returns to the previous question', () => {
      const { el, click, button } = render(partOf(three), 'opencode');
      click(el.querySelectorAll('input[type=radio]')[0]);
      click(button(/^\s*Next\s*$/));
      click(button(/^\s*Back\s*$/));
      expect(el.textContent).toContain('1 of 3');
    });
  });

  describe('after sending', () => {
    it('shows Sending… until the agent confirms', () => {
      states.set({ [answerKey('t13', 'ask-1')]: 'sending' });
      const { el, button } = render(partOf([approach]));
      const sending = button(/Sending/) as HTMLButtonElement;
      expect(sending.disabled).toBe(true);
      expect(sending.getAttribute('aria-busy')).toBe('true');
      expect(el.querySelector('input[type=radio]')).toBeNull();
    });

    it('collapses to what the agent recorded once the tool part is ok', () => {
      const { el } = render(
        partOf([approach, scope, key], {
          status: 'ok',
          answers: { 'Which architecture should I use?': 'Hexagonal', 'Which parts should the change cover?': 'API, Tests', 'Paste the deploy key.': '******' },
        }),
      );
      const text = el.textContent!.replace(/\s+/g, ' ');
      expect(text).toContain('You answered — Approach: Hexagonal · Scope: API, Tests · Key: ••••••••');
      expect(el.querySelector('button')).toBeNull();
    });

    it('says so when it was answered without recorded answers (in the terminal)', () => {
      const { el } = render(partOf([approach], { status: 'ok' }));
      expect(el.textContent).toContain('Answered');
    });
  });

  describe('fallback', () => {
    it('an agent without a driver shows the question and Open terminal only', () => {
      const { el, click, button, opened } = render(partOf([approach]), 'gemini');
      expect(el.querySelector('input')).toBeNull();
      expect(el.textContent).toContain('Which architecture should I use?');
      expect(el.textContent).toContain('This question has choices the app cannot read here.');
      click(button(/Open terminal/));
      expect(opened()).toBe(1);
    });

    it('cut-off options show it too', () => {
      const { el } = render(partOf([approach], { truncated: true }));
      expect(el.querySelector('input')).toBeNull();
      expect(el.textContent).toContain('Open terminal');
    });

    it('a stopped answer says it was not completed and offers the terminal', () => {
      states.set({ [answerKey('t13', 'ask-1')]: 'failed' });
      const { el, button } = render(partOf([approach]));
      expect(el.textContent).toContain('Your answer was not completed.');
      expect(el.querySelector('input')).toBeNull();
      expect(button(/Open terminal/)).not.toBeNull();
    });
  });
});
