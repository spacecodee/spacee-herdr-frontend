import type { Platform } from './devices';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ACTIVE_NOW_MS = 120_000;
const DAY_MS = 86_400_000;

export const MAX_NAME_LENGTH = 40;
export const CODE_LENGTH = 6;

/** What a person types or pastes (`k7m 2qx`) as a code: upper case letters and digits, at most six. */
export function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

/** `K7M2QX` -> `K7M 2QX`. */
export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`.trim();
}

const dayMonth = (ms: number) => `${new Date(ms).getDate()} ${MONTHS[new Date(ms).getMonth()]}`;

/** "Active now" under two minutes, then "5m ago", "2h ago", "3d ago", and a date after 30 days. */
export function lastSeenLabel(lastSeen: string, now: number): string {
  const ms = Date.parse(lastSeen);
  if (Number.isNaN(ms)) return '';
  const diff = now - ms;
  if (diff < ACTIVE_NOW_MS) return 'Active now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return dayMonth(ms);
}

export function signedInLabel(created: string): string {
  const ms = Date.parse(created);
  return Number.isNaN(ms) ? '' : `signed in ${dayMonth(ms)}`;
}

/** Time left as `m:ss`, never below 0:00. */
export function countdown(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Empty when the name is fine (1-40 characters after trimming). */
export function nameProblem(name: string): string {
  const length = name.trim().length;
  if (length === 0) return 'Enter a name';
  return length > MAX_NAME_LENGTH ? `Use ${MAX_NAME_LENGTH} characters or fewer` : '';
}

/** Which icon a device shows: the Apple or Android mark, or a generic monitor. */
export function platformMark(platform: Platform): 'apple' | 'android' | 'monitor' {
  if (platform === 'android') return 'android';
  return platform === 'other' ? 'monitor' : 'apple';
}
