import { Location } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Files, type FileResult } from '../../core/files/files';
import { RemoteError } from '../../core/files/remote-exec';
import { HcClient } from '../../core/hc/hc-client';
import { TerminalStore } from '../../core/hc/terminal-store';
import { FileViewer } from './file-viewer';

const SOURCE = [
  "import { signal } from '@angular/core';",
  '',
  '// Terminal text size, kept per device.',
  "const KEY = 'herdr.text-size';",
  'export class Settings {',
  '  readonly size = signal(readSize());',
  '}',
  '',
].join('\n');

describe('FileViewer', () => {
  const terminals = signal([{ address: 'rohan/t7', cwd: '/home/me/proj' }]);
  let read: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<FileViewer>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(s: string) => el().querySelector<T>(s);
  const flush = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function open(path = '/home/me/proj/src/app/settings.ts') {
    const query = new BehaviorSubject(convertToParamMap({ path }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ address: 'rohan/t7' }), queryParamMap: query.value }, queryParamMap: query } },
        { provide: Files, useValue: { read } },
        { provide: TerminalStore, useValue: { terminals, ensureStarted: () => Promise.resolve() } },
        { provide: HcClient, useValue: { ensureOpen: () => Promise.resolve() } },
      ],
    });
    fixture = TestBed.createComponent(FileViewer);
    fixture.detectChanges();
    await flush();
    await flush();
  }
  const type = async (value: string) => {
    const input = q<HTMLInputElement>('[data-search]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flush();
  };
  const current = () => [...el().querySelectorAll('[data-current]')].map((n) => n.textContent);

  beforeEach(() => {
    read = vi.fn(() => Promise.resolve({ kind: 'text', text: SOURCE, truncated: false } as FileResult));
  });

  it('reads the file on the terminal machine and shows name, lines, language and the folders', async () => {
    await open();
    expect(read).toHaveBeenCalledWith('rohan', '/home/me/proj/src/app/settings.ts');
    expect(q('[data-name]')!.textContent).toBe('settings.ts');
    expect(q('[data-sub]')!.textContent).toBe('7 lines · TypeScript');
    expect(q('[data-crumbs]')!.textContent!.replace(/\s+/g, '')).toBe('src›app');
    const lines = el().querySelectorAll('[data-line]');
    expect(lines).toHaveLength(7);
    expect(lines[3].querySelector('.num')!.textContent).toBe('4');
  });

  it('colors keywords, strings and comments and keeps the text as it is', async () => {
    await open();
    const kinds = (cls: string) => [...el().querySelectorAll(cls)].map((n) => n.textContent);
    expect(kinds('.t-keyword')).toContain('import');
    expect(kinds('.t-string')).toContain("'herdr.text-size'");
    expect(kinds('.t-comment')).toEqual(['// Terminal text size, kept per device.']);
    expect(q('[data-code]')!.textContent).toContain('readonly size = signal(readSize());');
  });

  it('searches case-insensitively, counts, highlights and steps through matches with wrap-around', async () => {
    await open();
    await type('size');
    expect(q('[data-counter]')!.textContent).toBe('1 of 4');
    expect(el().querySelectorAll('.hit-hit, .hit-current')).toHaveLength(4);
    expect(current()).toEqual(['size']);
    q<HTMLButtonElement>('[data-next]')!.click();
    await flush();
    expect(q('[data-counter]')!.textContent).toBe('2 of 4');
    q<HTMLButtonElement>('[data-prev]')!.click();
    q<HTMLButtonElement>('[data-prev]')!.click();
    await flush();
    expect(q('[data-counter]')!.textContent).toBe('4 of 4');
    await type('');
    expect(q('[data-counter]')!.textContent).toBe('');
    expect(el().querySelectorAll('.hit-hit, .hit-current')).toHaveLength(0);
  });

  it('says there are no matches, and disables the arrows', async () => {
    await open();
    await type('zzz');
    expect(q('[data-counter]')!.textContent).toBe('No matches');
    expect(q<HTMLButtonElement>('[data-next]')!.disabled).toBe(true);
  });

  it('copies the path', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await open();
    q<HTMLButtonElement>('[data-copy-path-button]')!.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('/home/me/proj/src/app/settings.ts');
    vi.unstubAllGlobals();
  });

  it.each([
    ['too-large', '[data-too-large]', 'Too large to show'],
    ['binary', '[data-binary]', 'Binary file'],
    ['not-found', '[data-not-found]', 'File not found'],
  ] as const)('shows the %s state', async (kind, selector, title) => {
    read.mockResolvedValue({ kind });
    await open('/home/me/proj/src/assets/logo.png');
    expect(q(selector)!.textContent).toContain(title);
    expect(q('[data-sub]')!.textContent).toBe('/home/me/proj/src/assets');
    expect(q('[data-search]')).toBeNull();
  });

  it('shows an offline machine as an error', async () => {
    read.mockRejectedValue(new RemoteError('rohan is offline.', true));
    await open();
    expect(q('[data-error]')!.textContent).toContain('rohan is offline.');
  });

  it('goes back in history when there is some', async () => {
    await open();
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    const back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);
    q<HTMLButtonElement>('[data-back]')!.click();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('goes to the conversation when a deep link left no history', async () => {
    await open();
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    q<HTMLButtonElement>('[data-back]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/t', 'rohan/t7']);
  });
});
