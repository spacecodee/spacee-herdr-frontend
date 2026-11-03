import type { ChatMessage } from './types';

/** Messages kept in memory; older ones fall off the front. */
export const MAX_MESSAGES = 500;

const cap = (messages: ChatMessage[]): ChatMessage[] =>
  messages.length > MAX_MESSAGES ? messages.slice(messages.length - MAX_MESSAGES) : messages;

/** `reset`: the transcript is replaced wholesale. */
export function applyReset(messages: ChatMessage[]): ChatMessage[] {
  return cap([...messages]);
}

/** `append`: new messages at the end. A repeated id replaces in place instead of duplicating. */
export function applyAppend(current: ChatMessage[], added: ChatMessage[]): ChatMessage[] {
  const next = [...current];
  const index = new Map(next.map((m, i) => [m.id, i]));
  for (const message of added) {
    const at = index.get(message.id);
    if (at === undefined) {
      index.set(message.id, next.length);
      next.push(message);
    } else {
      next[at] = message;
    }
  }
  return cap(next);
}

/** `update`: same ids, replace in place; unknown ids are ignored (they may have been capped away). */
export function applyUpdate(current: ChatMessage[], updated: ChatMessage[]): ChatMessage[] {
  const byId = new Map(updated.map((m) => [m.id, m]));
  return current.map((m) => byId.get(m.id) ?? m);
}

/** `remove`: drops the given ids (queued messages the agent has taken). */
export function applyRemove(current: ChatMessage[], ids: string[]): ChatMessage[] {
  const gone = new Set(ids);
  return current.filter((m) => !gone.has(m.id));
}

/** Queued messages wait after everything else, as in the agent's own screen. */
export function queuedLast(messages: ChatMessage[]): ChatMessage[] {
  if (!messages.some((m) => m.queued)) return messages;
  return [...messages.filter((m) => !m.queued), ...messages.filter((m) => m.queued)];
}
