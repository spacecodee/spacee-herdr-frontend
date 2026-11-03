import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FolderError, Folders } from '../../../core/folders/folders';
import type { Listing } from '../../../core/folders/folder-listing';
import { TerminalStore } from '../../../core/hc/terminal-store';
import { FolderPicker } from './folder-picker';

const entry = (name: string, git = false, dir = '/home/me') => ({ name, path: `${dir}/${name}`, git });
const listing = (...names: string[]): Listing => ({ entries: names.map((n) => entry(n, n === 'app')), more: false });

describe('FolderPicker', () => {
  let fixture: ComponentFixture<FolderPicker>;
  let host: HTMLElement;
  let folders: { home: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; isFolder: ReturnType<typeof vi.fn> };
  const groups = signal<unknown[]>([]);
  const spaces = signal<unknown[]>([]);
  const terminals = signal<unknown[]>([]);

  const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
  const all = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
  const names = () => all('[data-folder] [data-name]').map((e) => e.textContent!.trim());
  async function settle() {
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }
  async function create(inputs: { machine?: string; folder?: string } = {}) {
    fixture = TestBed.createComponent(FolderPicker);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    host = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
  }
  async function type(value: string) {
    const input = q<HTMLInputElement>('input[name="filter"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await settle();
  }

  beforeEach(() => {
    groups.set([
      { name: 'workstation', local: true, state: 'local', terminals: [] },
      { name: 'gandalf', local: false, state: 'connected', terminals: [] },
      { name: 'rohan', local: false, state: 'unreachable', terminals: [] },
    ]);
    spaces.set([]);
    terminals.set([]);
    folders = {
      home: vi.fn().mockResolvedValue('/home/me'),
      list: vi.fn(async (_m: string, dir: string) => (dir === '/home/me' ? listing('zeta', 'Dev', 'app') : listing('inner'))),
      isFolder: vi.fn().mockResolvedValue(true),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Folders, useValue: folders },
        { provide: TerminalStore, useValue: { groups, spaces, terminals } },
      ],
    });
  });

  it('lists the home folder: sub-folders only, sorted, with a git badge', async () => {
    await create();
    expect(folders.list).toHaveBeenCalledWith('', '/home/me');
    expect(names()).toEqual(['zeta', 'Dev', 'app']);
    expect(all('[data-folder]').map((r) => !!r.querySelector('[data-git]'))).toEqual([false, false, true]);
    expect(q('[data-bar]')!.textContent).toContain('~');
    expect(q('[data-bar]')!.textContent).toContain('workstation');
  });

  it('shows Recent folders on the start view, from the projects on this machine', async () => {
    spaces.set([{ id: 's1', name: 'a', tabs: [{ id: 't', name: 't', addresses: ['t1'], panes: [] }] }]);
    terminals.set([{ address: 't1', cwd: '/home/me/code/app' }]);
    await create();
    expect(q('[data-recent]')!.textContent).toContain('~/code/app');
    q<HTMLButtonElement>('[data-recent] button')!.click();
    await settle();
    expect(folders.list).toHaveBeenLastCalledWith('', '/home/me/code/app');
    expect(q('[data-recent]')).toBeNull();
  });

  it('enters a folder with a tap and goes back up through the breadcrumb', async () => {
    await create();
    all('[data-folder]')[1].click();
    await settle();
    expect(folders.list).toHaveBeenLastCalledWith('', '/home/me/Dev');
    expect(names()).toEqual(['inner']);
    expect(all('[data-crumb]').map((c) => c.textContent!.trim())).toEqual(['~', 'Dev']);
    all('[data-crumb]')[0].click();
    await settle();
    expect(folders.list).toHaveBeenLastCalledWith('', '/home/me');
  });

  it('filters the current folder as you type and marks the matched letters', async () => {
    await create();
    await type('dv');
    expect(names()).toEqual(['Dev']);
    expect(all('[data-folder] mark').map((m) => m.textContent)).toEqual(['D', 'v']);
    await type('qqq');
    expect(names()).toEqual([]);
    expect(q('[data-no-match]')).not.toBeNull();
  });

  it('goes to a typed path on Enter when the folder exists, and says so when it does not', async () => {
    await create();
    await type('~/Dev');
    expect(q('[data-go]')).not.toBeNull();
    q<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(folders.isFolder).toHaveBeenCalledWith('', '/home/me/Dev');
    expect(folders.list).toHaveBeenLastCalledWith('', '/home/me/Dev');
    folders.isFolder.mockResolvedValue(false);
    await type('/nope');
    q<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(q('[data-typed-error]')!.textContent).toContain('does not exist');
    expect(folders.list).not.toHaveBeenCalledWith('', '/nope');
  });

  it('shows skeleton rows while loading', async () => {
    let finish!: (l: Listing) => void;
    folders.list.mockReturnValue(new Promise<Listing>((r) => (finish = r)));
    fixture = TestBed.createComponent(FolderPicker);
    host = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
    expect(all('[data-skeleton]').length).toBeGreaterThan(2);
    finish(listing('a'));
    await settle();
    expect(q('[data-skeleton]')).toBeNull();
  });

  it('says a folder is empty and offers to use it', async () => {
    folders.list.mockResolvedValue(listing());
    await create();
    expect(q('[data-empty]')!.textContent).toContain('No folders here');
    expect(q('[data-empty]')!.textContent).toContain('Go up, or use this folder as it is.');
    expect(q<HTMLButtonElement>('[data-use]')!.disabled).toBe(false);
  });

  it('shows the error in one line with Retry, and cannot use the folder', async () => {
    folders.list.mockRejectedValueOnce(new FolderError('Permission denied.'));
    await create();
    expect(q('[data-error]')!.textContent).toContain('Permission denied.');
    expect(q<HTMLButtonElement>('[data-use]')!.disabled).toBe(true);
    q<HTMLButtonElement>('[data-retry]')!.click();
    await settle();
    expect(q('[data-error]')).toBeNull();
    expect(names()).toEqual(['zeta', 'Dev', 'app']);
  });

  it('notes when the list was cut at 1000 folders', async () => {
    folders.list.mockResolvedValue({ ...listing('a'), more: true });
    await create();
    expect(q('[data-more]')!.textContent).toContain('Showing first 1000');
  });

  it('switches machine: this one first, offline ones disabled', async () => {
    await create();
    const chips = all('[data-machine-chip]');
    expect(chips.map((c) => c.textContent!.trim())).toEqual(['workstation', 'gandalf', 'rohan']);
    expect(chips.map((c) => (c as HTMLButtonElement).disabled)).toEqual([false, false, true]);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    chips[1].click();
    await settle();
    expect(folders.home).toHaveBeenCalledWith('gandalf');
    expect(folders.list).toHaveBeenLastCalledWith('gandalf', '/home/me');
    expect(all('[data-machine-chip]')[1].getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-bar]')!.textContent).toContain('gandalf');
    expect(q('[data-recent]')).toBeNull();
  });

  it('starts where the field already points, on its machine', async () => {
    await create({ machine: 'gandalf', folder: '/srv/work' });
    expect(folders.list).toHaveBeenCalledWith('gandalf', '/srv/work');
  });

  it('returns the folder and machine with Use this folder, and goes back with Back', async () => {
    const chosen = vi.fn();
    const cancelled = vi.fn();
    await create();
    fixture.componentInstance.chosen.subscribe(chosen);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    all('[data-folder]')[1].click();
    await settle();
    q<HTMLButtonElement>('[data-use]')!.click();
    expect(chosen).toHaveBeenCalledWith({ machine: '', folder: '/home/me/Dev' });
    q<HTMLButtonElement>('[data-back]')!.click();
    expect(cancelled).toHaveBeenCalled();
  });
});
