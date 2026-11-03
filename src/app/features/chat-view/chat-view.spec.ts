import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatState, NoneReason } from '../../core/chat/types';
import { ChatView } from './chat-view';

@Component({
  imports: [ChatView],
  template: `<app-chat-view
    [messages]="messages()"
    [state]="state()"
    [noneReason]="reason()"
    [status]="status()"
    (showTerminal)="shown = shown + 1"
  />`,
})
class Host {
  messages = signal<ChatMessage[]>([]);
  state = signal<ChatState>('live');
  reason = signal<NoneReason | null>(null);
  status = signal<string | undefined>(undefined);
  shown = 0;
}

const msgs: ChatMessage[] = [
  { id: '1', role: 'user', time: 0, parts: [{ type: 'text', text: 'hello there' }] },
  {
    id: '2',
    role: 'assistant',
    time: 0,
    parts: [
      { type: 'thinking', text: 'hmm' },
      { type: 'text', text: '## Title\n\n```ts\nconst a = 1;\n```' },
      { type: 'tool', id: 't', name: 'Bash', summary: 'ls -la', input: 'ls -la', output: 'x', status: 'ok' },
      { type: 'image', path: '/tmp/up/shot.png' },
    ],
  },
  { id: '3', role: 'system', time: 0, parts: [{ type: 'text', text: 'Rate limited' }] },
];

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, el };
}

describe('ChatView', () => {
  it('shows "No conversation yet" when live and empty', () => {
    const { el } = setup();
    expect(el.textContent).toContain('No conversation yet');
  });

  it('shows the not-available state with a button to the terminal', async () => {
    const { fixture, host, el } = setup();
    host.state.set('none');
    host.reason.set('unsupported');
    fixture.detectChanges();
    expect(el.textContent).toContain("This agent's history is not available");
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(host.shown).toBe(1);
  });

  it('renders user, assistant, markdown, tool, thinking, image chip and system notice', async () => {
    const { fixture, host, el } = setup();
    host.messages.set(msgs);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('hello there');
    expect(text).toContain('Thought');
    expect(text).toContain('ls -la');
    expect(text).toContain('shot.png');
    expect(text).toContain('Rate limited');
    expect(el.querySelector('h2')?.textContent).toBe('Title');
    expect(el.querySelector('.md-code code')?.textContent).toContain('const a = 1;');
    expect(el.querySelector('[data-align="end"]')).not.toBeNull();
  });

  it('working shows typing dots, blocked shows the card that opens the terminal', () => {
    const { fixture, host, el } = setup();
    host.status.set('working');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="typing"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="blocked-card"]')).toBeNull();
    host.status.set('blocked');
    fixture.detectChanges();
    const card = el.querySelector<HTMLElement>('[data-testid="blocked-card"]')!;
    expect(card.textContent).toContain('Needs your answer in the terminal');
    card.querySelector('button')!.click();
    expect(host.shown).toBe(1);
    host.status.set('done');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="blocked-card"]')).toBeNull();
    expect(el.querySelector('[data-testid="typing"]')).toBeNull();
  });
});
