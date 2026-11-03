import { describe, expect, it } from 'vitest';
import { isPrompt, queuedTexts, rewindPoint } from './rewind-target';
import type { ChatMessage } from './types';

const user = (id: string, text = id, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'user', time: 0, parts: [{ type: 'text', text }], ...extra });
const bot = (id: string): ChatMessage => ({ id, role: 'assistant', time: 0, parts: [{ type: 'text', text: id }] });

describe('rewindPoint', () => {
  const list = [user('u1'), bot('a1'), user('u2'), bot('a2'), user('u3'), bot('a3')];

  it('counts the prompts after the message and the chat messages that go', () => {
    expect(rewindPoint(list, 'u1')).toEqual({ text: 'u1', back: 2, removed: 5 });
    expect(rewindPoint(list, 'u3')).toEqual({ text: 'u3', back: 0, removed: 1 });
  });

  it('does not count queued messages, slash commands or system notices as prompts', () => {
    const l = [user('u1'), bot('a1'), user('cmd', '/compact'), user('q', 'later', { queued: true }), { ...bot('s'), role: 'system' as const }];
    expect(rewindPoint(l, 'u1')).toEqual({ text: 'u1', back: 0, removed: 2 });
  });

  it('offers nothing for assistant messages, slash commands, queued ones or unknown ids', () => {
    expect(rewindPoint(list, 'a1')).toBeNull();
    expect(rewindPoint([user('c', '/clear')], 'c')).toBeNull();
    expect(rewindPoint([user('q', 'x', { queued: true })], 'q')).toBeNull();
    expect(rewindPoint(list, 'zzz')).toBeNull();
  });

  it('skips a message that was rewound away: not a target, not counted', () => {
    expect(rewindPoint(list, 'u2', 'u3')).toEqual({ text: 'u2', back: 0, removed: 2 });
    expect(rewindPoint(list, 'u3', 'u3')).toBeNull();
  });

  it('joins the text parts of a message', () => {
    const m: ChatMessage = { id: 'm', role: 'user', time: 0, parts: [{ type: 'text', text: 'a' }, { type: 'image', path: '/x.png' }, { type: 'text', text: 'b' }] };
    expect(rewindPoint([m], 'm')?.text).toBe('a\nb');
    expect(isPrompt(m)).toBe(true);
  });
});

describe('queuedTexts', () => {
  it('lists the queue in order with the position of the message', () => {
    const l = [user('u1'), user('q1', 'A', { queued: true }), user('q2', 'B', { queued: true })];
    expect(queuedTexts(l, 'q2')).toEqual({ texts: ['A', 'B'], index: 1, ids: ['q1', 'q2'] });
    expect(queuedTexts(l, 'u1')).toBeNull();
  });
});

describe('the live transcript of the F17 check (13 user messages, parsed by the bridge)', () => {
  const texts = [
    'reply only with the word one, use no tools',
    'reply only with the word two, use no tools',
    'reply only with the word three, use no tools',
    'run this bash command and then reply done: for i in 1 2 3',
    'queued alpha: reply alpha',
    'queued bravo: reply bravo',
    'run this bash command and then reply done: sleep 90',
    'queued charlie: reply charlie',
    'queued delta: reply delta',
    'use the Bash tool in the foreground (run_in_background false)',
    'queued echo: reply echo',
    'queued foxtrot: reply foxtrot',
    '<task-notification>\n<task-id>b64bprwiv</task-id>',
  ];
  const thread = texts.flatMap((t, i) => [user(`u${i}`, t), bot(`a${i}`)]);

  it('"three" is 9 prompts from the end: the task notification is not a picker row', () => {
    expect(rewindPoint(thread, 'u2')).toMatchObject({ text: texts[2], back: 9 });
  });

  it('12 prompts are listed, delivered queued ones included, the injected notice not', () => {
    expect(thread.filter(isPrompt)).toHaveLength(12);
    expect(isPrompt(thread[24])).toBe(false);
    expect(rewindPoint(thread, 'u12')).toBeNull();
  });

  it('other injected notices are not prompts either', () => {
    for (const t of ['<local-command-stdout>ok</local-command-stdout>', '<command-name>/clear</command-name>', '<system-reminder>x</system-reminder>', '<bash-input>ls</bash-input>'])
      expect(isPrompt(user('x', t))).toBe(false);
    expect(isPrompt(user('x', '<div> is a tag, how do I close it?'))).toBe(true);
  });
});
