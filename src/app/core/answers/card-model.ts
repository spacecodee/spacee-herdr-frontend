import type { AgentQuestion, ToolPart } from '../chat/types';
import type { Answer } from './driver';

/** What the user has chosen for one question while the card is open. */
export interface Selection {
  picks: number[];
  other: boolean;
  text: string;
}

export const MASK = '••••••••';

export const emptySelection = (): Selection => ({ picks: [], other: false, text: '' });

const sorted = (picks: number[]): number[] => [...picks].sort((a, b) => a - b);

/** Tapping an option: a single question replaces its choice, a multi question flips it. */
export function toggle(q: AgentQuestion, s: Selection, index: number): Selection {
  if (!q.multiSelect) return { ...s, picks: [index], other: false };
  const has = s.picks.includes(index);
  return { ...s, picks: sorted(has ? s.picks.filter((p) => p !== index) : [...s.picks, index]) };
}

export function chooseOther(q: AgentQuestion, s: Selection): Selection {
  return q.multiSelect ? { ...s, other: !s.other } : { ...s, picks: [], other: true };
}

const typed = (s: Selection): boolean => s.text.trim() !== '';

export function isComplete(q: AgentQuestion, s: Selection): boolean {
  if (q.options.length === 0) return typed(s);
  if (s.other && !typed(s)) return false;
  return s.picks.length > 0 || s.other;
}

export function toAnswer(q: AgentQuestion, s: Selection): Answer {
  const text = q.options.length === 0 || s.other ? s.text.trim() : undefined;
  return text === undefined ? { picks: sorted(s.picks) } : { picks: sorted(s.picks), text };
}

/** The answer as shown back to the user; a secret is never shown. */
export function display(q: AgentQuestion, s: Selection): string {
  if (q.secret) return MASK;
  const labels = sorted(s.picks).map((i) => q.options[i]?.label ?? '');
  const text = q.options.length === 0 || s.other ? [s.text.trim()] : [];
  return [...labels, ...text].filter((x) => x !== '').join(', ');
}

/** A short name for a question: its header, else the question itself, else its place. */
export function topic(q: AgentQuestion, index: number): string {
  if (q.header?.trim()) return q.header.trim();
  const text = q.question.trim();
  return text === '' ? `Question ${index + 1}` : text.length > 40 ? text.slice(0, 39) + '…' : text;
}

/** "Approach: Hexagonal · Scope: API, Tests", from what the agent recorded. */
export function answeredLine(part: ToolPart): string {
  const answers = part.answers;
  if (!answers) return '';
  return (part.questions ?? [])
    .flatMap((q, i) => {
      const value = answers[q.question];
      if (value === undefined) return [];
      return [`${topic(q, i)}: ${q.secret ? MASK : value}`];
    })
    .join(' · ');
}
