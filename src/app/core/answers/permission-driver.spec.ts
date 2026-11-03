import { describe, expect, it } from 'vitest';
import type { Tuning } from './driver';
import { drivePermission } from './permission-driver';
import { parsePermission } from './permission';
import type { DriverAgent } from './profiles';
import { FakePermissionTui } from './testing/fake-permission';
import { CLAUDE_LIVE_SCREEN } from './testing/claude-live-screen';
import { claudeTooShort } from './testing/permission-screens';

const tuning: Tuning = { attempts: 5, intervalMs: 0, sleep: async () => undefined };
const AGENTS: DriverAgent[] = ['claude', 'codex', 'opencode', 'pi'];

async function run(tui: FakePermissionTui, choice: number) {
  const prompt = parsePermission(await tui.read(), tui.agent)!;
  const result = await drivePermission(tui, prompt, choice, tuning);
  return { result, prompt };
}

describe('drivePermission', () => {
  for (const agent of AGENTS) {
    describe(agent, () => {
      it('approves the first row with Enter and nothing else', async () => {
        const tui = new FakePermissionTui(agent);
        const { result } = await run(tui, 0);
        expect(result).toEqual({ ok: true });
        expect(tui.result).toBe(tui.rows[0]);
        expect(tui.sent).toEqual([['enter']]);
      });

      it('denies with Esc, without moving the cursor', async () => {
        const tui = new FakePermissionTui(agent);
        const deny = parsePermission(await tui.read(), agent)!.choices.findIndex((c) => c.kind === 'deny' || c.kind === 'deny-text');
        const { result } = await run(tui, deny);
        expect(result).toEqual({ ok: true });
        expect(tui.result).toBe('esc');
        expect(tui.sent).toEqual([['esc']]);
      });

      it('stops with nothing pressed when the screen is not the prompt', async () => {
        const tui = new FakePermissionTui(agent);
        const prompt = parsePermission(await tui.read(), agent)!;
        tui.override = 'Compiling…\n$ ';
        const result = await drivePermission(tui, prompt, 0, tuning);
        expect(result).toEqual({ ok: false, reason: 'screen' });
        expect(tui.sent).toEqual([]);
      });

      it('stops when the prompt on screen has other rows', async () => {
        if (agent === 'pi') return; // pi's rows are always Yes / No
        const tui = new FakePermissionTui(agent);
        const prompt = parsePermission(await tui.read(), agent)!;
        const other = new FakePermissionTui(agent, tui.rows.map((r, i) => (i === 0 ? `${r} twice` : r)));
        const result = await drivePermission(other, prompt, 0, tuning);
        expect(result).toEqual({ ok: false, reason: 'screen' });
        expect(other.sent).toEqual([]);
      });

      it('fails when Enter leaves the prompt on screen', async () => {
        const tui = new FakePermissionTui(agent);
        tui.ignoreEnter = true;
        const { result } = await run(tui, 0);
        expect(result).toEqual({ ok: false, reason: 'stalled' });
      });
    });
  }

  for (const agent of ['claude', 'codex'] as DriverAgent[]) {
    it(`${agent}: moves to a lower row by label, checking the cursor, then Enter`, async () => {
      const tui = new FakePermissionTui(agent);
      const { result } = await run(tui, 1);
      expect(result).toEqual({ ok: true });
      expect(tui.sent).toEqual([['down'], ['enter']]);
      expect(tui.result).toBe(tui.rows[1]);
    });

    it(`${agent}: starts from where the cursor is, going up`, async () => {
      const tui = new FakePermissionTui(agent);
      tui.cursor = 1;
      const { result } = await run(tui, 0);
      expect(result).toEqual({ ok: true });
      expect(tui.sent).toEqual([['up'], ['enter']]);
    });

    it(`${agent}: cursor mismatch after the move → fallback, Enter never pressed`, async () => {
      const tui = new FakePermissionTui(agent);
      tui.stuck = true;
      const { result } = await run(tui, 1);
      expect(result).toEqual({ ok: false, reason: 'cursor' });
      expect(tui.sent).toEqual([['down']]);
      expect(tui.open).toBe(true);
    });
  }

  it('opencode: "Always allow" is Right then Enter; "Reject" is Esc', async () => {
    const tui = new FakePermissionTui('opencode');
    expect(await run(tui, 1)).toMatchObject({ result: { ok: true } });
    expect(tui.sent).toEqual([['right'], ['enter']]);
    expect(tui.result).toBe('Always allow');
  });

  it('pi: only Yes and No', async () => {
    const tui = new FakePermissionTui('pi');
    expect(tui.rows).toEqual(['Yes', 'No']);
    expect((await run(tui, 0)).result).toEqual({ ok: true });
  });

  it('claude: the "too short" screen is never approved', async () => {
    const tui = new FakePermissionTui('claude');
    const prompt = parsePermission(await tui.read(), 'claude')!;
    tui.override = claudeTooShort();
    const result = await drivePermission(tui, prompt, 0, tuning);
    expect(result).toEqual({ ok: false, reason: 'screen' });
    expect(tui.sent).toEqual([]);
  });

  it('refuses a choice that is not in the prompt', async () => {
    const tui = new FakePermissionTui('claude');
    const prompt = parsePermission(await tui.read(), 'claude')!;
    expect(await drivePermission(tui, prompt, 7, tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(tui.sent).toEqual([]);
  });

  describe('the real Claude screen', () => {
    /** The live capture, with the ❯ following the keys. */
    class LiveTui extends FakePermissionTui {
      constructor() {
        super('claude', ['Yes', 'Yes, and always allow access to /tmp/x from this project', 'Yes, and switch to auto mode · auto mode handles these prompts for you', 'No']);
      }
      override render(): string {
        if (this.result !== null) return '$ ';
        return CLAUDE_LIVE_SCREEN.split('\n')
          .map((l) => l.replace(/^( ?)❯ (\d\.)/, '$1  $2'))
          .map((l) => (new RegExp(`^ {1,3}${this.cursor + 1}\\. `).test(l) ? l.replace(/^ ( {2})?/, ' ❯ ').replace(/^ ❯ {0,1}(\d)/, ' ❯ $1') : l))
          .join('\n');
      }
    }

    it('approves with Enter, remembers one row down, and denies the plain No with Esc', async () => {
      for (const [choice, keys] of [[0, [['enter']]], [1, [['down'], ['enter']]], [3, [['esc']]]] as const) {
        const tui = new LiveTui();
        const { result } = await run(tui, choice);
        expect(result).toEqual({ ok: true });
        expect(tui.sent).toEqual(keys.map((k) => [...k]));
      }
    });
  });
});
