import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { ToolPart } from '../chat/types';
import { HcClient } from '../hc/hc-client';
import { ANSWER_TUNING, Answers, answerKey } from './answers';
import { FakeTui } from './testing/fake-tui';

const part: ToolPart = {
  type: 'tool',
  id: 'tool-1',
  name: 'AskUserQuestion',
  summary: 'Asked',
  status: 'running',
  questions: [{ question: 'Which color?', other: true, options: [{ label: 'Rojo' }, { label: 'Verde' }] }],
};

function setup(tui: FakeTui) {
  const call = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === 'terminal.read') return { text: await tui.read() };
    if (method === 'terminal.keys') return void (await tui.keys(params['keys'] as string[]));
    if (method === 'terminal.send') return void (await tui.send(params['text'] as string));
    throw new Error(method);
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: HcClient, useValue: { call } },
      { provide: ANSWER_TUNING, useValue: { attempts: 4, intervalMs: 0, sleep: async () => undefined } },
    ],
  });
  return { answers: TestBed.inject(Answers), call };
}

describe('Answers', () => {
  it('drives the terminal through core: read, keys, and a forced send for typed text', async () => {
    const tui = new FakeTui('claude', part.questions!);
    const { answers, call } = setup(tui);
    await answers.submit('t13', 'claude', part, [{ picks: [], text: 'teal' }]);
    expect(tui.recorded).toEqual([{ picks: [], text: 'teal' }]);
    expect(call).toHaveBeenCalledWith('terminal.read', { terminal: 't13' });
    expect(call).toHaveBeenCalledWith('terminal.keys', { terminal: 't13', keys: ['down', 'down'] });
    expect(call).toHaveBeenCalledWith('terminal.send', { terminal: 't13', text: 'teal', force: true });
  });

  it('is "sending" while it runs and stays so after the keys: only the transcript confirms', async () => {
    const tui = new FakeTui('claude', part.questions!);
    const { answers } = setup(tui);
    const key = answerKey('t13', part.id);
    expect(answers.stateOf(key)).toBeUndefined();
    const run = answers.submit('t13', 'claude', part, [{ picks: [1] }]);
    expect(answers.stateOf(key)).toBe('sending');
    await run;
    expect(answers.stateOf(key)).toBe('sending');
  });

  it('is "failed" when the screen is not the question, having pressed nothing', async () => {
    const tui = new FakeTui('claude', part.questions!);
    tui.override = 'Compiling…';
    const { answers, call } = setup(tui);
    await answers.submit('t13', 'claude', part, [{ picks: [0] }]);
    expect(answers.stateOf(answerKey('t13', part.id))).toBe('failed');
    expect(call.mock.calls.some(([m]) => m === 'terminal.keys' || m === 'terminal.send')).toBe(false);
  });

  it('is "failed" for an agent it has no driver for, without touching the terminal', async () => {
    const tui = new FakeTui('claude', part.questions!);
    const { answers, call } = setup(tui);
    await answers.submit('t13', 'gemini', part, [{ picks: [0] }]);
    expect(answers.stateOf(answerKey('t13', part.id))).toBe('failed');
    expect(call).not.toHaveBeenCalled();
  });

  it('ignores a second submit for the same question while one runs', async () => {
    const tui = new FakeTui('claude', part.questions!);
    const { answers } = setup(tui);
    const first = answers.submit('t13', 'claude', part, [{ picks: [1] }]);
    await answers.submit('t13', 'claude', part, [{ picks: [0] }]);
    await first;
    expect(tui.recorded).toEqual([{ picks: [1] }]);
  });

  it('forgets a question once the agent answered it', async () => {
    const tui = new FakeTui('claude', part.questions!);
    const { answers } = setup(tui);
    await answers.submit('t13', 'claude', part, [{ picks: [1] }]);
    answers.clear(answerKey('t13', part.id));
    expect(answers.stateOf(answerKey('t13', part.id))).toBeUndefined();
  });
});
