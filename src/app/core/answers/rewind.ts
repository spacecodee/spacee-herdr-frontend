import { Service, inject, signal } from '@angular/core';
import { HcClient } from '../hc/hc-client';
import { ANSWER_TUNING } from './answers';
import type { FailReason, TerminalPort } from './driver';
import { rewindClaude, rewindCodex, rewindOpencode, takeQueued, type RewindResult, type RewindTarget } from './rewind-driver';
import { driverAgent } from './profiles';

export type RewindAgent = 'claude' | 'codex' | 'opencode';

/** The agents whose own screen the app knows how to rewind. Others (pi, shells) get no action. */
export function rewindAgent(name: string | null | undefined): RewindAgent | null {
  const agent = driverAgent(name);
  return agent === 'claude' || agent === 'codex' || agent === 'opencode' ? agent : null;
}

/** What the user is told when the screen did not match; nothing more was pressed. */
export const REWIND_FAILURE: Record<FailReason, string> = {
  screen: 'The agent’s screen is not what was expected. Open the terminal to do this there.',
  cursor: 'The agent’s screen is not what was expected. Open the terminal to do this there.',
  checkbox: 'The agent’s screen is not what was expected. Open the terminal to do this there.',
  stalled: 'The agent did not respond as expected. Open the terminal to check.',
  transport: 'Cannot reach the terminal.',
  busy: 'The agent is busy. Wait until it is idle.',
  queue: 'Already sent. The agent took your queued messages.',
  prompt: 'The agent’s history does not match this message. Open the terminal to do this there.',
  steer: 'This message was sent while the agent was working and cannot be edited.',
};

/** The core statuses in which an agent's composer is free. */
export const FREE_STATUSES: readonly string[] = ['idle', 'done'];

/** No action may wait longer than this on the agent's screen: it ends as a visible failure. */
export const REWIND_DEADLINE_MS = 40_000;

/** Races `work` against the deadline; a late result is dropped (the driver itself is bounded too). */
async function withDeadline(work: Promise<RewindResult>): Promise<RewindResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<RewindResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: 'stalled' }), REWIND_DEADLINE_MS);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Edits or rewinds an agent's conversation by typing into its own screen through core. Every
 * destructive key follows a read that proves the screen is the expected one (see `rewind-driver.ts`).
 * Only one action runs per terminal at a time.
 */
@Service()
export class Rewind {
  private readonly client = inject(HcClient);
  private readonly tuning = inject(ANSWER_TUNING);
  private readonly running = signal<ReadonlySet<string>>(new Set());

  isRunning(address: string): boolean {
    return this.running().has(address);
  }

  /** Whether the conversation can be rewound to this prompt, and whether files would be restored too. */
  async peek(address: string, agentName: string, target: Omit<RewindTarget, 'peek'>): Promise<RewindResult> {
    return this.run(address, agentName, { ...target, peek: true });
  }

  async rewind(address: string, agentName: string, target: RewindTarget): Promise<RewindResult> {
    return this.run(address, agentName, target);
  }

  /** Pulls the queued messages back and types the others again; the chosen one is for the compose field. */
  async takeQueued(address: string, texts: string[], chosen: number): Promise<RewindResult> {
    if (this.running().has(address)) return { ok: false, reason: 'busy' };
    this.mark(address, true);
    try {
      return await withDeadline(takeQueued(this.port(address), texts, chosen, this.tuning));
    } finally {
      this.mark(address, false);
    }
  }

  /** Puts a cancelled message back in the queue (or sends it, when the agent has since gone idle). */
  async requeue(address: string, text: string): Promise<boolean> {
    try {
      await this.port(address).send(text);
      return true;
    } catch {
      return false;
    }
  }

  private async run(address: string, agentName: string, target: RewindTarget): Promise<RewindResult> {
    const agent = rewindAgent(agentName);
    if (!agent) return { ok: false, reason: 'screen' };
    if (this.running().has(address)) return { ok: false, reason: 'busy' };
    this.mark(address, true);
    try {
      const port = this.port(address);
      switch (agent) {
        case 'claude':
          return await withDeadline(rewindClaude(port, target, this.tuning));
        case 'codex':
          return await withDeadline(rewindCodex(port, target, this.tuning));
        case 'opencode':
          return await withDeadline(rewindOpencode(port, target, this.tuning));
      }
    } finally {
      this.mark(address, false);
    }
  }

  private mark(address: string, on: boolean): void {
    this.running.update((set) => {
      const next = new Set(set);
      if (on) next.add(address);
      else next.delete(address);
      return next;
    });
  }

  private port(address: string): TerminalPort {
    return {
      read: async () => (await this.client.call<{ text?: string }>('terminal.read', { terminal: address })).text ?? '',
      keys: async (keys) => void (await this.client.call('terminal.keys', { terminal: address, keys })),
      send: async (text) => void (await this.client.call('terminal.send', { terminal: address, text, force: true })),
    };
  }
}
