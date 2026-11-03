import { signal } from '@angular/core';
import type { PermissionPrompt } from '../core/answers/permission';
import type { PermissionState } from '../core/answers/permissions';

/** Dev-only: the permission prompts the design shows (placeholder content). */
export const CLAUDE_PROMPT: PermissionPrompt = {
  agent: 'claude',
  title: 'Allow Claude to run this command?',
  request: ['Bash: pnpm test --watch=false'],
  choices: [
    { label: 'Yes', kind: 'approve' },
    { label: "Yes, and don't ask again for this command", kind: 'approve-remember' },
    { label: 'No, and tell Claude what to do differently', kind: 'deny-text' },
  ],
  cursor: 0,
};

export const PI_PROMPT: PermissionPrompt = {
  agent: 'pi',
  title: 'Overwrite the existing settings.css?',
  request: ['src/styles/settings.css'],
  choices: [
    { label: 'Yes', kind: 'approve' },
    { label: 'No', kind: 'deny' },
  ],
  cursor: 0,
};

/** A stand-in for `Permissions`: one prompt for `address`; answering only moves it to "sending". */
export function fixturePermissions(address: string, prompt: PermissionPrompt, initial?: PermissionState) {
  const state = signal<PermissionState | undefined>(initial);
  return {
    promptOf: (a: string) => (a === address ? prompt : null),
    stateOf: (a: string) => (a === address ? state() : undefined),
    probe: async () => undefined,
    settle: () => undefined,
    answer: async () => state.set({ phase: 'sending' }),
  };
}
