import { describe, expect, it } from 'vitest';
import type { Tuning } from './driver';
import { rewindClaude, rewindCodex, rewindOpencode, takeQueued } from './rewind-driver';
import { FakeClaude, FakeCodex, FakeOpencode } from './testing/fake-rewind';

const tuning: Tuning = { attempts: 4, intervalMs: 0, sleep: async () => undefined };

/** Keys that would be dangerous: a digit in a menu, Ctrl+C (Claude arms exit), Ctrl+X (opencode leader). */
const forbidden = (pressed: string[]): string[] => pressed.filter((k) => /^\d$/.test(k) || k === 'ctrl+c' || k === 'ctrl+x');

const PROMPTS = ['one', 'two', 'three', 'four'];

describe('rewindClaude', () => {
  it('goes back N prompts by counting Up, checks the row, and picks "Restore conversation"', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS });
    const result = await rewindClaude(tui, { text: 'two', back: 2 }, tuning);
    expect(result).toEqual({ ok: true, codeChanges: false });
    expect(tui.restored).toBe('Restore conversation');
    expect(tui.prompts).toEqual(['one']);
    expect(tui.composer).toEqual(['']);
    expect(tui.pressed.filter((k) => k === 'up')).toHaveLength(3);
    expect(forbidden(tui.pressed)).toEqual([]);
  });

  it('with "also restore files" picks "Restore code and conversation" when the confirm offers code rows', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, details: ['No code changes', 'notes.txt +1 -1', 'No code changes', 'No code changes'] });
    const result = await rewindClaude(tui, { text: 'two', back: 2, files: true }, tuning);
    expect(result).toEqual({ ok: true, codeChanges: true });
    expect(tui.restored).toBe('Restore code and conversation');
    expect(forbidden(tui.pressed)).toEqual([]);
  });

  it('keeps files when the toggle is off even though the confirm offers code rows', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, details: ['No code changes', 'notes.txt +1 -1', 'No code changes', 'No code changes'] });
    await rewindClaude(tui, { text: 'two', back: 2 }, tuning);
    expect(tui.restored).toBe('Restore conversation');
  });

  it('ignores the files toggle when the confirm says the code will be unchanged', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS });
    const result = await rewindClaude(tui, { text: 'four', back: 0, files: true }, tuning);
    expect(result).toEqual({ ok: true, codeChanges: false });
    expect(tui.restored).toBe('Restore conversation');
  });

  it('drops a ghost suggestion with Ctrl+U before opening the picker', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, ghost: 'cat notes.txt' });
    const result = await rewindClaude(tui, { text: 'four', back: 0 }, tuning);
    expect(result.ok).toBe(true);
    expect(tui.pressed.slice(0, 3)).toEqual(['ctrl+u', 'esc', 'esc']);
  });

  it('a peek reads the code line of the row and closes the picker without choosing', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, details: ['No code changes', 'notes.txt +1 -1', 'No code changes', 'No code changes'] });
    expect(await rewindClaude(tui, { text: 'two', back: 2, peek: true }, tuning)).toEqual({ ok: true, codeChanges: true });
    expect(tui.mode).toBe('idle');
    expect(tui.prompts).toEqual(PROMPTS);
    expect(tui.pressed).not.toContain('enter');
  });

  it('stops and closes the picker when the row is not the message', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS });
    const result = await rewindClaude(tui, { text: 'three', back: 2 }, tuning);
    expect(result).toEqual({ ok: false, reason: 'prompt' });
    expect(tui.mode).toBe('idle');
    expect(tui.prompts).toEqual(PROMPTS);
    expect(tui.pressed).not.toContain('enter');
  });

  it('accepts a prompt the picker cut with an ellipsis', async () => {
    const tui = new FakeClaude({ prompts: ['one', 'a long prompt that…', 'three'] });
    const result = await rewindClaude(tui, { text: 'a long prompt that does many things', back: 1 }, tuning);
    expect(result.ok).toBe(true);
  });

  it('refuses to go back further than the picker lists', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS });
    expect(await rewindClaude(tui, { text: 'one', back: 4 }, tuning)).toEqual({ ok: false, reason: 'prompt' });
    expect(tui.pressed).not.toContain('enter');
    expect(tui.restored).toBeNull();
    expect(tui.mode).toBe('idle');
  });

  it('presses nothing while the agent is working', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, working: true });
    expect(await rewindClaude(tui, { text: 'four', back: 0 }, tuning)).toEqual({ ok: false, reason: 'busy' });
    expect(tui.pressed).toEqual([]);
  });

  it('presses nothing while messages are queued', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, queued: ['later'] });
    expect(await rewindClaude(tui, { text: 'four', back: 0 }, tuning)).toEqual({ ok: false, reason: 'busy' });
    expect(tui.pressed).toEqual([]);
  });

  it('stops when the picker never opens', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS });
    tui.override = 'Compiling…\n$ ';
    expect((await rewindClaude(tui, { text: 'four', back: 0 }, tuning)).ok).toBe(false);
    expect(forbidden(tui.pressed)).toEqual([]);
  });

  it('stops when the confirm list lacks the wanted row, and backs out', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS });
    tui.confirmRows = ['Summarize from here', 'Never mind'];
    expect(await rewindClaude(tui, { text: 'four', back: 0 }, tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(tui.restored).toBeNull();
    expect(tui.mode).toBe('idle');
    expect(forbidden(tui.pressed)).toEqual([]);
  });

  it('stops without confirming when the cursor does not move to the wanted row', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, details: ['No code changes', 'No code changes', 'No code changes', 'notes.txt +1 -1'] });
    const press = tui.keys.bind(tui);
    tui.keys = async (keys) => {
      await press(keys);
      if (tui.mode === 'confirm') tui.confirmCursor = 0; // the list snaps back
    };
    expect(await rewindClaude(tui, { text: 'four', back: 0 }, tuning)).toEqual({ ok: false, reason: 'cursor' });
    expect(tui.restored).toBeNull();
    expect(tui.mode).toBe('idle');
  });
});

