import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TerminalStore } from '../../../core/hc/terminal-store';
import { ChatMessage } from './chat-message';

function render(message: unknown) {
  const fixture = TestBed.createComponent(ChatMessage);
  fixture.componentRef.setInput('message', message);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ChatMessage', () => {
  it('user text is plain text, never markup', () => {
    const el = render({
      id: '1',
      role: 'user',
      time: 0,
      parts: [{ type: 'text', text: '<script>x</script> **not bold**' }],
    });
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('strong')).toBeNull();
    expect(el.textContent).toContain('<script>x</script> **not bold**');
  });

  it('a queued user message is labelled as queued', () => {
    const el = render({
      id: 'queued-1',
      role: 'user',
      time: 0,
      queued: true,
      parts: [{ type: 'text', text: 'later' }],
    });
    expect(el.querySelector('[data-queued]')?.textContent?.trim()).toBe('Queued');
    expect(el.textContent).toContain('later');
  });

  it('a delivered user message has no queued label', () => {
    const el = render({ id: '1', role: 'user', time: 0, parts: [{ type: 'text', text: 'now' }] });
    expect(el.querySelector('[data-queued]')).toBeNull();
  });

  it('assistant script/onerror/javascript: content is stripped', () => {
    const el = render({
      id: '2',
      role: 'assistant',
      time: 0,
      parts: [{ type: 'text', text: '<img src=x onerror=alert(1)> [a](javascript:alert(1))' }],
    });
    expect(el.querySelector('img')).toBeNull();
    expect(el.innerHTML.toLowerCase()).not.toContain('javascript:');
    expect(el.innerHTML).not.toMatch(/<[^>]*onerror/i);
  });

  it('image with a note shows the note and never requests the path', () => {
    const el = render({
      id: '3',
      role: 'user',
      time: 0,
      parts: [{ type: 'image', note: 'screenshot omitted' }],
    });
    expect(el.textContent).toContain('screenshot omitted');
    expect(el.querySelector('img')).toBeNull();
  });

  it('a user slash command is a chip, not a bubble', () => {
    const el = render({ id: '3', role: 'user', time: 0, parts: [{ type: 'text', text: '/model opus' }] });
    expect(el.querySelector('[data-slash]')?.textContent?.trim()).toBe('/model opus');
    expect(el.querySelector('[hlmBubble]')).toBeNull();
  });

  it('a user message that only starts with a slash path stays a bubble', () => {
    const el = render({ id: '4', role: 'user', time: 0, parts: [{ type: 'text', text: '/home/me/a.ts is broken' }] });
    expect(el.querySelector('[data-slash]')).toBeNull();
    expect(el.querySelector('[hlmBubble]')).not.toBeNull();
  });

  it('an assistant message starting with a slash command is not a chip', () => {
    const el = render({ id: '5', role: 'assistant', time: 0, parts: [{ type: 'text', text: '/clear' }] });
    expect(el.querySelector('[data-slash]')).toBeNull();
  });

  describe('harness envelopes in user messages', () => {
    const user = (text: string) => ({ id: 'u', role: 'user', time: 0, parts: [{ type: 'text', text }] });

    it('shows an hc message as its body with a From chip, never the tags', () => {
      TestBed.configureTestingModule({ providers: [{ provide: TerminalStore, useValue: { terminals: () => [{ address: 't13', name: 'Orchestrator' }] } }] });
      const el = render(user('<hc from="t13">Do task F18</hc>'));
      expect(el.textContent).toContain('Do task F18');
      expect(el.textContent).not.toContain('<hc');
      expect(el.querySelector('[data-from]')?.textContent?.trim()).toBe('From Orchestrator');
    });

    it('falls back to the address when the terminal is unknown, and labels pasted content', () => {
      TestBed.configureTestingModule({ providers: [{ provide: TerminalStore, useValue: { terminals: () => [] } }] });
      const el = render(user('<pasted_content id="1"><hc from="t9">hi</hc></pasted_content id="1">'));
      expect(el.querySelector('[data-from]')?.textContent?.trim()).toBe('From t9');
      expect(el.querySelector('[data-pasted]')?.textContent?.trim()).toBe('Pasted');
      expect(el.textContent).not.toContain('pasted_content');
    });

    it('renders a task notification as a muted row, not a bubble', () => {
      const el = render(user('<task-notification><summary>pnpm test ok</summary></task-notification>'));
      expect(el.querySelector('[data-notice]')?.textContent?.trim()).toBe('Background task finished: pnpm test ok');
      expect(el.querySelector('[hlmBubble]')).toBeNull();
    });

    it('collapses a compaction summary into one expandable row', () => {
      const text = 'This session is being continued from a previous conversation. Details.';
      const el = render(user(text));
      const details = el.querySelector('details[data-compaction]') as HTMLDetailsElement;
      expect(details.querySelector('summary')?.textContent?.trim()).toBe('Conversation summarized');
      expect(details.open).toBe(false);
      expect(details.textContent).toContain('Details.');
    });

    it('shows nothing for hidden context and leaves real <div> text alone', () => {
      expect(render(user('<system-reminder>x</system-reminder>')).textContent?.trim()).toBe('');
      expect(render(user('use <div> here')).textContent).toContain('use <div> here');
    });
  });
});
