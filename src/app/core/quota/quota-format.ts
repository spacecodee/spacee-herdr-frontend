export type Tier = 'ink' | 'amber' | 'low' | 'blocked';
export type WindowKind = 'session' | 'weekly' | 'monthly' | 'model';
export type Pace = 'ahead' | 'under' | 'on';

/** Ink under 60% used, amber from 60, "Running low" from 80, blocked red from 92. */
export function tierOf(used: number): Tier {
  if (used >= 92) return 'blocked';
  if (used >= 80) return 'low';
  if (used >= 60) return 'amber';
  return 'ink';
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The row name: "5-hour", "Weekly", "Fable weekly"; any other window keeps the provider's label. */
export function windowLabel(w: { id: string; kind: WindowKind; label: string }): string {
  if (w.id === 'five_hour') return '5-hour';
  if (w.id === 'seven_day' || w.id === 'weekly') return 'Weekly';
  if (w.kind === 'model') return w.label.replace(/\bweek$/i, 'weekly');
  if (w.kind === 'monthly') return `${capitalize(w.label)} monthly`;
  return w.label;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const clock = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** "Resets in 2h 14m" under 24 h, else "Resets Fri 23:00" in the viewer's time zone. */
export function resetText(resetsAt: number | null, now: number): string {
  if (resetsAt === null) return '';
  const left = resetsAt - now;
  if (left <= 0) return 'Resetting now';
  if (left < MINUTE) return 'Resets in under a minute';
  if (left < DAY) {
    const h = Math.floor(left / HOUR);
    const m = Math.floor((left % HOUR) / MINUTE);
    return `Resets in ${h > 0 ? `${h}h ` : ''}${m > 0 || h === 0 ? `${m}m` : ''}`.trim();
  }
  const parts = Object.fromEntries(clock.formatToParts(resetsAt).map((p) => [p.type, p.value]));
  return `Resets ${parts['weekday']} ${parts['hour']}:${parts['minute']}`;
}

export function paceText(pace: Pace | null): string {
  if (pace === 'ahead') return 'Ahead of pace';
  if (pace === 'under') return 'Under pace';
  if (pace === 'on') return 'On pace';
  return '';
}

const SPAN: Partial<Record<WindowKind, number>> = { session: 5 * HOUR, weekly: 7 * DAY, model: 7 * DAY };

/** How much of the window has passed (0-1), from its reset time; null when the length is unknown. */
export function elapsedShare(kind: WindowKind, resetsAt: number | null, now: number): number | null {
  const span = SPAN[kind];
  if (span === undefined || resetsAt === null) return null;
  return Math.min(1, Math.max(0, 1 - (resetsAt - now) / span));
}

/** "Updated 3 min ago". */
export function updatedText(at: number | null, now: number): string {
  if (at === null) return '';
  const min = Math.floor((now - at) / MINUTE);
  if (min < 1) return 'Updated just now';
  if (min < 60) return `Updated ${min} min ago`;
  return `Updated ${Math.floor(min / 60)} h ago`;
}
