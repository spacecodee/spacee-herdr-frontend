/** Text always rides with the color; every pair is >= 4.5:1 (white on *-700/800, dark on light). */
const BADGE: Record<string, string> = {
  blocked: 'bg-red-700 text-white ring-2 ring-red-700/40',
  working: 'bg-blue-800 text-white',
  done: 'bg-green-800 text-white',
  error: 'bg-rose-950 text-white',
  idle: 'bg-zinc-200 text-zinc-900',
};

export function statusBadgeClass(state: string): string {
  return BADGE[state] ?? BADGE['idle'];
}
