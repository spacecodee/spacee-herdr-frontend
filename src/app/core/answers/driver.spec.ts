import { describe, expect, it } from 'vitest';
import type { AgentQuestion } from '../chat/types';
import { drive, type Answer, type Tuning } from './driver';
import type { DriverAgent } from './profiles';
import { FakeTui } from './testing/fake-tui';

const tuning: Tuning = { attempts: 6, intervalMs: 0, sleep: async () => undefined };

const color: AgentQuestion = {
  question: 'Which color?',
  header: 'Color',
  other: true,
  options: [
    { label: 'Rojo', description: 'Opción de prueba A.' },
    { label: 'Verde', description: 'Opción de prueba B.' },
    { label: 'Azul', description: 'Opción de prueba C.' },
  ],
};
const fruits: AgentQuestion = {
  question: 'Which fruits?',
  header: 'Frutas',
  multiSelect: true,
  options: [
    { label: 'Mango', description: 'Opción 1.' },
    { label: 'Piña', description: 'Opción 2.' },
    { label: 'Uva', description: 'Opción 3.' },
  ],
};
const freeText: AgentQuestion = { question: 'Name it', header: 'Name', other: true, options: [] };

const AGENTS: DriverAgent[] = ['claude', 'pi', 'codex', 'opencode'];

function run(agent: DriverAgent, questions: AgentQuestion[], answers: Answer[], tui = new FakeTui(agent, questions)) {
  return drive(tui, agent, questions, answers, tuning).then((result) => ({ result, tui }));
}

