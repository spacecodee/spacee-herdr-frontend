import { describe, expect, it } from 'vitest';
import type { AgentQuestion, ToolPart } from '../chat/types';
import {
  MASK,
  answeredLine,
  chooseOther,
  display,
  emptySelection,
  isComplete,
  toAnswer,
  toggle,
  topic,
} from './card-model';

const single: AgentQuestion = { question: 'Which architecture?', header: 'Approach', other: true, options: [{ label: 'Hexagonal' }, { label: 'Feature folders' }] };
const multi: AgentQuestion = { question: 'Which parts?', header: 'Scope', multiSelect: true, other: true, options: [{ label: 'API' }, { label: 'Tests' }, { label: 'Docs' }] };
const free: AgentQuestion = { question: 'Flag name?', header: 'Name', other: true, options: [] };
const secret: AgentQuestion = { question: 'Deploy key?', header: 'Key', secret: true, other: true, options: [] };

describe('selection', () => {
  it('a single question keeps one choice; tapping another replaces it and clears "Other"', () => {
    let s = toggle(single, emptySelection(), 0);
    s = toggle(single, s, 1);
    expect(s.picks).toEqual([1]);
    s = chooseOther(single, s);
    expect(s).toMatchObject({ picks: [], other: true });
    s = toggle(single, s, 0);
    expect(s).toMatchObject({ picks: [0], other: false });
  });

  it('a multi question toggles each option and "Other" independently', () => {
    let s = toggle(multi, emptySelection(), 2);
    s = toggle(multi, s, 0);
    s = chooseOther(multi, s);
    expect(s).toMatchObject({ picks: [0, 2], other: true });
    s = toggle(multi, s, 2);
    s = chooseOther(multi, s);
    expect(s).toMatchObject({ picks: [0], other: false });
  });
});

describe('isComplete', () => {
  it('needs a choice, or typed text for "Other" and free-text questions', () => {
    expect(isComplete(single, emptySelection())).toBe(false);
    expect(isComplete(single, toggle(single, emptySelection(), 0))).toBe(true);
    expect(isComplete(single, { picks: [], other: true, text: '  ' })).toBe(false);
    expect(isComplete(single, { picks: [], other: true, text: 'x' })).toBe(true);
    expect(isComplete(multi, { picks: [], other: false, text: '' })).toBe(false);
    expect(isComplete(multi, { picks: [1], other: true, text: '' })).toBe(false);
    expect(isComplete(free, { picks: [], other: false, text: '' })).toBe(false);
    expect(isComplete(free, { picks: [], other: false, text: 'name' })).toBe(true);
  });
});

describe('toAnswer', () => {
  it('sends picks and trimmed text only when "Other" is on', () => {
    expect(toAnswer(single, toggle(single, emptySelection(), 1))).toEqual({ picks: [1] });
    expect(toAnswer(single, { picks: [], other: true, text: ' teal ' })).toEqual({ picks: [], text: 'teal' });
    expect(toAnswer(multi, { picks: [2, 0], other: false, text: 'ignored' })).toEqual({ picks: [0, 2] });
    expect(toAnswer(multi, { picks: [1], other: true, text: 'CI' })).toEqual({ picks: [1], text: 'CI' });
    expect(toAnswer(free, { picks: [], other: false, text: 'flag' })).toEqual({ picks: [], text: 'flag' });
  });
});

describe('display', () => {
  it('shows labels and text, and never a secret', () => {
    expect(display(multi, { picks: [0, 1], other: true, text: 'CI config' })).toBe('API, Tests, CI config');
    expect(display(single, toggle(single, emptySelection(), 1))).toBe('Feature folders');
    expect(display(secret, { picks: [], other: false, text: 'hunter2' })).toBe(MASK);
    expect(display(secret, { picks: [], other: false, text: 'hunter2' })).not.toContain('hunter2');
  });
});

describe('topic', () => {
  it('is the header, else the question clipped, else its place', () => {
    expect(topic(single, 0)).toBe('Approach');
    expect(topic({ ...single, header: undefined }, 0)).toBe('Which architecture?');
    expect(topic({ question: '', options: [] }, 2)).toBe('Question 3');
  });
});

describe('answeredLine', () => {
  const part = (answers?: Record<string, string>): ToolPart => ({
    type: 'tool', id: 'x', name: 'AskUserQuestion', summary: '', status: 'ok',
    questions: [single, multi, secret],
    answers,
  });
  it('lists each header with the answer the agent recorded, secrets as dots', () => {
    expect(
      answeredLine(part({ 'Which architecture?': 'Hexagonal', 'Which parts?': 'API, Tests', 'Deploy key?': '******' })),
    ).toBe('Approach: Hexagonal · Scope: API, Tests · Key: ' + MASK);
  });
  it('skips a question the agent has no answer for', () => {
    expect(answeredLine(part({ 'Which parts?': 'Docs' }))).toBe('Scope: Docs');
  });
  it('is empty when there are no answers', () => {
    expect(answeredLine(part(undefined))).toBe('');
  });
});
