import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
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
});
