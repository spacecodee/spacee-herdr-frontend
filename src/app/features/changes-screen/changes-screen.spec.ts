import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Changes, type FileList } from '../../core/changes/changes';
import { HcClient } from '../../core/hc/hc-client';
import { TerminalStore } from '../../core/hc/terminal-store';
import { ChangesScreen } from './changes-screen';

const list: FileList = {
  files: [
    { path: 'src/app/features/settings/settings.ts', added: 18, deleted: 3, binary: false, status: 'M', untracked: false },
    { path: 'src/app/core/usage/usage.ts', added: 52, deleted: 0, binary: false, status: 'A', untracked: true },
    { path: 'logo.png', added: 0, deleted: 0, binary: true, status: 'M', untracked: false },
  ],
  total: { files: 3, added: 70, deleted: 3 },
};

describe('ChangesScreen', () => {
  const terminals = signal([{ address: 'rohan/t7', cwd: '/home/me/proj' }]);
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let repo: ReturnType<typeof vi.fn>;
  let listFn: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<ChangesScreen>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(s: string) => el().querySelector<T>(s);
  const text = () => el().textContent!.replace(/\s+/g, ' ');
  const flush = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function open(scope?: string) {
    params = new BehaviorSubject(convertToParamMap(scope ? { scope } : {}));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ address: 'rohan/t7' }), queryParamMap: params.value }, queryParamMap: params },
        },
        { provide: Changes, useValue: { repo, list: listFn } },
        { provide: TerminalStore, useValue: { terminals, ensureStarted: () => Promise.resolve() } },
        { provide: HcClient, useValue: { ensureOpen: () => Promise.resolve() } },
      ],
    });
    fixture = TestBed.createComponent(ChangesScreen);
    fixture.detectChanges();
    await flush();
    await flush();
  }

  beforeEach(() => {
    repo = vi.fn(() => Promise.resolve({ top: '/home/me/proj', branch: 'feat/settings-tokens' }));
    listFn = vi.fn(() => Promise.resolve(list));
  });

  it('shows the branch, the totals and a tree of folders with their files', async () => {
    await open();
    expect(repo).toHaveBeenCalledWith('rohan', '/home/me/proj');
    expect(listFn).toHaveBeenCalledWith('rohan', '/home/me/proj', 'unstaged');
    expect(q('[data-branch]')!.textContent).toContain('feat/settings-tokens');
    expect(q('[data-summary]')!.textContent!.replace(/\s+/g, '')).toBe('3fileschanged+70−3');
    const folders = el().querySelectorAll('[data-folder-row]');
    expect([...folders].map((r) => r.querySelector('[data-name]')!.textContent!.trim())).toEqual(['src/app', 'core/usage', 'features/settings']);
    expect(folders[2].textContent!.replace(/\s+/g, '')).toContain('+18−3');
    expect(folders[1].getAttribute('aria-expanded')).toBe('true');
    const rows = el().querySelectorAll('[data-file-row]');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent!.replace(/\s+/g, '')).toBe('Ausage.ts+52−0');
    expect(rows[1].textContent!.replace(/\s+/g, '')).toBe('Msettings.ts+18−3');
    expect(rows[2].textContent).toContain('Binary');
    expect(rows[2].getAttribute('style') ?? '').not.toContain('padding-left');
    expect(rows[1].getAttribute('href')).toContain('/t/rohan%2Ft7/changes/file?scope=unstaged&path=src%2Fapp%2Ffeatures%2Fsettings%2Fsettings.ts');
  });

  it('hides and shows a folder\'s files when its row is tapped', async () => {
    await open();
    const folder = () => el().querySelectorAll<HTMLElement>('[data-folder-row]')[2];
    folder().click();
    fixture.detectChanges();
    expect(folder().getAttribute('aria-expanded')).toBe('false');
    expect(el().querySelectorAll('[data-file-row]')).toHaveLength(2);
    expect(text()).not.toContain('settings.ts');
    folder().click();
    fixture.detectChanges();
    expect(folder().getAttribute('aria-expanded')).toBe('true');
    expect(el().querySelectorAll('[data-file-row]')).toHaveLength(3);
  });

  describe('tree accessibility', () => {
    const items = () => [...el().querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const key = (item: HTMLElement, k: string) => item.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const label = (item: HTMLElement) => item.textContent!.replace(/\s+/g, ' ').trim();
    const focused = () => label(document.activeElement as HTMLElement);

    it('is a labelled tree whose items carry level, set size and position; folders carry aria-expanded', async () => {
      await open();
      const tree = q('[role="tree"]')!;
      expect(tree.getAttribute('aria-label')).toBe('Changed files');
      const got = items().map((i) => [i.getAttribute('aria-level'), i.getAttribute('aria-setsize'), i.getAttribute('aria-posinset'), i.getAttribute('aria-expanded')]);
      expect(got).toEqual([
        ['1', '2', '1', 'true'],
        ['2', '2', '1', 'true'],
        ['3', '1', '1', null],
        ['2', '2', '2', 'true'],
        ['3', '1', '1', null],
        ['1', '2', '2', null],
      ]);
      expect(items().every((i) => !i.querySelector('a, button'))).toBe(true);
    });

    it('keeps one item tabbable and moves it with the arrows', async () => {
      await open();
      expect(items().filter((i) => i.tabIndex === 0)).toHaveLength(1);
      expect(items()[0].tabIndex).toBe(0);
      items()[0].focus();
      key(items()[0], 'ArrowDown');
      fixture.detectChanges();
      expect(document.activeElement).toBe(items()[1]);
      expect(items().map((i) => i.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1]);
      key(items()[1], 'ArrowUp');
      expect(document.activeElement).toBe(items()[0]);
      key(items()[0], 'End');
      expect(focused()).toContain('logo.png');
      key(document.activeElement as HTMLElement, 'ArrowDown');
      expect(focused()).toContain('logo.png');
      key(document.activeElement as HTMLElement, 'Home');
      expect(focused()).toContain('src/app');
    });

    it('closes an open folder on Left, then Left goes to the parent; Right opens, then goes to the first child', async () => {
      await open();
      const features = items()[3];
      features.focus();
      key(features, 'ArrowLeft');
      fixture.detectChanges();
      expect(items()[3].getAttribute('aria-expanded')).toBe('false');
      expect(items()).toHaveLength(5);
      key(items()[3], 'ArrowLeft');
      expect(focused()).toContain('src/app');
      items()[3].focus();
      key(items()[3], 'ArrowRight');
      fixture.detectChanges();
      expect(items()[3].getAttribute('aria-expanded')).toBe('true');
      key(items()[3], 'ArrowRight');
      expect(focused()).toContain('settings.ts');
      key(document.activeElement as HTMLElement, 'ArrowRight');
      expect(focused()).toContain('settings.ts');
      key(document.activeElement as HTMLElement, 'ArrowLeft');
      expect(focused()).toContain('features/settings');
    });

    it('toggles a folder on Enter and Space, and opens a file on Enter and Space', async () => {
      await open();
      const folder = items()[3];
      folder.focus();
      key(folder, 'Enter');
      fixture.detectChanges();
      expect(items()[3].getAttribute('aria-expanded')).toBe('false');
      key(items()[3], ' ');
      fixture.detectChanges();
      expect(items()[3].getAttribute('aria-expanded')).toBe('true');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const file = items()[4];
      key(file, 'Enter');
      key(file, ' ');
      expect(navigate).toHaveBeenCalledTimes(2);
      expect(String(navigate.mock.calls[0][0])).toContain('/changes/file');
    });

    it('makes a tapped folder the tabbable item', async () => {
      await open();
      items()[3].click();
      fixture.detectChanges();
      expect(items().map((i) => i.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    });
  });

  it('marks the chosen tab and loads that scope', async () => {
    await open('staged');
    expect(listFn).toHaveBeenCalledWith('rohan', '/home/me/proj', 'staged');
    expect(q('[data-scope="staged"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-scope="unstaged"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('puts the chosen scope in the URL when a tab is tapped', async () => {
    await open();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    q<HTMLButtonElement>('[data-scope="commit"]')!.click();
    expect(navigate.mock.calls[0][1]).toMatchObject({ queryParams: { scope: 'commit' }, replaceUrl: true });
  });

  it('says so when the folder is not a repository', async () => {
    repo.mockResolvedValue(null);
    await open();
    expect(q('[data-not-repo]')!.textContent).toContain('Not a git repository');
    expect(listFn).not.toHaveBeenCalled();
  });

  it('says the working tree is clean for an empty list', async () => {
    listFn.mockResolvedValue({ files: [], total: { files: 0, added: 0, deleted: 0 } });
    await open();
    expect(q('[data-empty]')!.textContent).toContain('The working tree is clean.');
    expect(q('[data-summary]')).toBeNull();
  });

  it('shows the error with a Retry that asks again', async () => {
    listFn.mockRejectedValueOnce(new Error('x'));
    await open();
    expect(q('[data-error]')!.textContent).toContain('Could not read the changes.');
    q<HTMLButtonElement>('[data-retry]')!.click();
    await flush();
    await flush();
    expect(q('[data-file-row]')).not.toBeNull();
  });

  it('refreshes from the button', async () => {
    await open();
    listFn.mockClear();
    q<HTMLButtonElement>('[data-refresh]')!.click();
    await flush();
    expect(listFn).toHaveBeenCalledTimes(1);
  });
});
