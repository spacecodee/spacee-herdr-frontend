import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { HcClient } from '../hc/hc-client';
import { ANSWER_TUNING } from './answers';
import { Rewind, rewindAgent } from './rewind';
import { FakeClaude, FakeOpencode } from './testing/fake-rewind';

function setup(tui: FakeClaude | FakeOpencode) {
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
  return { rewind: TestBed.inject(Rewind), call };
}

describe('rewindAgent', () => {
  it('knows Claude, Codex and opencode; pi and shells get nothing', () => {
    expect(rewindAgent('claude')).toBe('claude');
    expect(rewindAgent('codex')).toBe('codex');
    expect(rewindAgent('opencode')).toBe('opencode');
    expect(rewindAgent('pi')).toBeNull();
    expect(rewindAgent('')).toBeNull();
  });
});

describe('Rewind', () => {
  it('drives the agent through core and is free again afterwards', async () => {
    const tui = new FakeClaude({ prompts: ['one', 'two'] });
    const { rewind, call } = setup(tui);
    const pending = rewind.rewind('t13', 'claude', { text: 'one', back: 1 });
    expect(rewind.isRunning('t13')).toBe(true);
    expect(await pending).toEqual({ ok: true, codeChanges: false });
    expect(rewind.isRunning('t13')).toBe(false);
    expect(tui.prompts).toEqual([]);
    expect(call.mock.calls.every(([, p]) => (p as { terminal: string }).terminal === 't13')).toBe(true);
  });

  it('refuses an agent it cannot drive without touching the terminal', async () => {
    const { rewind, call } = setup(new FakeClaude({ prompts: ['one'] }));
    expect(await rewind.rewind('t13', 'pi', { text: 'one', back: 0 })).toEqual({ ok: false, reason: 'screen' });
    expect(call).not.toHaveBeenCalled();
  });

  it('runs one action per terminal at a time', async () => {
    const tui = new FakeClaude({ prompts: ['one'] });
    const { rewind } = setup(tui);
    const first = rewind.rewind('t13', 'claude', { text: 'one', back: 0 });
    expect(await rewind.rewind('t13', 'claude', { text: 'one', back: 0 })).toEqual({ ok: false, reason: 'busy' });
    await first;
  });

  it('takes the queued messages back and types the others again', async () => {
    const tui = new FakeClaude({ prompts: ['one'], working: true, queued: ['A', 'B'] });
    const { rewind } = setup(tui);
    expect(await rewind.takeQueued('t13', ['A', 'B'], 0)).toEqual({ ok: true });
    expect(tui.typed).toEqual(['B']);
  });

  it('requeues a cancelled message with terminal.send', async () => {
    const tui = new FakeClaude({ prompts: ['one'], working: true });
    const { rewind, call } = setup(tui);
    expect(await rewind.requeue('t13', 'A')).toBe(true);
    expect(call).toHaveBeenCalledWith('terminal.send', { terminal: 't13', text: 'A', force: true });
  });

  it('reports a transport error as a failure instead of throwing', async () => {
    const tui = new FakeOpencode({ messages: 1 });
    const { rewind, call } = setup(tui);
    call.mockRejectedValue(new Error('down'));
    expect(await rewind.rewind('t13', 'opencode', { text: 'x', back: 0 })).toEqual({ ok: false, reason: 'transport' });
  });
});
