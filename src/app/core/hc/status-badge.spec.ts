import { statusBadgeClass } from './status-badge';

describe('statusBadgeClass', () => {
  it('has a distinct style for each known state, blocked loudest', () => {
    const states = ['blocked', 'working', 'done', 'error', 'idle'];
    const classes = states.map(statusBadgeClass);
    expect(new Set(classes).size).toBe(states.length);
    expect(statusBadgeClass('blocked')).toContain('bg-red-700');
  });

  it('falls back to the neutral style for unknown states', () => {
    expect(statusBadgeClass('something-new')).toBe(statusBadgeClass('idle'));
  });
});