describe('rewindClaude at 52 columns', () => {
  const many = ['one', 'two', 'reply only with the word three, use no tools', 'four', 'five'];

  it('treats a ghost suggestion that survives Ctrl+U as an empty composer', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, ghost: 'reply only with the word four, use no tools', stickyGhost: true });
    expect(await rewindClaude(tui, { text: 'four', back: 0 }, tuning)).toEqual({ ok: true, codeChanges: false });
    expect(tui.pressed.filter((k) => k === 'ctrl+u').length).toBeLessThan(4);
    expect(forbidden(tui.pressed)).toEqual([]);
  });

  it('finds a prompt scrolled under "↑ N more", with prompts cut by …', async () => {
    const tui = new FakeClaude({ prompts: many, window: 3, truncate: 20, narrow: true });
    const result = await rewindClaude(tui, { text: 'reply only with the word three, use no tools', back: 2 }, tuning);
    expect(result).toEqual({ ok: true, codeChanges: false });
    expect(tui.prompts).toEqual(['one', 'two']);
    expect(tui.restored).toBe('Restore conversation');
  });

  it('refuses a scrolled row that is not the message', async () => {
    const tui = new FakeClaude({ prompts: many, window: 3, truncate: 20, narrow: true });
    expect(await rewindClaude(tui, { text: 'something else entirely', back: 2 }, tuning)).toEqual({ ok: false, reason: 'prompt' });
    expect(tui.restored).toBeNull();
    expect(tui.mode).toBe('idle');
  });

  it('reads the confirm list when its lines wrap, and ends in a bounded number of presses', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, narrow: true, ghost: 'x', stickyGhost: true });
    expect((await rewindClaude(tui, { text: 'four', back: 0 }, tuning)).ok).toBe(true);
    expect(tui.pressed.length).toBeLessThan(20);
  });

  it('never waits without end when the composer keeps text Ctrl+U cannot remove', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS });
    const press = tui.keys.bind(tui);
    tui.keys = async (keys) => {
      await press(keys);
      if (keys[0] === 'ctrl+u' && tui.restored) tui.composer = ['four']; // the prompt stays
    };
    const result = await rewindClaude(tui, { text: 'four', back: 0 }, tuning);
    expect(result).toEqual({ ok: false, reason: 'stalled' });
    expect(tui.pressed.filter((k) => k === 'ctrl+u').length).toBeLessThan(8);
  });
});

describe('rewindClaude with delivered queued messages (13 rows, 2 in view)', () => {
  const rows = ['one', 'two', 'three', 'run bash a', 'queued alpha', 'queued bravo', 'run bash b', 'queued charlie', 'queued delta', 'use the Bash tool', 'queued echo', 'queued foxtrot', '<task-notification>'];
  const details = rows.map((r) => (r.startsWith('queued') ? '⚠ No code restore' : 'No code changes'));

  it('counts them as rows: "three" is 11 Ups from (current)', async () => {
    const tui = new FakeClaude({ prompts: rows, details, window: 3, truncate: 30, narrow: true });
    const result = await rewindClaude(tui, { text: 'three', back: 10 }, tuning);
    expect(result).toEqual({ ok: true, codeChanges: false });
    expect(tui.pressed.filter((k) => k === 'up')).toHaveLength(11);
    expect(tui.prompts).toEqual(['one', 'two']);
  });

  it('a peek on one of them reports no code to restore', async () => {
    const tui = new FakeClaude({ prompts: rows, details, window: 3, narrow: true });
    expect(await rewindClaude(tui, { text: 'queued echo', back: 2, peek: true }, tuning)).toEqual({ ok: true, codeChanges: false });
    expect(tui.mode).toBe('idle');
  });
});

