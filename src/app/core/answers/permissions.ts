import { Service, inject, signal } from '@angular/core';
import { HcClient } from '../hc/hc-client';
import { ANSWER_TUNING } from './answers';
import type { TerminalPort } from './driver';
import { parsePermission, samePrompt, type PermissionPrompt } from './permission';
import { drivePermission } from './permission-driver';
import { driverAgent } from './profiles';

export type PermissionState = { phase: 'sending' } | { phase: 'failed' } | { phase: 'answered'; label: string };

/** What "No, and tell …" sends once the agent is free again. */
export interface DenyText {
  text: string;
  /** The normal send path of the terminal. */
  send: (text: string) => void;
  /** Whether the terminal still reads as blocked. */
  blocked: () => boolean;
}

/**
 * Reads an agent's permission prompt off its screen through core and answers it. The screen is the
 * only source (no agent records the pending request), so a prompt is shown only when two reads
 * agree, and an answer is only pressed while the screen still shows that same prompt. Neither the
 * screen nor the typed text is ever logged.
 */
@Service()
export class Permissions {
  private readonly client = inject(HcClient);
  private readonly tuning = inject(ANSWER_TUNING);
  private readonly prompts = signal<Readonly<Record<string, PermissionPrompt>>>({});
  private readonly states = signal<Readonly<Record<string, PermissionState>>>({});
  private readonly probing = new Set<string>();

  promptOf(address: string): PermissionPrompt | null {
    return this.prompts()[address] ?? null;
  }

  stateOf(address: string): PermissionState | undefined {
    return this.states()[address];
  }

  forget(address: string): void {
    this.prompts.update(({ [address]: _p, ...rest }) => rest);
    this.states.update(({ [address]: _s, ...rest }) => rest);
  }

  /** The agent is no longer blocked: a prompt nobody answered is stale; an answered one stays as "You answered" until the next probe. */
  settle(address: string): void {
    if (this.states()[address]?.phase !== 'answered') this.forget(address);
  }

  /** Reads the screen until two reads agree on a prompt; leaves none when they never do. */
  async probe(address: string, agentName: string): Promise<void> {
    const agent = driverAgent(agentName);
    if (!agent || this.probing.has(address)) return;
    this.probing.add(address);
    this.forget(address);
    try {
      const port = this.port(address);
      for (let i = 0; i < this.tuning.attempts; i++) {
        const first = parsePermission(await port.read(), agent);
        if (first) {
          await this.tuning.sleep(this.tuning.intervalMs);
          if (samePrompt(first, parsePermission(await port.read(), agent))) {
            this.prompts.update((p) => ({ ...p, [address]: first }));
            return;
          }
        } else await this.tuning.sleep(this.tuning.intervalMs);
      }
    } catch {
      // No prompt shown: the card keeps offering the terminal.
    } finally {
      this.probing.delete(address);
    }
  }

  async answer(address: string, agentName: string, choice: number, deny?: DenyText): Promise<void> {
    const shown = this.promptOf(address);
    const agent = driverAgent(agentName);
    if (!shown || !agent || shown.agent !== agent || this.stateOf(address)?.phase === 'sending') return;
    this.set(address, { phase: 'sending' });
    const result = await drivePermission(this.port(address), shown, choice, this.tuning);
    if (!result.ok) return this.set(address, { phase: 'failed' });
    if (shown.choices[choice].kind === 'deny-text' && deny) {
      let free = false;
      for (let i = 0; i < this.tuning.attempts && !(free = !deny.blocked()); i++) await this.tuning.sleep(this.tuning.intervalMs);
      if (!free) return this.set(address, { phase: 'failed' });
      deny.send(deny.text);
    }
    this.set(address, { phase: 'answered', label: shown.choices[choice].label });
  }

  private set(address: string, state: PermissionState): void {
    this.states.update((s) => ({ ...s, [address]: state }));
  }

  private port(address: string): TerminalPort {
    return {
      read: async () => (await this.client.call<{ text?: string }>('terminal.read', { terminal: address })).text ?? '',
      keys: async (keys) => void (await this.client.call('terminal.keys', { terminal: address, keys })),
      send: async (text) => void (await this.client.call('terminal.send', { terminal: address, text, force: true })),
    };
  }
}
