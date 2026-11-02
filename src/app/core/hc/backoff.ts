const BASE_MS = 500;
const MAX_MS = 10_000;

/** Wait before reconnect attempt `attempt` (0-based): 0.5 s, 1 s, 2 s, 4 s, 8 s, then 10 s. */
export function backoffDelay(attempt: number): number {
  return Math.min(BASE_MS * 2 ** Math.min(attempt, 10), MAX_MS);
}
