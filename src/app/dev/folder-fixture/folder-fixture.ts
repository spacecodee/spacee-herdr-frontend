import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { Listing } from '../../core/folders/folder-listing';
import { FolderError, Folders } from '../../core/folders/folders';
import { LayoutActions } from '../../core/layout/layout-actions';
import { TerminalStore } from '../../core/hc/terminal-store';
import { LayoutHost } from '../../features/layout/layout-host/layout-host';

const HOME = '/home/me';
const git = (parent: string, name: string) => ({ name, path: `${parent}/${name}`, git: true });
const dir = (parent: string, name: string) => ({ name, path: `${parent}/${name}`, git: false });

const TREE: Record<string, Listing> = {
  [HOME]: {
    more: false,
    entries: [
      dir(HOME, 'Desktop'), git(HOME, 'dotfiles'), dir(HOME, 'Development'), dir(HOME, 'Documents'), dir(HOME, 'Downloads'),
      dir(HOME, 'Music'), dir(HOME, 'Pictures'), git(HOME, 'figma-cli'), dir(HOME, 'Videos'),
    ],
  },
  [`${HOME}/Development`]: {
    more: false,
    entries: [dir(`${HOME}/Development`, 'fullstack'), git(`${HOME}/Development`, 'herdr-core'), git(`${HOME}/Development`, 'sandbox'), dir(`${HOME}/Development`, 'scratch')],
  },
  [`${HOME}/Development/fullstack`]: {
    more: false,
    entries: [git(`${HOME}/Development/fullstack`, 'spacee-herdr-app'), git(`${HOME}/Development/fullstack`, 'spacee-money-app'), dir(`${HOME}/Development/fullstack`, 'notes')],
  },
  [`${HOME}/Development/scratch`]: { more: false, entries: [] },
};

/** Canned folders for `?s=` (`loading`, `empty`, `error`, anything else browses a small tree). */
function fixtureFolders(scenario: string | null): Folders {
  return {
    home: async () => HOME,
    list: (_machine: string, path: string) => {
      if (scenario === 'loading') return new Promise<Listing>(() => undefined);
      if (scenario === 'error') return Promise.reject(new FolderError('gandalf is offline.'));
      if (scenario === 'empty') return Promise.resolve({ entries: [], more: false });
      return Promise.resolve(TREE[path] ?? { entries: [dir(path, 'src'), dir(path, 'docs')], more: false });
    },
    isFolder: async (_machine: string, path: string) => path in TREE,
  } as unknown as Folders;
}

const terminal = (address: string, cwd: string) => ({ address, cwd, state: 'live' });
const tab = (id: string, address: string) => ({ id, name: id, addresses: [address], panes: [] });

/** Dev-only: the New project sheet with canned folders, machines and recent projects (`?s=`). */
@Component({
  imports: [LayoutHost],
  providers: [
    // Its own instance, so the app's root layout host (which has the real services) stays closed.
    LayoutActions,
    { provide: Folders, useFactory: () => fixtureFolders(inject(ActivatedRoute).snapshot.queryParamMap.get('s')) },
    {
      provide: TerminalStore,
      useValue: {
        groups: signal([
          { name: 'workstation', local: true, state: 'local', terminals: [] },
          { name: 'gandalf', local: false, state: 'connected', terminals: [] },
          { name: 'rohan', local: false, state: 'unreachable', terminals: [] },
        ]).asReadonly(),
        spaces: signal([
          { id: 's1', name: 'herdr', tabs: [tab('t1', 'a1')] },
          { id: 's2', name: 'money', tabs: [tab('t2', 'a2')] },
          { id: 's3', name: 'dotfiles', tabs: [tab('t3', 'a3')] },
        ]).asReadonly(),
        terminals: signal([
          terminal('a1', `${HOME}/Development/fullstack/spacee-herdr-app`),
          terminal('a2', `${HOME}/Development/fullstack/spacee-money-app`),
          terminal('a3', `${HOME}/dotfiles`),
        ]).asReadonly(),
      },
    },
  ],
  templateUrl: './folder-fixture.html',
})
export class FolderFixture {
  constructor() {
    inject(LayoutActions).open({ kind: 'new-project' });
  }
}
