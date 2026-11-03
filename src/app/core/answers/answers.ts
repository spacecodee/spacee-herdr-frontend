import { InjectionToken, Service, inject, signal } from '@angular/core';
import type { ToolPart } from '../chat/types';
import { HcClient } from '../hc/hc-client';
import { DEFAULT_TUNING, drive, type Answer, type TerminalPort, type Tuning } from './driver';
import { canDrive, driverAgent } from './profiles';

export type AnswerState = 'sending' | 'failed';

/** Swapped in tests so no spec waits on real timers. */
export const ANSWER_TUNING = new InjectionToken<Tuning>('ANSWER_TUNING', { factory: () => DEFAULT_TUNING });

export const answerKey = (address: string, toolId: string): string => `${address}:${toolId}`;

/**
 * Answers an agent's question by typing into its own screen through core (`terminal.read`,
 * `terminal.keys`, `terminal.send`). "sending" lasts until the transcript shows the answers (the
 * part turns `ok`), which is the only confirmation; "failed" means the screen did not match and
 * nothing more was pressed. The typed text is only ever handed to `terminal.send`.
 */
@Service()
export class Answers {
  private readonly client = inject(HcClient);
  private readonly tuning = inject(ANSWER_TUNING);
  private readonly states = signal<Readonly<Record<string, AnswerState>>>({});

  stateOf(key: string): AnswerState | undefined {
    return this.states()[key];
  }

  clear(key: string): void {
    this.states.update(({ [key]: _gone, ...rest }) => rest);
  }

  async submit(address: string, agentName: string, part: ToolPart, answers: Answer[]): Promise<void> {
    const key = answerKey(address, part.id);
    if (this.states()[key] === 'sending') return;
    const agent = driverAgent(agentName);
    const questions = part.questions ?? [];
    if (!canDrive(agent, questions, part.truncated)) {
      this.set(key, 'failed');
      return;
    }
    this.set(key, 'sending');
    const port: TerminalPort = {
      read: async () => (await this.client.call<{ text?: string }>('terminal.read', { terminal: address })).text ?? '',
      keys: async (keys) => void (await this.client.call('terminal.keys', { terminal: address, keys })),
      send: async (text) => void (await this.client.call('terminal.send', { terminal: address, text, force: true })),
    };
    const result = await drive(port, agent, questions, answers, this.tuning);
    if (!result.ok) this.set(key, 'failed');
  }

  private set(key: string, state: AnswerState): void {
    this.states.update((s) => ({ ...s, [key]: state }));
  }
}
