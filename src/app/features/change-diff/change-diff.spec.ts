import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Changes, type ChangeFile, type FileList } from '../../core/changes/changes';
import type { DiffRow } from '../../core/changes/changes-parse';
import { Files } from '../../core/files/files';
import { HcClient } from '../../core/hc/hc-client';
import { TerminalStore } from '../../core/hc/terminal-store';
import { ChangeDiff } from './change-diff';

const file = (path: string, over: Partial<ChangeFile> = {}): ChangeFile => ({
  path, added: 18, deleted: 3, binary: false, status: 'M', untracked: false, ...over,
});
const list = (files: ChangeFile[]): FileList => ({ files, total: { files: files.length, added: 0, deleted: 0 } });
const rows: DiffRow[] = [
  { kind: 'hunk', text: '@@ -12,7 +12,10 @@ export class Settings {' },
  { kind: 'ctx', old: 12, new: 12, text: 'readonly size' },
  { kind: 'del', old: 14, text: 'readonly speed = signal(1);' },
  { kind: 'add', new: 14, text: 'readonly speed = signal(readSpeed());' },
];

describe('ChangeDiff', () => {
  const terminals = signal([{ address: 'rohan/t7', cwd: '/home/me/proj' }]);
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let diff: ReturnType<typeof vi.fn>;
  let read: ReturnType<typeof vi.fn>;
  let files: ChangeFile[];
  let fixture: ComponentFixture<ChangeDiff>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(s: string) => el().querySelector<T>(s);
  const flush = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function open(path = 'src/a.ts', scope = 'unstaged') {
    query = new BehaviorSubject(convertToParamMap({ path, scope }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ address: 'rohan/t7' }), queryParamMap: query.value }, queryParamMap: query } },
        {
          provide: Changes,
          useValue: {
            repo: () => Promise.resolve({ top: '/home/me/proj', branch: 'main' }),
            cached: () => undefined,
            list: () => Promise.resolve(list(files)),
            diff,
          },
        },
        { provide: Files, useValue: { read } },
        { provide: TerminalStore, useValue: { terminals, ensureStarted: () => Promise.resolve() } },
        { provide: HcClient, useValue: { ensureOpen: () => Promise.resolve() } },
      ],
    });
    fixture = TestBed.createComponent(ChangeDiff);
    fixture.detectChanges();
    await flush();
    await flush();
  }

  beforeEach(() => {
    files = [file('src/a.ts'), file('src/b.ts'), file('logo.png', { binary: true }), file('src/new.ts', { untracked: true, status: 'A' })];
    diff = vi.fn(() => Promise.resolve({ rows, truncated: false }));
    read = vi.fn(() => Promise.resolve({ kind: 'text', text: 'one\ntwo\n', truncated: false }));
  });

  it('shows the file, its counts, the scope and the diff rows with numbers and signs', async () => {
    await open();
    expect(q('[data-name]')!.textContent).toBe('a.ts');
    expect(q('[data-dir]')!.textContent).toBe('src');
    expect(q('[data-meta]')!.textContent!.replace(/\s+/g, '')).toBe('+18−3·Unstaged');
    expect(diff).toHaveBeenCalledWith('rohan', '/home/me/proj', 'unstaged', 'src/a.ts');
    expect(q('[data-row="hunk"]')!.textContent).toContain('@@ -12,7 +12,10 @@');
    const del = q('[data-row="del"]')!;
    expect(del.querySelector('.num')!.textContent).toBe('14');
    expect(del.querySelector('.sign')!.textContent).toBe('-');
    expect(q('[data-row="add"] .sign')!.textContent).toBe('+');
    expect(q('[data-row="add"] .code')!.textContent).toBe('readonly speed = signal(readSpeed());');
    expect(q('[data-row="ctx"] .num')!.textContent).toBe('12');
  });

  it('says File 1 of N and steps to the next file, replacing the URL', async () => {
    await open();
    expect(q('[data-position]')!.textContent).toBe('File 1 of 4');
    expect(q<HTMLButtonElement>('[data-prev]')!.disabled).toBe(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    q<HTMLButtonElement>('[data-next]')!.click();
    expect(navigate.mock.calls[0][1]).toMatchObject({ queryParams: { scope: 'unstaged', path: 'src/b.ts' }, replaceUrl: true });
  });

  it('disables Next on the last file of the tree', async () => {
    await open('logo.png');
    expect(q('[data-position]')!.textContent).toBe('File 4 of 4');
    expect(q<HTMLButtonElement>('[data-next]')!.disabled).toBe(true);
  });

  it('walks next and prev in the order the changes tree lists the files, not the order they came in', async () => {
    files = [file('z.md'), file('src/b.ts'), file('src/app/a.ts'), file('a.md')];
    await open('src/app/a.ts');
    expect(q('[data-position]')!.textContent).toBe('File 1 of 4');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    q<HTMLButtonElement>('[data-next]')!.click();
    expect(navigate.mock.calls[0][1]).toMatchObject({ queryParams: { path: 'src/b.ts' } });
    query.next(convertToParamMap({ path: 'a.md', scope: 'unstaged' }));
    await flush();
    await flush();
    expect(q('[data-position]')!.textContent).toBe('File 3 of 4');
    q<HTMLButtonElement>('[data-prev]')!.click();
    expect(navigate.mock.calls[1][1]).toMatchObject({ queryParams: { path: 'src/b.ts' } });
  });

  it('shows the binary state and does not ask for a diff', async () => {
    await open('logo.png');
    expect(q('[data-binary]')!.textContent).toContain('logo.png changed. Binary files have no text diff.');
    expect(diff).not.toHaveBeenCalled();
  });

  it('shows an untracked file as all added lines from its content', async () => {
    await open('src/new.ts');
    expect(read).toHaveBeenCalledWith('rohan', '/home/me/proj/src/new.ts');
    expect(diff).not.toHaveBeenCalled();
    expect(el().querySelectorAll('[data-row="add"]')).toHaveLength(2);
    expect(q('[data-meta]')!.textContent).toContain('Untracked');
  });

  it('says a diff over 2,000 lines was cut and offers the file', async () => {
    diff.mockResolvedValue({ rows, truncated: true });
    await open();
    expect(q('[data-truncated]')!.textContent).toContain('Showing the first 2,000 lines');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    q<HTMLButtonElement>('[data-open-file-large]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/t', 'rohan/t7', 'file'], { queryParams: { path: '/home/me/proj/src/a.ts' } });
  });

  it('says there are no text changes for an empty diff', async () => {
    diff.mockResolvedValue({ rows: [], truncated: false });
    await open();
    expect(q('[data-empty]')!.textContent).toContain('No text changes');
  });

  it('shows an error when git cannot be read', async () => {
    diff.mockRejectedValue(new Error('x'));
    await open();
    expect(q('[data-error]')!.textContent).toContain('Could not read this diff.');
  });
});
