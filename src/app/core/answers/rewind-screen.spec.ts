import { describe, expect, it } from 'vitest';
import {
  claudeComposer,
  claudeConfirm,
  claudeEmpty,
  claudeHasQueue,
  claudePicker,
  codexBrowsing,
  codexComposerHolds,
  codexHint,
  codexReverted,
  hasCodeChanges,
  codexEmpty,
  opencodeReverted,
  sameMessage,
} from './rewind-screen';

/** Screens as `terminal.read` showed them (bridge R4 findings §5). */
const RULE = '─'.repeat(60);

const CLAUDE_QUEUE = `❯ queued A: reply alpha
❯ queued B: reply bravo
  ctrl+enter to send now
✢ Combobulating… (9s · ↓ 127 tokens)
${RULE}
❯ Press up to edit queued messages
${RULE}
  ⏵⏵ bypass permissions on (shift+tab to cycle) · esc to interrupt`;

const CLAUDE_PICKED_BACK = `${RULE}
❯ queued A: reply alpha
  queued B: reply bravo
${RULE}
  ctrl+g to edit in Vi`;

const CLAUDE_PICKER = `   Rewind
   Restore the code and/or conversation to the point before…
     reply with the word one
     No code changes
     reply with the word two
     notes.txt +1 -1
   ❯ reply with the word three
     No code changes
     (current)
   Enter to continue · Esc to cancel`;

const CLAUDE_CONFIRM_CODE = `   Confirm you want to restore to the point before you sent this message:
   This message and everything after it will be removed.
   The code will be restored +1 -1 in notes.txt.
   ❯ 1. Restore code and conversation
     2. Restore conversation
     3. Restore code
     4. Summarize from here
   ↓ 5. Summarize up to here
   ⚠ Restored files go back whole, losing later changes by anyone. Bash changes to other files are not undone.`;

describe('Claude screens', () => {
  it('reads the composer between its rules and the queue hint', () => {
    expect(claudeComposer(CLAUDE_QUEUE)).toEqual(['Press up to edit queued messages']);
    expect(claudeHasQueue(claudeComposer(CLAUDE_QUEUE))).toBe(true);
    expect(claudeEmpty(claudeComposer(CLAUDE_QUEUE))).toBe(false);
  });

  it('reads one line per pulled-back message', () => {
    expect(claudeComposer(CLAUDE_PICKED_BACK)).toEqual(['queued A: reply alpha', 'queued B: reply bravo']);
  });

  it('empty means nothing after the glyph, or the fresh-session placeholder', () => {
    expect(claudeEmpty(claudeComposer(`${RULE}\n❯ \n${RULE}\n  footer`))).toBe(true);
    expect(claudeEmpty(claudeComposer(`${RULE}\n❯ Try "edit <filepath> to..."\n${RULE}\n  footer`))).toBe(true);
    expect(claudeEmpty(claudeComposer(`${RULE}\n❯ cat notes.txt\n${RULE}\n  footer`))).toBe(false);
    expect(claudeEmpty(claudeComposer('$ '))).toBe(false);
  });

  it('parses the picker: prompts with their code line, the marker, and (current)', () => {
    expect(claudePicker(CLAUDE_PICKER)).toEqual({
      entries: [
        { text: 'reply with the word one', detail: 'No code changes' },
        { text: 'reply with the word two', detail: 'notes.txt +1 -1' },
        { text: 'reply with the word three', detail: 'No code changes' },
      ],
      cursor: 2,
      hidden: 0,
      below: 0,
      fromEnd: 1,
    });
    expect(claudePicker(CLAUDE_PICKER.replace('   ❯ reply', '     reply').replace('     (current)', '   ❯ (current)'))?.cursor).toBe(3);
  });

  it('is not the picker without its header, footer or (current) row', () => {
    expect(claudePicker('$ ls')).toBeNull();
    expect(claudePicker(CLAUDE_PICKER.replace('     (current)\n', ''))).toBeNull();
  });

  it('parses the confirm list with and without code rows', () => {
    const withCode = claudeConfirm(CLAUDE_CONFIRM_CODE)!;
    expect(withCode.codeUnchanged).toBe(false);
    expect(withCode.rows.map((r) => r.text)).toEqual([
      'Restore code and conversation',
      'Restore conversation',
      'Restore code',
      'Summarize from here',
    ]);
    expect(withCode.rows[0].cursor).toBe(true);
    const plain = claudeConfirm(
      CLAUDE_CONFIRM_CODE.replace('The code will be restored +1 -1 in notes.txt.', 'The code will be unchanged.'),
    )!;
    expect(plain.codeUnchanged).toBe(true);
    expect(claudeConfirm(CLAUDE_PICKER)).toBeNull();
  });

  it('matches a message against a row cut with an ellipsis', () => {
    expect(sameMessage('add a test for the  parser', 'add a test for the parser')).toBe(true);
    expect(sameMessage('add a test for…', 'add a test for the parser')).toBe(true);
    expect(sameMessage('add a test', 'add a test for the parser')).toBe(false);
  });
});

describe('Codex and opencode screens', () => {
  it('knows an empty Codex composer from one holding text', () => {
    expect(codexEmpty('• Done\n› Ask Codex to do anything\n  ← for agents · ? for shortcuts')).toBe(true);
    expect(codexEmpty('• Done\n› \n  ← for agents')).toBe(true);
    expect(codexEmpty('• Done\n› cat notes.txt\n  tab to queue message')).toBe(false);
    expect(codexComposerHolds('• Conversation reverted to this point.\n› two\n  tab to queue message', 'two')).toBe(true);
    expect(codexComposerHolds('› three\n  tab to queue message', 'two')).toBe(false);
  });

  it('reads the reverted count from opencode', () => {
    expect(opencodeReverted('1 message reverted\nctrl+x r or /redo to restore')).toBe(1);
    expect(opencodeReverted('2 messages reverted')).toBe(2);
    expect(opencodeReverted('Build · Gemini')).toBeNull();
  });
});

