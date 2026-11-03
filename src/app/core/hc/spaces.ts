import type { Terminal } from './types';

/** Name of the document where the desktop app keeps its layout. */
export const LAYOUT_DOC = 'herdr-app';

/** A leaf of a tab's layout tree: the pane id and the terminal it shows. */
export interface SpacePane {
  id: string;
  address: string;
}

export interface SpaceTab {
  id: string;
  name: string;
  /** Terminal addresses in the tab, in layout order. */
  addresses: string[];
  /** The panes that show a terminal, in layout order (a leaf without an id is left out). */
  panes: SpacePane[];
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
function collect(node: unknown, into: string[], panes: SpacePane[]): void {
  if (!isRecord(node)) return;
  const content = node['content'];
  if (isRecord(content) && typeof content['terminal'] === 'string') {
    const address = content['terminal'];
    if (!into.includes(address)) into.push(address);
    if (typeof node['id'] === 'string' && !panes.some((p) => p.id === node['id'])) {
      panes.push({ id: node['id'], address });
    }
  }
  const children = node['children'];
  if (Array.isArray(children)) for (const child of children) collect(child, into, panes);
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
      const panes: SpacePane[] = [];
      collect(t['root'], addresses, panes);
      tabs.push({ id: t['id'], name: typeof t['name'] === 'string' ? t['name'] : '', addresses, panes });
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

/** Where a terminal sits in the layout, with the counts the close and move rules need. */
export interface Location {
  spaceId: string;
  spaceName: string;
  /** 1-based position among all spaces, as the move endpoint counts. */
  spaceIndex: number;
  spaceCount: number;
  tabId: string;
  tabName: string;
  tabIndex: number;
  tabCount: number;
  /** Id of the pane that shows the terminal; null when the layout has none for it. */
  paneId: string | null;
  paneCount: number;
}

export function locate(spaces: Space[], address: string): Location | null {
  for (const [si, space] of spaces.entries()) {
    const ti = space.tabs.findIndex((tab) => tab.addresses.includes(address));
    if (ti < 0) continue;
    const tab = space.tabs[ti];
    return {
      spaceId: space.id,
      spaceName: space.name,
      spaceIndex: si + 1,
      spaceCount: spaces.length,
      tabId: tab.id,
      tabName: tab.name || `Tab ${ti + 1}`,
      tabIndex: ti + 1,
      tabCount: space.tabs.length,
      paneId: tab.panes.find((p) => p.address === address)?.id ?? null,
      paneCount: tab.panes.length,
    };
  }
  return null;
}
