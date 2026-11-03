import { Service, signal } from '@angular/core';

interface Box {
  top: number;
  height: number;
}

export interface LayoutSnapshot {
  clientHeight: number;
  parts: Record<'root' | 'header' | 'screen' | 'compose' | 'keybar', Box | null>;
}

const PARTS = ['header', 'screen', 'compose', 'keybar'] as const;
const round = (n: number) => Math.round(n * 100) / 100;

function box(el: Element | null): Box | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { top: round(rect.top), height: round(rect.height) };
}

/** Measures the terminal view; parts carry `data-probe="<name>"`, a missing one counts as hidden. */
export function measureLayout(root: HTMLElement, doc: Document): LayoutSnapshot {
  const parts = { root: box(root) } as LayoutSnapshot['parts'];
  for (const name of PARTS) parts[name] = box(root.querySelector(`[data-probe="${name}"]`));
  return { clientHeight: doc.documentElement.clientHeight, parts };
}

export function formatLayout(snapshot: LayoutSnapshot | null): string {
  if (!snapshot) return 'layout (terminal view): not opened yet';
  const lines = [`layout (terminal view): clientHeight=${snapshot.clientHeight}`];
  for (const [name, b] of Object.entries(snapshot.parts))
    lines.push(`  ${name}: ${b ? `top=${b.top} h=${b.height}` : 'hidden'}`);
  return lines.join('\n');
}

/** Last measured terminal-view layout, kept in memory for Settings > Diagnostics. */
@Service()
export class LayoutProbe {
  readonly last = signal<LayoutSnapshot | null>(null);
}
