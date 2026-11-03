import { describe, expect, it } from 'vitest';
import { MAX_MESSAGES, applyAppend, applyRemove, applyReset, applyUpdate, queuedLast } from './chat-reducer';
import type { ChatMessage } from './types';

const msg = (id: string, text = id): ChatMessage => ({
  id,
  role: 'assistant',
  time: 0,
  parts: [{ type: 'text', text }],
});

describe('chat reducer', () => {
  it('reset replaces everything', () => {
    expect(applyReset([msg('a'), msg('b')]).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('append adds to the end in order', () => {
    expect(applyAppend([msg('a')], [msg('b'), msg('c')]).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('append with a known id replaces instead of duplicating', () => {
    const out = applyAppend([msg('a', 'old')], [msg('a', 'new')]);
    expect(out).toHaveLength(1);
    expect(out[0].parts[0]).toEqual({ type: 'text', text: 'new' });
  });

  it('update replaces by id and keeps order', () => {
    const out = applyUpdate([msg('a'), msg('b', 'x')], [msg('b', 'y')]);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out[1].parts[0]).toEqual({ type: 'text', text: 'y' });
  });

  it('update ignores unknown ids', () => {
    expect(applyUpdate([msg('a')], [msg('zzz')])).toHaveLength(1);
  });

  it('caps at 500 messages keeping the newest', () => {
    const many = Array.from({ length: MAX_MESSAGES + 20 }, (_, i) => msg(`m${i}`));
    const out = applyReset(many);
    expect(out).toHaveLength(MAX_MESSAGES);
    expect(out[0].id).toBe('m20');
    const appended = applyAppend(out, [msg('new')]);
    expect(appended).toHaveLength(MAX_MESSAGES);
    expect(appended.at(-1)?.id).toBe('new');
    expect(appended[0].id).toBe('m21');
  });

  it('remove drops the given ids and ignores unknown ones', () => {
    const out = applyRemove([msg('a'), msg('b'), msg('c')], ['b', 'zzz']);
    expect(out.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('queuedLast moves queued messages after the rest, keeping each group in order', () => {
    const q = (id: string): ChatMessage => ({ ...msg(id), role: 'user', queued: true });
    const out = queuedLast([msg('a'), q('q1'), msg('b'), q('q2'), msg('c')]);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c', 'q1', 'q2']);
  });

  it('queuedLast returns the same array when nothing is queued', () => {
    const list = [msg('a'), msg('b')];
    expect(queuedLast(list)).toBe(list);
  });
});
