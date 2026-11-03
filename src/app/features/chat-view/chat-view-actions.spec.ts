import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Permissions } from '../../core/answers/permissions';
import { Rewind } from '../../core/answers/rewind';
import type { ChatMessage } from '../../core/chat/types';
import { ChatView, type MessageEdit } from './chat-view';

const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('@spartan-ng/brain/sonner', () => ({ toast: toastFn }));

const user = (id: string, text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'user', time: 0, parts: [{ type: 'text', text }], ...extra });
const bot = (id: string): ChatMessage => ({ id, role: 'assistant', time: 0, parts: [{ type: 'text', text: id }] });

@Component({
  imports: [ChatView],
  template: `<app-chat-view
    [messages]="messages()"
    state="live"
    [status]="status()"
    address="t13"
    [agent]="agent()"
    [rewoundId]="rewoundId()"
    (showTerminal)="shown = shown + 1"
    (edit)="edits.push($event)"
    (delivered)="delivered.push($event)"
  />`,
})
class Host {
  messages = signal<ChatMessage[]>([]);
  status = signal<string | undefined>('idle');
  agent = signal('claude');
  rewoundId = signal<string | null>(null);
  shown = 0;
  edits: MessageEdit[] = [];
  delivered: string[][] = [];
}

const rewind = {
  peek: vi.fn(),
  rewind: vi.fn(),
  takeQueued: vi.fn(),
  requeue: vi.fn(),
};

async function setup(messages: ChatMessage[], agent = 'claude') {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.messages.set(messages);
  fixture.componentInstance.agent.set(agent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  };
  const q = <T extends HTMLElement>(sel: string) => document.body.querySelector<T>(sel);
  return { fixture, host: fixture.componentInstance, el, q, settle };
}

