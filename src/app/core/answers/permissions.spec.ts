import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { HcClient } from '../hc/hc-client';
import { ANSWER_TUNING } from './answers';
import { Permissions } from './permissions';
import { FakePermissionTui } from './testing/fake-permission';
import { QUESTION_SCREENS } from './testing/permission-screens';

function setup(tui: FakePermissionTui) {
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
  return { permissions: TestBed.inject(Permissions), call };
}

describe('Permissions', () => {
  it('shows a prompt only after two equal reads', async () => {
    const tui = new FakePermissionTui('claude');
    const { permissions, call } = setup(tui);
    await permissions.probe('t13', 'claude');
    expect(permissions.promptOf('t13')?.choices).toHaveLength(3);
    expect(call.mock.calls.filter(([m]) => m === 'terminal.read')).toHaveLength(2);
  });

  it('shows nothing while the screen keeps changing', async () => {
    const tui = new FakePermissionTui('claude');
    const { permissions } = setup(tui);
    let n = 0;
    tui.read = async () => {
      tui.cursor = n++ % 2;
      return tui.render();
    };
    await permissions.probe('t13', 'claude');
    expect(permissions.promptOf('t13')).toBeNull();
  });

  it('shows nothing for a question UI, an unknown agent, or a failed read', async () => {
    const tui = new FakePermissionTui('claude');
    const { permissions, call } = setup(tui);
    tui.override = QUESTION_SCREENS.claude;
    await permissions.probe('t13', 'claude');
    expect(permissions.promptOf('t13')).toBeNull();
    tui.override = null;
    await permissions.probe('t14', 'gemini');
    expect(permissions.promptOf('t14')).toBeNull();
    call.mockRejectedValueOnce(new Error('down'));
    await permissions.probe('t15', 'claude');
    expect(permissions.promptOf('t15')).toBeNull();
  });

  it('answers: keys through core, then "answered" with the label', async () => {
    const tui = new FakePermissionTui('claude');
    const { permissions, call } = setup(tui);
    await permissions.probe('t13', 'claude');
    const run = permissions.answer('t13', 'claude', 1);
    expect(permissions.stateOf('t13')).toEqual({ phase: 'sending' });
    await run;
    expect(call).toHaveBeenCalledWith('terminal.keys', { terminal: 't13', keys: ['down'] });
    expect(permissions.stateOf('t13')).toEqual({
      phase: 'answered',
      label: "Yes, and don't ask again for touch commands in /tmp",
    });
  });

  it('fails when the prompt stays after Enter', async () => {
    const tui = new FakePermissionTui('pi');
    const { permissions } = setup(tui);
    await permissions.probe('t13', 'pi');
    tui.ignoreEnter = true;
    await permissions.answer('t13', 'pi', 0);
    expect(permissions.stateOf('t13')).toEqual({ phase: 'failed' });
  });

  it('does nothing without a prompt', async () => {
    const tui = new FakePermissionTui('pi');
    const { permissions, call } = setup(tui);
    await permissions.answer('t13', 'pi', 0);
    expect(call).not.toHaveBeenCalled();
  });

  it('"No, and tell …": Esc, wait until the agent is free, then the text goes the normal way', async () => {
    const tui = new FakePermissionTui('claude');
    const { permissions, call } = setup(tui);
    await permissions.probe('t13', 'claude');
    const order: string[] = [];
    let blocked = true;
    const send = vi.fn((text: string) => void order.push(`send:${text}`));
    await permissions.answer('t13', 'claude', 2, {
      text: 'use /tmp/y instead',
      send,
      blocked: () => {
        order.push('blocked?');
        const was = blocked;
        blocked = false;
        return was;
      },
    });
    expect(tui.result).toBe('esc');
    expect(order).toEqual(['blocked?', 'blocked?', 'send:use /tmp/y instead']);
    expect(call).not.toHaveBeenCalledWith('terminal.send', expect.anything());
    expect(permissions.stateOf('t13')?.phase).toBe('answered');
  });

  it('does not send the text when the agent never frees up', async () => {
    const tui = new FakePermissionTui('claude');
    const { permissions } = setup(tui);
    await permissions.probe('t13', 'claude');
    const send = vi.fn();
    await permissions.answer('t13', 'claude', 2, { text: 'x', send, blocked: () => true });
    expect(send).not.toHaveBeenCalled();
    expect(permissions.stateOf('t13')).toEqual({ phase: 'failed' });
  });

  it('forget() drops the prompt and the answer', async () => {
    const tui = new FakePermissionTui('pi');
    const { permissions } = setup(tui);
    await permissions.probe('t13', 'pi');
    permissions.forget('t13');
    expect(permissions.promptOf('t13')).toBeNull();
    expect(permissions.stateOf('t13')).toBeUndefined();
  });

  it('settle() drops a stale prompt but keeps "You answered"', async () => {
    const tui = new FakePermissionTui('pi');
    const { permissions } = setup(tui);
    await permissions.probe('t13', 'pi');
    permissions.settle('t13');
    expect(permissions.promptOf('t13')).toBeNull();
    await permissions.probe('t14', 'pi');
    await permissions.answer('t14', 'pi', 0);
    permissions.settle('t14');
    expect(permissions.stateOf('t14')?.phase).toBe('answered');
  });
});
