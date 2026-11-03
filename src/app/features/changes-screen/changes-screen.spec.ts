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

  it('shows the branch, the totals and a row per file with badge, name, folder and counts', async () => {
    await open();
    expect(repo).toHaveBeenCalledWith('rohan', '/home/me/proj');
    expect(listFn).toHaveBeenCalledWith('rohan', '/home/me/proj', 'unstaged');
    expect(q('[data-branch]')!.textContent).toContain('feat/settings-tokens');
    expect(q('[data-summary]')!.textContent!.replace(/\s+/g, '')).toBe('3fileschanged+70−3');
    const rows = el().querySelectorAll('[data-file-row]');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent!.replace(/\s+/g, '')).toContain('Msettings.tssrc/app/features/settings/+18−3');
    expect(rows[1].querySelector('[data-badge]')!.textContent).toBe('A');
    expect(rows[2].textContent).toContain('Binary');
    expect(rows[0].getAttribute('href')).toContain('/t/rohan%2Ft7/changes/file?scope=unstaged&path=src%2Fapp%2Ffeatures%2Fsettings%2Fsettings.ts');
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
