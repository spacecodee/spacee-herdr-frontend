import { signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { Changes, type ChangeFile, type FileList } from '../../core/changes/changes';
import type { DiffRow } from '../../core/changes/changes-parse';
import { Files, type FileResult } from '../../core/files/files';
import { HcClient } from '../../core/hc/hc-client';
import { TerminalStore } from '../../core/hc/terminal-store';
import type { ChatMessage } from '../../core/chat/types';

export const FIXTURE_ADDRESS = 'fixture/t1';
const TOP = '/home/me/code/web';

const file = (path: string, status: ChangeFile['status'], added: number, deleted: number, over: Partial<ChangeFile> = {}): ChangeFile => ({
  path, status, added, deleted, binary: false, untracked: false, ...over,
});

const UNSTAGED: ChangeFile[] = [
  file('src/app/features/settings/settings.ts', 'M', 18, 3),
  file('src/app/features/settings/settings.html', 'M', 27, 9),
  file('src/app/core/usage/usage.ts', 'A', 52, 0, { untracked: true }),
  file('src/app/features/terminal-view/terminal-view.ts', 'M', 11, 2),
  file('src/app/core/legacy-token.ts', 'D', 0, 4),
  file('src/app/tokens.css', 'R', 16, 0),
];

const listOf = (files: ChangeFile[]): FileList => ({
  files,
  total: files.reduce((t, f) => ({ files: t.files + 1, added: t.added + f.added, deleted: t.deleted + f.deleted }), { files: 0, added: 0, deleted: 0 }),
});

const ctx = (old: number, next: number, text: string): DiffRow => ({ kind: 'ctx', old, new: next, text });
const del = (old: number, text: string): DiffRow => ({ kind: 'del', old, text });
const add = (n: number, text: string): DiffRow => ({ kind: 'add', new: n, text });
const DIFF: DiffRow[] = [
  { kind: 'hunk', text: '@@ -12,7 +12,10 @@ export class Settings {' },
  ctx(12, 12, '  readonly size = signal(readSize());'),
  ctx(13, 13, '  readonly options = SIZES;'),
  del(14, '  readonly speed = signal(1);'),
  add(14, '  readonly speed = signal(readSpeed());'),
  add(15, '  readonly tint = signal(readTint());'),
  ctx(15, 16, ''),
  ctx(16, 17, '  set(value: number) {'),
  del(17, '    this.size.set(value);'),
  add(18, '    this.size.set(clamp(value, 12, 20));'),
  add(19, '    const label = `Terminal text ${value}px, scroll ${this.speed()}`;'),
  ctx(18, 20, '  }'),
  { kind: 'hunk', text: '@@ -41,6 +44,9 @@ export function readSize()' },
  ctx(41, 44, '  const raw = localStorage.getItem(KEY);'),
  del(42, '  return raw ? Number(raw) : 14;'),
  add(45, '  const n = raw === null ? 14 : Number(raw);'),
  add(46, '  return Number.isFinite(n) ? clamp(n, 12, 20) : 14;'),
  ctx(43, 47, '}'),
];

export const SOURCE = [
  "import { signal } from '@angular/core';",
  '',
  '// Terminal text size, kept per device.',
  "const KEY = 'herdr.text-size';",
  'const SIZES = [12, 14, 16, 18];',
  '',
  'export class Settings {',
  '  readonly size = signal(readSize());',
  '  readonly options = SIZES;',
  '',
  '  set(value: number) {',
  '    this.size.set(clamp(value));',
  '    localStorage.setItem(KEY, String(value));',
  '  }',
  '}',
  '',
  'function readSize(): number {',
  '  const raw = localStorage.getItem(KEY);',
  '  return raw ? Number(raw) : 14;',
  '}',
  '',
].join('\n');

const scenario = (): string => new URLSearchParams(location.search).get('s') ?? '';

function fakeChanges() {
  const s = scenario();
  const sums = signal(listOf(UNSTAGED).total);
  return {
    repo: async () => (s === 'notrepo' ? null : { top: TOP, branch: s === 'notrepo' ? '' : s === 'clean' ? 'acme-api' : 'feat/settings-tokens' }),
    cached: () => undefined,
    list: async (_m: string, _t: string, scope: string) => {
      if (s === 'clean' || scope !== 'unstaged') return listOf([]);
      return listOf(s === 'binary' ? [file('logo.png', 'M', 0, 0, { binary: true }), ...UNSTAGED] : UNSTAGED);
    },
    diff: async () => ({ rows: DIFF, truncated: s === 'big' }),
    summaryOf: () => () => sums(),
    refresh: async () => undefined,
  };
}

function fakeFiles() {
  const s = scenario();
  return {
    read: async (): Promise<FileResult> => {
      if (s === 'toolarge') return { kind: 'too-large' };
      if (s === 'binary') return { kind: 'binary' };
      if (s === 'notfound') return { kind: 'not-found' };
      return { kind: 'text', text: SOURCE, truncated: false };
    },
  };
}

/** Dev-only: stand-ins so the Changes, diff and viewer screens run without a bridge. `?s=clean|notrepo|big|binary|toolarge|notfound`. */
export const changesFixtureProviders: Provider[] = [
  { provide: Changes, useFactory: fakeChanges },
  { provide: Files, useFactory: fakeFiles },
  {
    provide: TerminalStore,
    useValue: { terminals: signal([{ address: FIXTURE_ADDRESS, cwd: TOP }]), spaces: signal([]), ensureStarted: () => Promise.resolve() },
  },
  { provide: HcClient, useValue: { ensureOpen: () => Promise.resolve() } },
];

const at = Date.now();
export const MESSAGES = (withLink: boolean): ChatMessage[] => [
  { id: 'u1', role: 'user', time: at, parts: [{ type: 'text', text: 'Make the settings page use the new tokens' }] },
  { id: 'u2', role: 'user', time: at + 1, parts: [{ type: 'text', text: '/clear' }] },
  { id: 'a1', role: 'assistant', time: at + 2, parts: [{ type: 'text', text: 'I will update the colors first, then the spacing. Two files need to change.' }] },
  { id: 'a2', role: 'assistant', time: at + 3, parts: [
    { type: 'tool', id: 't1', name: 'Bash', summary: 'Ran 3 commands', input: 'pnpm test', output: 'ok', status: 'ok' },
  ] },
  {
    id: 'a3', role: 'assistant', time: at + 4,
    parts: [{ type: 'text', text: withLink ? 'Done. I changed src/app/features/settings/settings.ts and the tests pass.' : 'Done. Both files are updated and the tests pass.' }],
  },
];