describe('rewindClaude when the picker opens without a "↑ N more" line (live check, 13 rows at 52x30)', () => {
  const rows = ['one', 'two', 'reply only with the word three, use no tools', 'run bash a', 'queued alpha', 'queued bravo', 'run bash b', 'queued charlie', 'queued delta', 'use the Bash tool', 'queued echo', 'queued foxtrot', '<task-notification>'];

  it('does not judge the range from the rows in view: it goes up and checks the row it lands on', async () => {
    const tui = new FakeClaude({ prompts: rows, window: 8, truncate: 40, narrow: true, hideMoreAtOpen: true, ghost: 'reply done', stickyGhost: true });
    const result = await rewindClaude(tui, { text: 'reply only with the word three, use no tools', back: 10 }, tuning);
    expect(result).toEqual({ ok: true, codeChanges: false });
    expect(tui.prompts).toEqual(['one', 'two']);
  });

  it('still stops on the wrong row', async () => {
    const tui = new FakeClaude({ prompts: rows, window: 8, truncate: 40, narrow: true, hideMoreAtOpen: true });
    expect(await rewindClaude(tui, { text: 'reply only with the word three, use no tools', back: 9 }, tuning)).toEqual({ ok: false, reason: 'prompt' });
    expect(tui.restored).toBeNull();
  });
});

describe('rewindClaude opening on the last prompt', () => {
  it('counts Ups from where the cursor is, never assuming (current)', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, openOnLast: true });
    expect(await rewindClaude(tui, { text: 'two', back: 2 }, tuning)).toEqual({ ok: true, codeChanges: false });
    expect(tui.pressed.filter((k) => k === 'up')).toHaveLength(2);
    expect(tui.prompts).toEqual(['one']);
  });

  it('the last prompt needs no Up at all', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, openOnLast: true });
    expect((await rewindClaude(tui, { text: 'four', back: 0 }, tuning)).ok).toBe(true);
    expect(tui.pressed).not.toContain('up');
  });

  it('still refuses a wrong row, and works scrolled', async () => {
    const wrong = new FakeClaude({ prompts: PROMPTS, openOnLast: true });
    expect(await rewindClaude(wrong, { text: 'three', back: 2 }, tuning)).toEqual({ ok: false, reason: 'prompt' });
    expect(wrong.restored).toBeNull();
    const rows = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
    const scrolled = new FakeClaude({ prompts: rows, window: 3, openOnLast: true, narrow: true });
    expect((await rewindClaude(scrolled, { text: 'three', back: 5 }, tuning)).ok).toBe(true);
    expect(scrolled.pressed.filter((k) => k === 'up')).toHaveLength(5);
  });
});

describe('takeQueued', () => {
  it('pulls every queued message back, clears the composer and types the others again', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, working: true, queued: ['A', 'B', 'C'] });
    const result = await takeQueued(tui, ['A', 'B', 'C'], 1, tuning);
    expect(result).toEqual({ ok: true });
    expect(tui.pressed[0]).toBe('up');
    expect(tui.pressed.filter((k) => k === 'ctrl+u')).toHaveLength(3);
    expect(tui.composer).toEqual(['']);
    expect(tui.typed).toEqual(['A', 'C']);
    expect(tui.queued).toEqual(['A', 'C']);
    expect(forbidden(tui.pressed)).toEqual([]);
  });

  it('with one queued message nothing is typed back', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, working: true, queued: ['A'] });
    expect(await takeQueued(tui, ['A'], 0, tuning)).toEqual({ ok: true });
    expect(tui.typed).toEqual([]);
  });

  it('never presses Up when the queue is gone', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS });
    expect(await takeQueued(tui, ['A'], 0, tuning)).toEqual({ ok: false, reason: 'queue' });
    expect(tui.pressed).toEqual([]);
    expect(tui.typed).toEqual([]);
  });

  it('never presses Up when the queue on screen is not the one shown', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, working: true, queued: ['X'] });
    expect(await takeQueued(tui, ['A'], 0, tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(tui.pressed).toEqual([]);
  });

  it('types nothing back when what came into the composer is not what was queued', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, working: true, queued: ['A', 'B'] });
    const press = tui.keys.bind(tui);
    tui.keys = async (keys) => {
      await press(keys);
      if (keys[0] === 'up') tui.composer = ['something else'];
    };
    expect(await takeQueued(tui, ['A', 'B'], 0, tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(tui.typed).toEqual([]);
    expect(tui.pressed).not.toContain('ctrl+u');
  });

  it('rejects a chosen index outside the queue', async () => {
    const tui = new FakeClaude({ prompts: PROMPTS, working: true, queued: ['A'] });
    expect(await takeQueued(tui, ['A'], 3, tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(tui.pressed).toEqual([]);
  });
});

