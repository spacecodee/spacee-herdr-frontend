import { windowLabel, type Pace, type WindowKind } from './quota-format';

export interface QuotaWindow {
  id: string;
  kind: WindowKind;
  /** Display name: "5-hour", "Weekly". */
  label: string;
  /** Epoch ms. */
  resetsAt: number | null;
  /** 0-100. */
  percentUsed: number;
  pace: Pace | null;
}

export interface ProviderQuota {
  provider: string;
  plan: string | null;
  /** `signed-out`: not set up or needs sign-in; `error`: quota-axi could not read it. */
  status: 'ok' | 'signed-out' | 'error';
  windows: QuotaWindow[];
}

export interface QuotaReport {
  generatedAt: number | null;
  providers: ProviderQuota[];
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const time = (v: unknown): number | null => {
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isNaN(ms) ? null : ms;
};

const KINDS: readonly WindowKind[] = ['session', 'weekly', 'monthly', 'model'];

function paceOf(v: unknown): Pace | null {
  const status = isObject(v) ? v['status'] : null;
  if (status === 'ahead') return 'ahead';
  if (status === 'behind') return 'under';
  if (status === 'on_pace') return 'on';
  return null;
}

function parseWindow(v: unknown): QuotaWindow | null {
  if (!isObject(v)) return null;
  const id = str(v['id']);
  const remaining = v['percentRemaining'];
  if (id === null || typeof remaining !== 'number' || Number.isNaN(remaining)) return null;
  const kind = KINDS.find((k) => k === v['kind']) ?? 'model';
  const label = windowLabel({ id, kind, label: str(v['label']) ?? id });
  return {
    id,
    kind,
    label,
    resetsAt: time(v['resetsAt']),
    percentUsed: Math.round(Math.min(100, Math.max(0, 100 - remaining))),
    pace: paceOf(v['pace']),
  };
}

function parseProvider(v: unknown): ProviderQuota | null {
  if (!isObject(v)) return null;
  const provider = str(v['provider']);
  if (provider === null) return null;
  const state = isObject(v['state']) ? v['state'] : {};
  const code = state['status'];
  const status = v['notSetUp'] === true || code === 'auth_required' ? 'signed-out' : code === 'error' || code === 'unavailable' ? 'error' : 'ok';
  const windows = Array.isArray(v['windows']) ? v['windows'].map(parseWindow).filter((w) => w !== null) : [];
  return { provider, plan: str(v['plan']), status, windows };
}

/** Reads `quota-axi --json`; only numbers, labels and dates are kept. Null when it is not a report. */
export function parseQuota(text: string): QuotaReport | null {
  // A login shell may print a banner around the JSON; keep what is between the outer braces.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let root: unknown;
  try {
    root = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    return null;
  }
  if (!isObject(root) || !Array.isArray(root['providers'])) return null;
  return {
    generatedAt: time(root['generatedAt']),
    providers: root['providers'].map(parseProvider).filter((p) => p !== null),
  };
}
