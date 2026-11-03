import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { parsePermission, type PermissionPrompt } from '../../../core/answers/permission';
import { CLAUDE_LIVE_SCREEN } from '../../../core/answers/testing/claude-live-screen';
import type { PermissionState } from '../../../core/answers/permissions';
import { PermissionCard } from './permission-card';

const claude: PermissionPrompt = {
  agent: 'claude',
  title: 'Do you want to proceed?',
  request: ['pnpm test --watch=false', 'Run the unit tests', 'third line'],
  choices: [
    { label: 'Yes', kind: 'approve' },
    { label: "Yes, and don't ask again for pnpm commands", kind: 'approve-remember' },
    { label: 'No, and tell Claude what to do differently', kind: 'deny-text' },
  ],
  cursor: 0,
};

function render(prompt = claude, state?: PermissionState, typing: number | null = null) {
  const fixture = TestBed.createComponent(PermissionCard);
  fixture.componentRef.setInput('prompt', prompt);
  if (state) fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('typing', typing);
  const chosen: number[] = [];
  const typed: number[] = [];
  let opened = 0;
  fixture.componentInstance.choose.subscribe((i) => chosen.push(i));
  fixture.componentInstance.denyText.subscribe((i) => typed.push(i));
  fixture.componentInstance.openTerminal.subscribe(() => opened++);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('[data-choice]')];
  return { fixture, el, buttons, chosen, typed, opened: () => opened };
}

describe('PermissionCard', () => {
  it('shows the request in mono and the choices as buttons in screen order', () => {
    const { el, buttons } = render();
    expect(el.textContent).toContain('Needs attention');
    expect(el.querySelector('[data-title]')?.textContent).toContain('Do you want to proceed?');
    expect(el.querySelector('[data-request]')?.textContent).toContain('pnpm test --watch=false');
    expect(buttons().map((b) => b.textContent?.trim())).toEqual([
      'Yes',
      "Yes, and don't ask again for pnpm commands",
      'No, and tell Claude what to do differently',
    ]);
  });

  it('has no request box when the agent shows only its question', () => {
    const { el } = render({ ...claude, request: [] });
    expect(el.querySelector('[data-request]')).toBeNull();
    expect(el.querySelector('[data-title]')).not.toBeNull();
  });

  it('shows two request lines and expands on tap', () => {
    const { fixture, el } = render();
    const request = el.querySelector('[data-request]') as HTMLButtonElement;
    expect(request.getAttribute('aria-expanded')).toBe('false');
    expect(request.querySelector('p')?.className).toContain('line-clamp-2');
    request.click();
    fixture.detectChanges();
    expect(request.getAttribute('aria-expanded')).toBe('true');
    expect(request.querySelector('p')?.className).not.toContain('line-clamp-2');
  });

  it('tapping a choice emits it; the deny-text one asks to type instead', () => {
    const { buttons, chosen, typed } = render();
    buttons()[1].click();
    buttons()[2].click();
    expect(chosen).toEqual([1]);
    expect(typed).toEqual([2]);
  });

  it('while sending: the tapped button has a spinner and every button is disabled', () => {
    const { fixture, buttons } = render();
    buttons()[0].click();
    fixture.componentRef.setInput('state', { phase: 'sending' });
    fixture.detectChanges();
    expect(buttons().every((b) => b.disabled)).toBe(true);
    expect(buttons()[0].getAttribute('aria-busy')).toBe('true');
    expect(buttons()[1].getAttribute('aria-busy')).toBeNull();
  });

  it('collapses to "You answered: <label>" once answered', () => {
    const { el, buttons } = render(claude, { phase: 'answered', label: 'Yes' });
    expect(buttons()).toHaveLength(0);
    expect(el.querySelector('[data-answered]')?.textContent).toContain('You answered: Yes');
  });

  it('a failure falls back to Open terminal and offers no choices', () => {
    const { el, buttons, opened } = render(claude, { phase: 'failed' });
    expect(buttons()).toHaveLength(0);
    expect(el.textContent).toContain('Your answer was not completed');
    (el.querySelector('[data-open-terminal]') as HTMLButtonElement).click();
    expect(opened()).toBe(1);
  });

  it('while typing the reason, only the chosen row stays, checked; tapping it again lets go', () => {
    const { el, buttons, typed } = render(claude, undefined, 2);
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['No, and tell Claude what to do differently']);
    expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[0].querySelector('ng-icon')).not.toBeNull();
    buttons()[0].click();
    expect(typed).toEqual([2]);
    expect(el.querySelector('[data-deny-hint]')).toBeNull();
  });

  it('never offers a hidden row (the auto-mode switch)', () => {
    const { buttons } = render({
      ...claude,
      choices: [
        { label: 'Yes', kind: 'approve' },
        { label: 'Yes, and switch to auto mode', kind: 'approve-remember', hidden: true },
        { label: 'No', kind: 'deny' },
      ],
    });
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Yes', 'No']);
  });

  it('shows the real captured prompt', () => {
    const { el, buttons } = render(parsePermission(CLAUDE_LIVE_SCREEN, 'claude')!);
    expect(el.querySelector('[data-title]')?.textContent).toBe('Do you want to proceed?');
    expect(el.querySelector('[data-request]')?.textContent).toContain('touch segundo.txt');
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Yes', 'Yes, and always allow access to /tmp/x from this project', 'No']);
  });
});
