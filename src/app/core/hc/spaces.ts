import type { Terminal } from './types';

/** Name of the document where the desktop app keeps its layout. */
export const LAYOUT_DOC = 'herdr-app';

export interface SpaceTab {
  id: string;
  name: string;
  /** Terminal addresses in the tab, in layout order. */
  addresses: string[];
}

export interface Space {
  id: string;
  name: string;
  tabs: SpaceTab[];
}

export interface ArrangedTab {
  id: string;
  name: string;
  terminals: Terminal[];
}

export interface ArrangedSpace {
  id: string;
  name: string;
  tabs: ArrangedTab[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Collects every `content.terminal` below a layout node, whatever the node types are. */
function collect(node: unknown, into: string[]): void {
  if (!isRecord(node)) return;
  const content = node['content'];
  if (isRecord(content) && typeof content['terminal'] === 'string') {
    if (!into.includes(content['terminal'])) into.push(content['terminal']);
  }
  const children = node['children'];
  if (Array.isArray(children)) for (const child of children) collect(child, into);
}

/**
 * Reads the `doc.get` result of the `herdr-app` document: `{ value: { spaces }, version }`.
 * Defensive: returns whatever part is valid and never throws.
 */
export function parseSpaces(result: unknown): Space[] {
  const spaces = isRecord(result) && isRecord(result['value']) ? result['value']['spaces'] : null;
  if (!Array.isArray(spaces)) return [];
  const out: Space[] = [];
  for (const s of spaces) {
    if (!isRecord(s) || typeof s['id'] !== 'string') continue;
    const tabs: SpaceTab[] = [];
    for (const t of Array.isArray(s['tabs']) ? s['tabs'] : []) {
      if (!isRecord(t) || typeof t['id'] !== 'string') continue;
      const addresses: string[] = [];
      collect(t['root'], addresses);
      tabs.push({ id: t['id'], name: typeof t['name'] === 'string' ? t['name'] : '', addresses });
    }
    out.push({ id: s['id'], name: typeof s['name'] === 'string' ? s['name'] : '', tabs });
  }
  return out;
}

/**
 * Puts live terminals into their space and tab, in desktop order. Tabs and spaces without a
 * live terminal are dropped; terminals no tab holds come back as `other`.
 */
export function arrangeSpaces(
  spaces: Space[],
  terminals: Terminal[],
): { spaces: ArrangedSpace[]; other: Terminal[] } {
  const byAddress = new Map(terminals.map((t) => [t.address, t]));
  const placed = new Set<string>();
  const arranged: ArrangedSpace[] = [];
  for (const space of spaces) {
    const tabs: ArrangedTab[] = [];
    space.tabs.forEach((tab, index) => {
      const live = tab.addresses.flatMap((a) => {
        const t = byAddress.get(a);
        return t && !placed.has(a) ? [t] : [];
      });
      if (live.length === 0) return;
      live.forEach((t) => placed.add(t.address));
      tabs.push({ id: tab.id, name: tab.name || `Tab ${index + 1}`, terminals: live });
    });
    if (tabs.length > 0) arranged.push({ id: space.id, name: space.name, tabs });
  }
  return { spaces: arranged, other: terminals.filter((t) => !placed.has(t.address)) };
}

/** Name of the tab that holds the terminal (`Tab N` when unnamed, as on the home list); '' when none does. */
export function tabNameOf(spaces: Space[], address: string): string {
  for (const space of spaces) {
    const index = space.tabs.findIndex((tab) => tab.addresses.includes(address));
    if (index >= 0) return space.tabs[index].name || `Tab ${index + 1}`;
  }
  return '';
}
