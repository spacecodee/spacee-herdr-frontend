import { InjectionToken, Service, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { locate } from '../hc/spaces';
import { TerminalStore } from '../hc/terminal-store';
import { LayoutApi, LayoutError, type Created, type MoveKind } from './layout-api';
import { closeTarget, spaceTerminals, type CloseTarget, type LaunchOption } from './layout-rules';

/** Shows an error to the person; a sonner toast, swapped for a spy in tests. */
export const LAYOUT_NOTIFY = new InjectionToken<(message: string) => void>('LAYOUT_NOTIFY', {
  factory: () => (message) => void toast.error(message),
});

/** The sheet or dialog the layout host shows. */
export type LayoutRequest =
  | { kind: 'new-project' }
  | { kind: 'new-tab'; spaceId: string; spaceName: string }
  | { kind: 'split'; tabId: string; paneId: string | null; direction: 'right' | 'down' }
  | { kind: 'rename'; target: 'space' | 'tab'; id: string; name: string }
  | { kind: 'close'; target: CloseTarget; name: string; terminals: number };

/**
 * Runs the layout operations for every screen: one request at a time, errors as a toast with the
 * reason, and the sheet stays open when the bridge refuses so the input is not lost. The list
 * updates by itself from the `herdr-app` document event.
 */
@Service()
export class LayoutActions {
  private readonly api = inject(LayoutApi);
  private readonly store = inject(TerminalStore);
  private readonly router = inject(Router);
  private readonly notify = inject(LAYOUT_NOTIFY);

  private readonly requestSignal = signal<LayoutRequest | null>(null);
  readonly request = this.requestSignal.asReadonly();
  private readonly busySignal = signal(false);
  readonly busy = this.busySignal.asReadonly();

  open(request: LayoutRequest): void {
    this.requestSignal.set(request);
  }

  dismiss(): void {
    this.requestSignal.set(null);
  }

  /** Opens the rename sheet for the tab that holds `address`. */
  askRename(address: string): void {
    const loc = locate(this.store.spaces(), address);
    if (loc) this.open({ kind: 'rename', target: 'tab', id: loc.tabId, name: loc.tabName });
  }

  /** Opens the split sheet for the pane of `address`. */
  askSplit(address: string, direction: 'right' | 'down'): void {
    const loc = locate(this.store.spaces(), address);
    if (loc) this.open({ kind: 'split', tabId: loc.tabId, paneId: loc.paneId, direction });
  }

  /** Opens the confirmation for closing `address`: its pane, its tab or its whole project. */
  askClose(address: string): void {
    const loc = locate(this.store.spaces(), address);
    if (!loc) return;
    const target = closeTarget(loc);
    const space = this.store.spaces().find((s) => s.id === loc.spaceId);
    const tab = space?.tabs.find((t) => t.id === loc.tabId);
    const terminals =
      target.kind === 'space' ? (space ? spaceTerminals(space) : 1) : target.kind === 'tab' ? (tab?.addresses.length ?? 1) : 1;
    this.open({ kind: 'close', target, name: target.kind === 'space' ? loc.spaceName : loc.tabName, terminals });
  }

  createProject(v: { name: string; folder: string; machine: string; option: LaunchOption }): Promise<void> {
    return this.run(async () => {
      const created = await this.api.createSpace({
        name: v.name.trim(),
        folder: v.folder.trim(),
        ...(v.machine ? { machine: v.machine } : {}),
        ...(v.option.argv ? { argv: v.option.argv } : {}),
      });
      await this.openCreated(created);
    });
  }

  createTab(v: { space: string; name: string; folder: string; option: LaunchOption }): Promise<void> {
    return this.run(async () => {
      const folder = v.folder.trim();
      const created = await this.api.createTab({
        space: v.space,
        name: v.name.trim(),
        ...(folder ? { folder } : {}),
        ...(v.option.argv ? { argv: v.option.argv } : {}),
      });
      await this.openCreated(created);
    });
  }

  split(v: { tab: string; pane: string | null; direction: 'right' | 'down'; option: LaunchOption }): Promise<void> {
    return this.run(async () => {
      const created = await this.api.split({
        tab: v.tab,
        ...(v.pane ? { pane: v.pane } : {}),
        direction: v.direction,
        ...(v.option.argv ? { argv: v.option.argv } : {}),
      });
      await this.openCreated(created);
    });
  }

  rename(target: 'space' | 'tab', id: string, name: string): Promise<void> {
    return this.run(async () => {
      const value = name.trim();
      if (target === 'space') await this.api.renameSpace(id, value);
      else await this.api.renameTab(id, value);
      this.dismiss();
    });
  }

  /** Moves a project one place up (-1) or down (+1) among all projects; does nothing at either end. */
  moveSpace(id: string, step: -1 | 1): Promise<void> {
    const spaces = this.store.spaces();
    const from = spaces.findIndex((s) => s.id === id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= spaces.length) return Promise.resolve();
    return this.run(() => this.api.move('space' satisfies MoveKind, id, to));
  }

  close(target: CloseTarget): Promise<void> {
    return this.run(async () => {
      await this.api.close(target.kind, target.id);
      this.dismiss();
    });
  }

  private async openCreated(created: Created): Promise<void> {
    this.dismiss();
    await this.router.navigate(['/t', created.terminal]);
  }

  private async run(job: () => Promise<void>): Promise<void> {
    if (this.busySignal()) return;
    this.busySignal.set(true);
    try {
      await job();
    } catch (error) {
      this.notify(error instanceof LayoutError ? error.message : 'Something went wrong.');
    } finally {
      this.busySignal.set(false);
    }
  }
}