/** 52-column screens from the live check (t13): picker scrolled and cut, ghost suggestion, short Codex footer. */
const CLAUDE_52_PICKER = `   Rewind
   Restore the code and/or conversation to the
   point before…
  ↑ 2 more
     reply only with the word two, use no tools
     No code changes
   ❯ reply only with the word three, use no to…
     No code changes
     reply only with the word four, use no tools
     No code changes
     (current)
   Enter to continue · Esc to cancel`;

describe('52-column screens', () => {
  it('reads a scrolled picker with a cut prompt and a wrapped explanation', () => {
    const p = claudePicker(CLAUDE_52_PICKER)!;
    expect(p.hidden).toBe(2);
    expect(p.cursor).toBe(1);
    expect(p.entries[p.cursor].text).toBe('reply only with the word three, use no to…');
    expect(sameMessage(p.entries[p.cursor].text, 'reply only with the word three, use no tools')).toBe(true);
    expect(sameMessage(p.entries[p.cursor].text, 'reply only with the word four, use no tools')).toBe(false);
  });

  it('a ghost suggestion on the composer line is read as text, so the driver must not rely on it being empty', () => {
    const screen = `${RULE}\n❯ reply only with the word four, use no tools\n${RULE}\n  footer`;
    expect(claudeEmpty(claudeComposer(screen))).toBe(false);
  });

  it('reads the wrapped confirm lines', () => {
    const c = claudeConfirm(`   Confirm you want to restore to the point\n   before you sent this message:\n   The code will be unchanged.\n   ❯ 1. Restore conversation\n     2. Never mind`)!;
    expect(c.codeUnchanged).toBe(true);
  });

  it('finds the Codex hint, the short browse footer and wrapped notices', () => {
    expect(codexHint('› \n  esc again to edit\n  previous message')).toBe(true);
    expect(codexBrowsing('Browsing · ↑↓/jk ←→/hl · ↵ rewind · esc')).toBe(true);
    expect(codexBrowsing('$ ls')).toBe(false);
    expect(codexReverted('• Conversation reverted to\n  this point. File changes are\n  unchanged.')).toBe('ok');
    expect(codexReverted('■ Failed to edit the selected\n  prompt: the selected prompt is a steer')).toBe('steer');
  });
});

/** Raw screen from the live check at Up x8 (13 prompt rows; mid-turn delivered queued messages carry `⚠ No code restore`). */
const CLAUDE_52_DELIVERED = `   Rewind
   Restore the code and/or conversation to the
   point before…
  ↑ 6 more
 ❯ run this bash command and then reply done…
   No code changes
   queued charlie: reply charlie
   ⚠ No code restore
  ↓ 5 more
   Enter to continue · Esc to cancel`;

describe('delivered queued messages in the picker', () => {
  it('reads "⚠ No code restore" as the row\'s code line, not as prompt text', () => {
    const p = claudePicker(CLAUDE_52_DELIVERED)!;
    expect(p.entries).toEqual([
      { text: 'run this bash command and then reply done…', detail: 'No code changes' },
      { text: 'queued charlie: reply charlie', detail: '⚠ No code restore' },
    ]);
    expect(p.cursor).toBe(0);
    expect(p.hidden).toBe(11);
    expect(p.entries.length + p.hidden).toBe(13);
    expect(p.below).toBe(5);
  });

  it('only file edits count as code to restore', () => {
    expect(hasCodeChanges('notes.txt +1 -1')).toBe(true);
    expect(hasCodeChanges('⚠ No code restore')).toBe(false);
    expect(hasCodeChanges('No code changes')).toBe(false);
  });
});

/** t13's live screens: 12 picker rows, cursor stepping up from foxtrot. */
describe('the 12-row picker (live)', () => {
  const OPEN = `   Rewind
   Restore the code and/or conversation to the
   point before…
  ↑ 11 more
     queued foxtrot: reply foxtrot
     No code changes
 ❯ (current)
   Enter to continue · Esc to cancel`;
  const THREE_UPS = `   Rewind
   Restore the code and/or conversation to the
   point before…
  ↑ 8 more
 ❯ queued delta: reply delta
   No code changes
   use the Bash tool in the foreground (run_…
   No code changes
  ↓ 3 more
   Enter to continue · Esc to cancel`;

  it('opens on (current): 11 above + foxtrot, one Up from the end', () => {
    const p = claudePicker(OPEN)!;
    expect(p).toMatchObject({ hidden: 11, below: 0, cursor: 1, fromEnd: 0 });
    expect(p.entries.length + p.hidden).toBe(12);
  });

  it('scrolled: current is among the rows below, so delta is 4 from the end', () => {
    const p = claudePicker(THREE_UPS)!;
    expect(p).toMatchObject({ cursor: 0, below: 3, fromEnd: 4 });
  });

  it('opens on the last prompt: 1 from the end', () => {
    expect(claudePicker(OPEN.replace(' ❯ (current)', '   (current)').replace('     queued foxtrot', ' ❯ queued foxtrot'))).toMatchObject({ cursor: 0, fromEnd: 1 });
  });
});