describe('ChatView message actions', () => {
  beforeEach(() => {
    for (const fn of Object.values(rewind)) fn.mockReset();
    toastFn.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: Rewind, useValue: rewind },
        { provide: Permissions, useValue: { promptOf: () => null, stateOf: () => undefined, probe: vi.fn(), settle: vi.fn(), answer: vi.fn() } },
      ],
    });
  });

  const thread = [user('u1', 'one'), bot('a1'), user('u2', 'two'), bot('a2'), user('u3', 'three'), bot('a3')];

  it('offers actions on sent user messages of Claude, Codex and opencode, not on pi', async () => {
    for (const agent of ['claude', 'codex', 'opencode']) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: Rewind, useValue: rewind }, { provide: Permissions, useValue: { promptOf: () => null, stateOf: () => undefined, probe: vi.fn(), settle: vi.fn() } }] });
      const { el } = await setup(thread, agent);
      expect(el.querySelectorAll('[data-message-more]')).toHaveLength(3);
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Rewind, useValue: rewind }, { provide: Permissions, useValue: { promptOf: () => null, stateOf: () => undefined, probe: vi.fn(), settle: vi.fn() } }] });
    const { el } = await setup(thread, 'pi');
    expect(el.querySelectorAll('[data-message-more]')).toHaveLength(0);
  });

  it('queued messages have actions only on Claude', async () => {
    const queued = [user('u1', 'one'), user('q', 'later', { queued: true })];
    const claude = await setup(queued, 'claude');
    expect(claude.el.querySelectorAll('[data-message-more]')).toHaveLength(2);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Rewind, useValue: rewind }, { provide: Permissions, useValue: { promptOf: () => null, stateOf: () => undefined, probe: vi.fn(), settle: vi.fn() } }] });
    const codex = await setup(queued, 'codex');
    expect(codex.el.querySelectorAll('[data-message-more]')).toHaveLength(1);
  });

  it('Edit on a queued message takes the queue back and hands the text to the compose field', async () => {
    rewind.takeQueued.mockResolvedValue({ ok: true });
    const { el, host, q, settle } = await setup([user('u1', 'one'), user('q1', 'A', { queued: true }), user('q2', 'B', { queued: true })]);
    el.querySelectorAll<HTMLButtonElement>('[data-message-more]')[2].click();
    await settle();
    q<HTMLButtonElement>('[data-action-edit-queued]')!.click();
    await settle();
    expect(rewind.takeQueued).toHaveBeenCalledWith('t13', ['A', 'B'], 1);
    expect(host.edits).toMatchObject([{ id: 'q2', text: 'B', mode: 'queued' }]);
    expect(q('[data-message-sheet]')).toBeNull();
  });

  it('Cancel removes it without a confirm and offers Undo, which queues it again', async () => {
    rewind.takeQueued.mockResolvedValue({ ok: true });
    const { el, host, q, settle } = await setup([user('u1', 'one'), user('q1', 'A', { queued: true })]);
    el.querySelectorAll<HTMLButtonElement>('[data-message-more]')[1].click();
    await settle();
    q<HTMLButtonElement>('[data-action-cancel-queued]')!.click();
    await settle();
    expect(host.edits).toEqual([]);
    const [text, options] = toastFn.mock.calls[0];
    expect(text).toBe('Message cancelled');
    options.action.onClick();
    expect(rewind.requeue).toHaveBeenCalledWith('t13', 'A');
  });

  it('keeps the sheet open with the reason when the queue is gone', async () => {
    rewind.takeQueued.mockResolvedValue({ ok: false, reason: 'queue' });
    const { el, host, q, settle } = await setup([user('q1', 'A', { queued: true })]);
    el.querySelector<HTMLButtonElement>('[data-message-more]')!.click();
    await settle();
    q<HTMLButtonElement>('[data-action-edit-queued]')!.click();
    await settle();
    expect(q('[data-error]')?.textContent).toContain('Already sent');
    expect(host.delivered).toEqual([['q1']]);
    expect(host.edits).toEqual([]);
  });

  it('Edit and resend goes back to the message and hands it over for editing', async () => {
    rewind.rewind.mockResolvedValue({ ok: true });
    const { el, host, q, settle } = await setup(thread);
    el.querySelectorAll<HTMLButtonElement>('[data-message-more]')[1].click();
    await settle();
    q<HTMLButtonElement>('[data-action-edit-sent]')!.click();
    await settle();
    expect(rewind.rewind).toHaveBeenCalledWith('t13', 'claude', { text: 'two', back: 1, files: false });
    expect(host.edits).toMatchObject([{ id: 'u2', text: 'two', mode: 'sent', removed: 3 }]);
    expect(host.edits[0].message.id).toBe('u2');
  });

  it('Rewind to here confirms first, peeks at the files and passes the toggle', async () => {
    rewind.peek.mockResolvedValue({ ok: true, codeChanges: true });
    rewind.rewind.mockResolvedValue({ ok: true });
    const { el, host, q, settle } = await setup(thread);
    el.querySelectorAll<HTMLButtonElement>('[data-message-more]')[0].click();
    await settle();
    q<HTMLButtonElement>('[data-action-rewind]')!.click();
    await settle();
    expect(rewind.peek).toHaveBeenCalledWith('t13', 'claude', { text: 'one', back: 2 });
    expect(rewind.rewind).not.toHaveBeenCalled();
    expect(q('[data-removed]')?.textContent).toContain('5 later messages');
    q<HTMLElement>('hlm-switch button')!.click();
    await settle();
    q<HTMLButtonElement>('[data-confirm-rewind]')!.click();
    await settle();
    expect(rewind.rewind).toHaveBeenCalledWith('t13', 'claude', { text: 'one', back: 2, files: true });
    expect(host.edits).toMatchObject([{ id: 'u1', text: 'one', mode: 'rewind', removed: 5 }]);
  });

  it('shows why a rewind failed and does not hand anything over', async () => {
    rewind.peek.mockResolvedValue({ ok: true, codeChanges: false });
    rewind.rewind.mockResolvedValue({ ok: false, reason: 'prompt' });
    const { el, host, q, settle } = await setup(thread);
    el.querySelectorAll<HTMLButtonElement>('[data-message-more]')[2].click();
    await settle();
    q<HTMLButtonElement>('[data-action-rewind]')!.click();
    await settle();
    q<HTMLButtonElement>('[data-confirm-rewind]')!.click();
    await settle();
    expect(q('[data-error]')?.textContent).toContain('does not match this message');
    expect(host.edits).toEqual([]);
  });

  it('rewinding is disabled while the agent works', async () => {
    const { el, host, q, settle } = await setup(thread);
    host.status.set('working');
    await settle();
    el.querySelectorAll<HTMLButtonElement>('[data-message-more]')[0].click();
    await settle();
    expect(q<HTMLButtonElement>('[data-action-rewind]')!.disabled).toBe(true);
    expect(q('[data-open-terminal-note]')).not.toBeNull();
  });

  it('a message already rewound away offers nothing and is not counted', async () => {
    const { el, host, settle } = await setup(thread);
    host.rewoundId.set('u3');
    await settle();
    expect(el.querySelectorAll('[data-message-more]')).toHaveLength(2);
  });

  it('a long press opens the actions', async () => {
    const { el, q, settle } = await setup(thread);
    const bubble = el.querySelectorAll<HTMLElement>('[hlmBubble]')[0];
    vi.useFakeTimers();
    try {
      bubble.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
      vi.advanceTimersByTime(600);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    expect(q('[data-message-sheet]')).not.toBeNull();
  });
});
