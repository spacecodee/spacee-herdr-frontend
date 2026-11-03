import { elapsedShare, paceText, resetText, tierOf, windowLabel } from './quota-format';

const NOW = Date.parse('2026-11-03T12:00:00');

describe('tierOf', () => {
  it('ink under 60, amber 60-79, low 80-91, blocked from 92', () => {
    expect(tierOf(0)).toBe('ink');
    expect(tierOf(59)).toBe('ink');
    expect(tierOf(60)).toBe('amber');
    expect(tierOf(79)).toBe('amber');
    expect(tierOf(80)).toBe('low');
    expect(tierOf(91)).toBe('low');
    expect(tierOf(92)).toBe('blocked');
    expect(tierOf(100)).toBe('blocked');
  });
});

describe('windowLabel', () => {
  it('names session, weekly and model windows', () => {
    expect(windowLabel({ id: 'five_hour', kind: 'session', label: 'session' })).toBe('5-hour');
    expect(windowLabel({ id: 'seven_day', kind: 'weekly', label: 'week' })).toBe('Weekly');
    expect(windowLabel({ id: 'model:fable', kind: 'model', label: 'Fable week' })).toBe('Fable weekly');
    expect(windowLabel({ id: 'chat', kind: 'monthly', label: 'chat' })).toBe('Chat monthly');
    expect(windowLabel({ id: 'gemini_5h', kind: 'session', label: 'x' })).toBe('x');
  });
});

describe('resetText', () => {
  it('relative under 24 h, weekday and time after, nothing without a date', () => {
    expect(resetText(NOW + (2 * 60 + 14) * 60_000, NOW)).toBe('Resets in 2h 14m');
    expect(resetText(NOW + 5 * 60_000, NOW)).toBe('Resets in 5m');
    expect(resetText(NOW + 20_000, NOW)).toBe('Resets in under a minute');
    expect(resetText(NOW + 3 * 3_600_000 * 24, NOW)).toMatch(/^Resets \w{3} \d{2}:\d{2}$/);
    expect(resetText(NOW - 1, NOW)).toBe('Resetting now');
    expect(resetText(null, NOW)).toBe('');
  });
});

describe('paceText and elapsedShare', () => {
  it('words the pace', () => {
    expect(paceText('ahead')).toBe('Ahead of pace');
    expect(paceText('under')).toBe('Under pace');
    expect(paceText('on')).toBe('On pace');
    expect(paceText(null)).toBe('');
  });

  it('elapsed share of the window from the reset time', () => {
    const h = 3_600_000;
    expect(elapsedShare('session', NOW + 1 * h, NOW)).toBeCloseTo(0.8);
    expect(elapsedShare('weekly', NOW + 84 * h, NOW)).toBeCloseTo(0.5);
    expect(elapsedShare('monthly', NOW + h, NOW)).toBeNull();
    expect(elapsedShare('session', null, NOW)).toBeNull();
    expect(elapsedShare('session', NOW + 9 * h, NOW)).toBe(0);
  });
});
