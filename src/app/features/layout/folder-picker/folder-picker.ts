import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight, lucideFolder, lucideGitBranch, lucideHistory } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { fuzzyMatch, highlight, type Piece } from '../../../core/folders/fuzzy';
import type { FolderEntry } from '../../../core/folders/folder-listing';
import { crumbs, looksLikePath, middleTruncate, resolveTyped, tildePath } from '../../../core/folders/folder-path';
import { FolderError, Folders } from '../../../core/folders/folders';
import { recentFolders } from '../../../core/folders/recent-folders';
import { TerminalStore } from '../../../core/hc/terminal-store';

interface Row {
  entry: FolderEntry;
  pieces: Piece[];
}

type Status = 'loading' | 'ready' | 'error';

/**
 * "Choose folder": browse the folders of this machine or an added one (through core's
 * `machine.exec`), filter or type a path, and hand the choice back. It never writes anything.
 */
@Component({
  selector: 'app-folder-picker',
  imports: [NgIcon, ...HlmButtonImports, ...HlmInputImports, ...HlmSkeletonImports],
  viewProviders: [provideIcons({ lucideChevronLeft, lucideChevronRight, lucideFolder, lucideGitBranch, lucideHistory })],
  templateUrl: './folder-picker.html',
  styleUrl: './folder-picker.css',
})
export class FolderPicker implements OnInit {
  private readonly folders = inject(Folders);
  private readonly store = inject(TerminalStore);

  /** The machine the field already points at (`''`: this one) and its folder; the picker starts there. */
  readonly machine = input('');
  readonly folder = input('');
  readonly chosen = output<{ machine: string; folder: string }>();
  readonly cancelled = output<void>();

  protected readonly machineName = signal('');
  protected readonly home = signal('');
  protected readonly path = signal('');
  protected readonly status = signal<Status>('loading');
  protected readonly problem = signal('');
  protected readonly typedProblem = signal('');
  protected readonly entries = signal<FolderEntry[]>([]);
  protected readonly more = signal(false);
  protected readonly filter = signal('');
  protected readonly skeletons = [0, 1, 2, 3, 4];
  private request = 0;

  protected readonly chips = computed(() =>
    this.store.groups().map((g) => ({
      value: g.local ? '' : g.name,
      label: g.name,
      online: g.local || g.state === 'connected',
    })),
  );
  protected readonly machineLabel = computed(() => this.chips().find((c) => c.value === this.machineName())?.label ?? this.machineName());

  protected readonly crumbs = computed(() => crumbs(this.path() || '/', this.home() || '/'));
  protected readonly shownPath = computed(() => middleTruncate(tildePath(this.path(), this.home())));
  protected readonly pathMode = computed(() => looksLikePath(this.filter()));

  protected readonly rows = computed<Row[]>(() => {
    const text = this.filter().trim();
    if (text === '' || this.pathMode()) return this.entries().map((entry) => ({ entry, pieces: [{ text: entry.name, on: false }] }));
    const hits: { entry: FolderEntry; rank: number; indices: number[] }[] = [];
    for (const entry of this.entries()) {
      const m = fuzzyMatch(text, entry.name);
      if (m) hits.push({ entry, ...m });
    }
    hits.sort((a, b) => a.rank - b.rank);
    return hits.map((h) => ({ entry: h.entry, pieces: highlight(h.entry.name, h.indices) }));
  });

  /** The start view: no filter, home of this machine, and projects already use some folders. */
  protected readonly recent = computed(() => {
    if (this.machineName() !== '' || this.filter() !== '' || this.path() !== this.home()) return [];
    return recentFolders(this.store.spaces(), this.store.terminals()).map((path) => ({ path, label: tildePath(path, this.home()) }));
  });

  ngOnInit(): void {
    this.machineName.set(this.machine());
    const start = this.folder();
    void this.open(this.machine(), start.startsWith('/') ? start : null);
  }

  protected pick(chip: { value: string; online: boolean }): void {
    if (!chip.online || chip.value === this.machineName()) return;
    this.filter.set('');
    this.machineName.set(chip.value);
    this.home.set('');
    void this.open(chip.value, null);
  }

  protected enter(path: string): void {
    this.filter.set('');
    void this.open(this.machineName(), path);
  }

  protected retry(): void {
    void this.open(this.machineName(), this.path() || null);
  }

  protected setFilter(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
    this.typedProblem.set('');
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.pathMode()) return;
    this.typedProblem.set('');
    const target = resolveTyped(this.filter(), this.home());
    if (target === null) {
      this.typedProblem.set('Type an absolute path, or start with ~.');
      return;
    }
    const machine = this.machineName();
    try {
      if (!(await this.folders.isFolder(machine, target))) {
        this.typedProblem.set('That folder does not exist.');
        return;
      }
    } catch (error) {
      this.typedProblem.set(error instanceof FolderError ? error.message : 'Could not check that folder.');
      return;
    }
    if (machine !== this.machineName()) return;
    this.enter(target);
  }

  protected use(): void {
    if (this.status() === 'error' || this.path() === '') return;
    this.chosen.emit({ machine: this.machineName(), folder: this.path() });
  }

  private async open(machine: string, target: string | null): Promise<void> {
    const request = ++this.request;
    this.status.set('loading');
    this.problem.set('');
    this.typedProblem.set('');
    let path = target ?? '';
    try {
      const home = await this.folders.home(machine);
      if (request !== this.request) return;
      this.home.set(home);
      path = target ?? home;
      this.path.set(path);
      const listing = await this.folders.list(machine, path);
      if (request !== this.request) return;
      this.entries.set(listing.entries);
      this.more.set(listing.more);
      this.status.set('ready');
    } catch (error) {
      if (request !== this.request) return;
      if (path) this.path.set(path);
      this.entries.set([]);
      this.more.set(false);
      this.problem.set(error instanceof FolderError ? error.message : 'Could not read this folder.');
      this.status.set('error');
    }
  }
}
