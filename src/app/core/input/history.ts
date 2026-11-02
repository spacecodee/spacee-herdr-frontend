export const HISTORY_LIMIT = 50;
export const MAX_SUGGESTIONS = 3;

const key = (address: string) => `spacee-herdr.history.${address}`;

/** Sent messages for one terminal, most recent first. Storage problems read as empty. */
export function loadHistory(address: string): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key(address)) ?? 'null');
    return Array.isArray(stored)
      ? stored.filter((e): e is string => typeof e === 'string').slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/** Records a sent message (no consecutive duplicates, last 50) and returns the new list. */
export function pushHistory(address: string, text: string): string[] {
  const current = loadHistory(address);
  if (text === '' || current[0] === text) return current;
  const next = [text, ...current].slice(0, HISTORY_LIMIT);
  try {
    localStorage.setItem(key(address), JSON.stringify(next));
  } catch {
    // private mode or quota: the list still applies for this session
  }
  return next;
}

/** Up to 3 entries that start with `text` (case-insensitive), never the exact entry itself. */
export function suggestions(history: readonly string[], text: string): string[] {
  if (text === '') return [];
  const prefix = text.toLowerCase();
  return history
    .filter((entry) => entry !== text && entry.toLowerCase().startsWith(prefix))
    .slice(0, MAX_SUGGESTIONS);
}