describe('rewindCodex', () => {
  const prompts = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];

  it('opens the transcript browser, walks Left over the prompts and clears the composer', async () => {
    const tui = new FakeCodex({ prompts });
    expect(await rewindCodex(tui, { text: 'two', back: 1 }, tuning)).toEqual({ ok: true });
    expect(tui.rewoundTo).toBe('two');
    expect(tui.composer).toBe('');
    expect(tui.pressed.filter((k) => k === 'left')).toHaveLength(1);
    expect(forbidden(tui.pressed)).toEqual([]);
  });

  it('the last prompt needs no Left', async () => {
    const tui = new FakeCodex({ prompts });
    expect((await rewindCodex(tui, { text: 'three', back: 0 }, tuning)).ok).toBe(true);
    expect(tui.pressed).not.toContain('left');
  });

  it('drops a ghost suggestion first', async () => {
    const tui = new FakeCodex({ prompts, ghost: 'cat notes.txt' });
    expect((await rewindCodex(tui, { text: 'three', back: 0 }, tuning)).ok).toBe(true);
    expect(tui.pressed[0]).toBe('ctrl+u');
  });

  it('stops on "Failed to edit the selected prompt" and clears the composer', async () => {
    const tui = new FakeCodex({ prompts: [{ text: 'one' }, { text: 'two', steer: true }, { text: 'three' }] });
    expect(await rewindCodex(tui, { text: 'two', back: 1 }, tuning)).toEqual({ ok: false, reason: 'steer' });
    expect(tui.rewoundTo).toBeNull();
    expect(tui.composer).toBe('');
  });

  it('reports a wrong prompt when the one that landed is not the message', async () => {
    const tui = new FakeCodex({ prompts });
    tui.landsOn = 'something else';
    expect(await rewindCodex(tui, { text: 'two', back: 1 }, tuning)).toEqual({ ok: false, reason: 'prompt' });
    expect(tui.composer).toBe('');
  });

  it('presses nothing while the agent is working', async () => {
    const tui = new FakeCodex({ prompts, working: true });
    expect(await rewindCodex(tui, { text: 'three', back: 0 }, tuning)).toEqual({ ok: false, reason: 'busy' });
    expect(tui.pressed).toEqual([]);
  });

  it('stops when the browser never opens', async () => {
    const tui = new FakeCodex({ prompts });
    tui.override = '$ ';
    expect((await rewindCodex(tui, { text: 'three', back: 0 }, tuning)).ok).toBe(false);
    expect(tui.pressed).not.toContain('enter');
  });
});

describe('rewindCodex at 52 columns', () => {
  const prompts = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];

  it('matches the short browse footer and wrapped notices', async () => {
    const tui = new FakeCodex({ prompts });
    tui.narrow = true;
    expect(await rewindCodex(tui, { text: 'two', back: 1 }, tuning)).toEqual({ ok: true });
    expect(tui.rewoundTo).toBe('two');
    expect(tui.composer).toBe('');
  });
});

describe('rewindOpencode', () => {
  it('types /undo as raw keys once per message back, Ctrl+U before each', async () => {
    const tui = new FakeOpencode({ messages: 5 });
    expect(await rewindOpencode(tui, { text: 'x', back: 2 }, tuning)).toEqual({ ok: true });
    expect(tui.reverted).toBe(3);
    expect(tui.typed).toEqual([]);
    const line = tui.pressed.join(' ');
    expect(line.match(/ctrl\+u \/ u n d o enter/g)).toHaveLength(3);
    expect(tui.composer).toBe('');
    expect(forbidden(tui.pressed)).toEqual([]);
  });

  it('stops when a message does not get reverted', async () => {
    const tui = new FakeOpencode({ messages: 1 });
    expect(await rewindOpencode(tui, { text: 'x', back: 1 }, tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(tui.reverted).toBe(1);
  });

  it('presses nothing while the agent is working', async () => {
    const tui = new FakeOpencode({ messages: 2, working: true });
    expect(await rewindOpencode(tui, { text: 'x', back: 0 }, tuning)).toEqual({ ok: false, reason: 'busy' });
    expect(tui.pressed).toEqual([]);
  });
});
