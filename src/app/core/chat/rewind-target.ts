import { hasTypedText } from './envelope';
import { slashCommandLine } from './slash-message';
import type { ChatMessage } from './types';

export const REWOUND_DIVIDER_ID = 'rewound-divider';

export const messageText = (m: ChatMessage): string =>
  m.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n');

/** Text the harness injects as a "user" turn (task and command notices): the agent's own history does not list it as a prompt. */
const INJECTED = /^\s*<(task-notification|local-command-\w+|command-(name|message|args)|bash-(input|stdout|stderr)|system-reminder|user-prompt-submit-hook)\b/;

/** A message the agent's own history lists as a prompt: a user turn that is not queued, not a slash command. */
export const isPrompt = (m: ChatMessage): boolean =>
  m.role === 'user' && !m.queued && m.id !== REWOUND_DIVIDER_ID && messageText(m).trim() !== '' && !INJECTED.test(messageText(m)) && hasTypedText(messageText(m)) && slashCommandLine(messageText(m)) === null;

export interface RewindPoint {
  text: string;
  /** Prompts after this one that the agent still has: 0 for the last. */
  back: number;
  /** Chat messages that disappear (everything after it, queued ones aside). */
  removed: number;
}

/**
 * Where a rewind to message `id` lands. `rewoundId` is a message already rewound away (it stays in the
 * chat but the agent no longer has it), so it is neither a target nor counted. Null when `id` is not
 * a prompt the agent lists.
 */
export function rewindPoint(messages: ChatMessage[], id: string, rewoundId: string | null = null): RewindPoint | null {
  const at = messages.findIndex((m) => m.id === id);
  if (at < 0 || id === rewoundId || !isPrompt(messages[at])) return null;
  const live = messages.filter((m) => m.id !== rewoundId);
  const after = live.slice(live.findIndex((m) => m.id === id) + 1);
  return {
    text: messageText(messages[at]),
    back: after.filter(isPrompt).length,
    removed: after.filter((m) => !m.queued && m.role !== 'system').length,
  };
}

/** The queued messages in the order the agent shows them, with the position of `id` among them. */
export function queuedTexts(messages: ChatMessage[], id: string): { texts: string[]; index: number; ids: string[] } | null {
  const queued = messages.filter((m) => m.queued && m.role === 'user');
  const index = queued.findIndex((m) => m.id === id);
  return index < 0 ? null : { texts: queued.map(messageText), index, ids: queued.map((m) => m.id) };
}
