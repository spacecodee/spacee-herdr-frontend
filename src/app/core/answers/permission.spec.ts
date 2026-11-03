import { describe, expect, it } from 'vitest';
import { inlineChoices, parsePermission, samePrompt } from './permission';
import type { DriverAgent } from './profiles';
import { CLAUDE_LIVE_SCREEN } from './testing/claude-live-screen';
import {
  QUESTION_SCREENS,
  claudeScreen,
  claudeTooShort,
  codexPatchScreen,
  codexScreen,
  opencodeScreen,
  piScreen,
} from './testing/permission-screens';

describe('parsePermission', () => {
  describe('claude', () => {
    it('reads three rows, the request and the cursor', () => {
      const p = parsePermission(claudeScreen(), 'claude');
      expect(p).toEqual({
        agent: 'claude',
        title: 'Do you want to proceed?',
        request: ['touch /tmp/x', 'Create a file'],
        choices: [
          { label: 'Yes', kind: 'approve' },
          { label: "Yes, and don't ask again for touch commands in /tmp", kind: 'approve-remember' },
          { label: 'No, and tell Claude what to do differently', kind: 'deny-text' },
        ],
        cursor: 0,
      });
    });

    it('reads two rows (no remember row) and a moved cursor', () => {
      const p = parsePermission(
        claudeScreen({ rows: ['Yes', 'No, and tell Claude what to do differently (esc)'], cursor: 1 }),
        'claude',
      );
      expect(p?.choices.map((c) => c.kind)).toEqual(['approve', 'deny-text']);
      expect(p?.cursor).toBe(1);
    });

    it('refuses the "too short" screen: Yes is disabled and the request is hidden', () => {
      expect(parsePermission(claudeTooShort(), 'claude')).toBeNull();
    });
  });

  describe('codex', () => {
    it('reads the exec variant, dropping environment and reason from the request', () => {
      const p = parsePermission(codexScreen(), 'codex');
      expect(p?.title).toBe('Would you like to run the following command?');
      expect(p?.request).toEqual(['$ touch /tmp/x']);
      expect(p?.choices).toEqual([
        { label: 'Yes, proceed', kind: 'approve' },
        { label: "Yes, and don't ask again for commands that start with `touch`", kind: 'approve-remember' },
        { label: 'No, and tell Codex what to do differently', kind: 'deny-text' },
      ]);
      expect(p?.cursor).toBe(0);
    });

    it('reads the patch variant with missing rows', () => {
      const p = parsePermission(codexPatchScreen(), 'codex');
      expect(p?.choices.map((c) => c.kind)).toEqual(['approve', 'deny-text']);
      expect(p?.request).toEqual(['src/app.ts (+3 -1)']);
    });

    it('classifies the permission, network and MCP labels', () => {
      const p = parsePermission(
        codexScreen({
          request: ['  Do you want to approve network access to "example.com"?'],
          rows: [
            'Yes, just this once (y)',
            'Yes, and allow this host for this conversation (a)',
            'Yes, and allow this host in the future (p)',
            'No, but continue without it',
            'Cancel',
          ],
        }),
        'codex',
      );
      expect(p?.choices.map((c) => c.kind)).toEqual(['approve', 'approve-remember', 'approve-remember', 'deny', 'deny']);
    });
  });

  describe('opencode', () => {
    it('reads three buttons in screen order; the first is focused by default', () => {
      const p = parsePermission(opencodeScreen(), 'opencode');
      expect(p).toEqual({
        agent: 'opencode',
        title: 'Permission required',
        request: ['Bash', '$ touch /tmp/x'],
        choices: [
          { label: 'Allow once', kind: 'approve' },
          { label: 'Always allow', kind: 'approve-remember' },
          { label: 'Reject', kind: 'deny' },
        ],
        cursor: 0,
      });
    });

    it('reads two buttons when there is nothing to save', () => {
      const p = parsePermission(opencodeScreen({ rows: ['Allow once', 'Reject'] }), 'opencode');
      expect(p?.choices.map((c) => c.kind)).toEqual(['approve', 'deny']);
    });
  });

  describe('pi', () => {
    it('reads Yes / No under an "Allow …?" title', () => {
      const p = parsePermission(piScreen(), 'pi');
      expect(p).toEqual({
        agent: 'pi',
        title: 'Allow guarded command?',
        request: ['rm -rf build'],
        choices: [
          { label: 'Yes', kind: 'approve' },
          { label: 'No', kind: 'deny' },
        ],
        cursor: 0,
      });
    });

    it('follows the cursor', () => {
      expect(parsePermission(piScreen({ cursor: 1 }), 'pi')?.cursor).toBe(1);
    });
  });

  describe('never a permission prompt', () => {
    for (const agent of ['claude', 'codex', 'opencode', 'pi'] as DriverAgent[]) {
      it(`${agent}: a question UI`, () => {
        expect(parsePermission(QUESTION_SCREENS[agent], agent)).toBeNull();
      });
      it(`${agent}: a shell`, () => {
        expect(parsePermission('$ ls\nREADME.md', agent)).toBeNull();
      });
    }

    it('another agent’s prompt', () => {
      expect(parsePermission(piScreen(), 'claude')).toBeNull();
      expect(parsePermission(codexScreen(), 'claude')).toBeNull();
      expect(parsePermission(claudeScreen(), 'codex')).toBeNull();
    });

    it('a row it cannot classify', () => {
      expect(parsePermission(claudeScreen({ rows: ['Yes', 'Maybe later', 'No, and tell Claude what to do differently'] }), 'claude')).toBeNull();
    });

    it('no approve row, or no deny row', () => {
      expect(parsePermission(claudeScreen({ rows: ['No, and tell Claude what to do differently'] }), 'claude')).toBeNull();
      expect(parsePermission(claudeScreen({ rows: ['Yes', "Yes, and don't ask again"] }), 'claude')).toBeNull();
    });

    it('no cursor, or two', () => {
      const none = claudeScreen().replace('❯', ' ');
      expect(parsePermission(none, 'claude')).toBeNull();
      const two = claudeScreen().replace('2. Yes, and', '❯ 2. Yes, and');
      expect(parsePermission(two, 'claude')).toBeNull();
    });
  });

  describe('claude, captured live (with the owner’s side panel)', () => {
    it('reads the real four rows, the command and the cursor, ignoring the panel', () => {
      expect(parsePermission(CLAUDE_LIVE_SCREEN, 'claude')).toEqual({
        agent: 'claude',
        title: 'Do you want to proceed?',
        request: ['touch segundo.txt'],
        choices: [
          { label: 'Yes', kind: 'approve' },
          { label: 'Yes, and always allow access to /tmp/x from this project', kind: 'approve-remember' },
          { label: 'Yes, and switch to auto mode · auto mode handles these prompts for you', kind: 'approve-remember', hidden: true },
          { label: 'No', kind: 'deny' },
        ],
        cursor: 0,
      });
    });

    it('offers the plain No as the denial, and never the auto-mode switch', () => {
      expect(inlineChoices(parsePermission(CLAUDE_LIVE_SCREEN, 'claude')!)).toEqual({
        approve: 0,
        approveLabel: 'Yes',
        deny: 3,
        denyLabel: 'No',
      });
    });

    it('joins a row that wraps onto a second line', () => {
      const wrapped = CLAUDE_LIVE_SCREEN.replace(
        '2. Yes, and always allow access to /tmp/x from this project',
        '2. Yes, and always allow access to\n      /tmp/x from this project',
      );
      const p = parsePermission(wrapped, 'claude');
      expect(p?.choices[1].label).toBe('Yes, and always allow access to /tmp/x from this project');
      expect(p?.choices).toHaveLength(4);
    });

    it('refuses a label or question that still holds panel junk', () => {
      const junk = CLAUDE_LIVE_SCREEN.replace('4. No', '4. No ││ session log').replace(/(4\. No) +│/, '$1 ││ session log');
      expect(parsePermission(junk.replace('Do you want to proceed?', 'Do you want to proceed? ─── x'), 'claude')).toBeNull();
    });
  });

  it('compares prompts by content', () => {
    const a = parsePermission(piScreen(), 'pi');
    expect(samePrompt(a, parsePermission(piScreen(), 'pi'))).toBe(true);
    expect(samePrompt(a, parsePermission(piScreen({ cursor: 1 }), 'pi'))).toBe(false);
    expect(samePrompt(a, null)).toBe(false);
  });

  describe('inlineChoices', () => {
    it('picks the first approve and the plain deny, with the agent’s own labels', () => {
      const p = parsePermission(opencodeScreen(), 'opencode')!;
      expect(inlineChoices(p)).toEqual({ approve: 0, approveLabel: 'Allow once', deny: 2, denyLabel: 'Reject' });
    });

    it('calls a "No, and tell …" row just "Deny": the text cannot be typed from the list', () => {
      const p = parsePermission(claudeScreen(), 'claude')!;
      expect(inlineChoices(p)).toEqual({ approve: 0, approveLabel: 'Yes', deny: 2, denyLabel: 'Deny' });
    });

    it('prefers a plain deny over deny-text', () => {
      const p = parsePermission(
        codexScreen({ rows: ['Yes, proceed (y)', 'No, but continue without it', 'No, and tell Codex what to do differently (esc)'] }),
        'codex',
      )!;
      expect(inlineChoices(p)?.deny).toBe(1);
    });
  });
});