describe('answer driver', () => {
  for (const agent of AGENTS) {
    describe(agent, () => {
      it('answers a single question by option', async () => {
        const { result, tui } = await run(agent, [color], [{ picks: [1] }]);
        expect(result).toEqual({ ok: true });
        expect(tui.recorded).toEqual([{ picks: [1] }]);
        expect(tui.done).toBe(true);
      });

      it('types an "Other" answer', async () => {
        const { result, tui } = await run(agent, [color], [{ picks: [], text: 'teal' }]);
        expect(result).toEqual({ ok: true });
        expect(tui.recorded).toEqual([{ picks: [], text: 'teal' }]);
      });

      it('answers two questions in order', async () => {
        const second = { ...color, question: 'Which size?', header: 'Size', options: [{ label: 'S' }, { label: 'M' }, { label: 'L' }] };
        const { result, tui } = await run(agent, [color, second], [{ picks: [2] }, { picks: [0] }]);
        expect(result).toEqual({ ok: true });
        expect(tui.recorded).toEqual([{ picks: [2] }, { picks: [0] }]);
        expect(tui.done).toBe(true);
      });

      it('stops with nothing pressed when the screen is not this question', async () => {
        const tui = new FakeTui(agent, [color]);
        tui.override = 'Compiling…\n$ ';
        const { result } = await run(agent, [color], [{ picks: [0] }], tui);
        expect(result).toEqual({ ok: false, reason: 'screen' });
        expect(tui.sent).toEqual([]);
        expect(tui.typed).toEqual([]);
      });

      it('stops when the options on screen differ from the part', async () => {
        const other = { ...color, options: [{ label: 'Rojo' }, { label: 'Otro' }, { label: 'Azul' }] };
        const tui = new FakeTui(agent, [other]);
        const { result } = await run(agent, [color], [{ picks: [1] }], tui);
        expect(result).toEqual({ ok: false, reason: 'screen' });
        expect(tui.sent).toEqual([]);
      });

      it('survives a screen that lags behind the keys', async () => {
        const tui = new FakeTui(agent, [color]);
        tui.lag = 2;
        const { result } = await run(agent, [color], [{ picks: [2] }], tui);
        expect(result).toEqual({ ok: true });
        expect(tui.recorded).toEqual([{ picks: [2] }]);
      });
    });
  }

  for (const agent of ['claude', 'pi', 'opencode'] as const) {
    it(`${agent}: toggles a multi-select and confirms it`, async () => {
      const { result, tui } = await run(agent, [fruits], [{ picks: [0, 2] }]);
      expect(result).toEqual({ ok: true });
      expect(tui.recorded).toEqual([{ picks: [0, 2] }]);
    });
  }

  it('claude: a multi-select then a single question ends on the Submit step', async () => {
    const { result, tui } = await run('claude', [fruits, color], [{ picks: [1] }, { picks: [0] }]);
    expect(result).toEqual({ ok: true });
    expect(tui.recorded).toEqual([{ picks: [1] }, { picks: [0] }]);
    expect(tui.done).toBe(true);
  });

  it('claude: moves with arrows and never uses a digit', async () => {
    const { tui } = await run('claude', [color], [{ picks: [2] }]);
    expect(tui.sent.flat().some((k) => /^\d$/.test(k))).toBe(false);
    expect(tui.sent).toEqual([['down', 'down'], ['enter']]);
  });

  it('pi: has no digits either, and does not wrap', async () => {
    const { tui } = await run('pi', [color], [{ picks: [1] }]);
    expect(tui.sent).toEqual([['down'], ['enter']]);
  });

  it('pi: toggles then types the free text that commits the toggles', async () => {
    const { result, tui } = await run('pi', [{ ...fruits, other: true }], [{ picks: [1], text: 'kiwi' }]);
    expect(result).toEqual({ ok: true });
    expect(tui.recorded).toEqual([{ picks: [1], text: 'kiwi' }]);
  });

  for (const agent of ['codex', 'opencode'] as const) {
    it(`${agent}: chooses by digit, verified in source`, async () => {
      const { tui } = await run(agent, [color], [{ picks: [2] }]);
      expect(tui.sent).toEqual([['3']]);
    });

    it(`${agent}: answers a free-text-only question`, async () => {
      const { result, tui } = await run(agent, [freeText], [{ picks: [], text: 'my name' }]);
      expect(result).toEqual({ ok: true });
      expect(tui.recorded).toEqual([{ picks: [], text: 'my name' }]);
      expect(tui.sent).toEqual([]);
    });
  }

  it('codex: "Other" goes down to the last row and presses Tab, never a digit', async () => {
    const { tui } = await run('codex', [color], [{ picks: [], text: 'teal' }]);
    expect(tui.sent).toEqual([['down', 'down', 'down'], ['tab']]);
  });

  it('claude and pi cannot answer a free-text-only question: the screen has no such shape', async () => {
    for (const agent of ['claude', 'pi'] as const) {
      const tui = new FakeTui(agent, [color]);
      const { result } = await run(agent, [freeText], [{ picks: [], text: 'x' }], tui);
      expect(result).toEqual({ ok: false, reason: 'screen' });
      expect(tui.typed).toEqual([]);
    }
  });

  it('rejects answers that do not fit the question before pressing anything', async () => {
    const tui = new FakeTui('claude', [color]);
    expect(await drive(tui, 'claude', [color], [{ picks: [7] }], tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(await drive(tui, 'claude', [color], [{ picks: [0, 1] }], tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(await drive(tui, 'claude', [color], [{ picks: [] }], tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(await drive(tui, 'claude', [color], [], tuning)).toEqual({ ok: false, reason: 'screen' });
    expect(tui.sent).toEqual([]);
  });

  it('stops when a toggle does not show up on screen', async () => {
    const tui = new FakeTui('claude', [fruits]);
    const press = tui.keys.bind(tui);
    tui.keys = async (keys) => (keys.includes('space') ? undefined : press(keys));
    const { result } = await run('claude', [fruits], [{ picks: [0] }], tui);
    expect(result).toEqual({ ok: false, reason: 'checkbox' });
    expect(tui.recorded).toEqual([]);
  });

  it('stops when the key did nothing, and reports a transport error as one', async () => {
    const dead = new FakeTui('claude', [color]);
    dead.keys = async () => undefined;
    expect((await run('claude', [color], [{ picks: [1] }], dead)).result).toEqual({ ok: false, reason: 'cursor' });
    const broken = new FakeTui('codex', [color]);
    broken.keys = async () => {
      throw new Error('socket closed');
    };
    expect((await run('codex', [color], [{ picks: [0] }], broken)).result).toEqual({ ok: false, reason: 'transport' });
  });
});
