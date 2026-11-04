import { describe, expect, it } from 'vitest';
import { flattenEnvelopes, parseEnvelopes, previewText } from './envelope';

describe('parseEnvelopes', () => {
  it('leaves plain text and real <tags> alone', () => {
    const text = 'List <dir> and <div>x</div> in <repo>';
    expect(parseEnvelopes(text)).toEqual([{ kind: 'text', text }]);
  });

  it('reads an hc message with its sender and multiline body', () => {
    expect(parseEnvelopes('<hc from="t16">line one\nline two</hc>')).toEqual([{ kind: 'agent', from: 't16', text: 'line one\nline two' }]);
  });

  it('parses an hc message nested in pasted content whose closing tag repeats the id', () => {
    const text = '<pasted_content id="0d4a">\n<hc from="t13">New task F18.</hc>\n</pasted_content id="0d4a">';
    expect(parseEnvelopes(text)).toEqual([{ kind: 'pasted', segments: [{ kind: 'agent', from: 't13', text: 'New task F18.' }] }]);
  });

  it('keeps the text before and after an envelope', () => {
    expect(parseEnvelopes('before <hc from="t1">hi</hc> after')).toEqual([
      { kind: 'text', text: 'before' },
      { kind: 'agent', from: 't1', text: 'hi' },
      { kind: 'text', text: 'after' },
    ]);
  });

  it('turns a task notification into its summary, or its status', () => {
    const a = '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>Background command "pnpm test" completed</summary>\n</task-notification>';
    expect(parseEnvelopes(a)).toEqual([{ kind: 'notification', summary: 'Background command "pnpm test" completed' }]);
    expect(parseEnvelopes('<task-notification><status>failed</status></task-notification>')).toEqual([{ kind: 'notification', summary: 'failed' }]);
  });

  it('hides system reminders and hook output', () => {
    expect(parseEnvelopes('<system-reminder>be nice</system-reminder>')).toEqual([{ kind: 'hidden' }]);
    expect(parseEnvelopes('<user-prompt-submit-hook>ctx</user-prompt-submit-hook>\nreal question')).toEqual([{ kind: 'hidden' }, { kind: 'text', text: 'real question' }]);
  });

  it('recognises the summary after a compaction', () => {
    const a = 'This session is being continued from a previous conversation that ran out of context.\nSummary: ...';
    expect(parseEnvelopes(a)).toEqual([{ kind: 'compaction', text: a }]);
    const b = '<tools-used-before-summary>Read, Edit</tools-used-before-summary>';
    expect(parseEnvelopes(b)).toEqual([{ kind: 'compaction', text: b }]);
  });

  it('keeps unbalanced or unknown tags as plain text', () => {
    for (const text of ['<hc from="t1">never closed', '</hc> stray', '<pasted_content id="1">open', '<system-reminder>open', '<hc>no sender</hc>']) {
      expect(parseEnvelopes(text)).toEqual([{ kind: 'text', text }]);
    }
  });

  it('merges a pasted block inside pasted content', () => {
    const text = '<pasted_content id="1"><pasted_content id="2">a</pasted_content id="2"> b</pasted_content id="1">';
    expect(parseEnvelopes(text)).toEqual([{ kind: 'pasted', segments: [{ kind: 'text', text: 'a' }, { kind: 'text', text: 'b' }] }]);
  });
});

describe('flattenEnvelopes', () => {
  it('numbers bubbles, marks pasted ones, and drops hidden segments', () => {
    const items = flattenEnvelopes(parseEnvelopes('<system-reminder>x</system-reminder><pasted_content id="1"><hc from="t2">go</hc></pasted_content id="1">ok'));
    expect(items).toEqual([
      { kind: 'bubble', text: 'go', from: 't2', pasted: true },
      { kind: 'bubble', text: 'ok', from: undefined, pasted: false },
    ]);
  });

  it('is empty for a hidden-only message', () => {
    expect(flattenEnvelopes(parseEnvelopes('<system-reminder>x</system-reminder>'))).toEqual([]);
  });
});

describe('previewText', () => {
  it('shows body text, never tags', () => {
    expect(previewText('<pasted_content id="1"><hc from="t13">New task F18.\nRead it.</hc></pasted_content id="1">')).toBe('New task F18. Read it.');
    expect(previewText('<task-notification><summary>Done</summary></task-notification>')).toBe('Done');
    expect(previewText('<system-reminder>x</system-reminder>')).toBe('');
    expect(previewText('This session is being continued from a previous conversation')).toBe('Conversation summarized');
    expect(previewText('plain <dir> text')).toBe('plain <dir> text');
  });
});
