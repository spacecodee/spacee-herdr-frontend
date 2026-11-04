import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideCircleAlert,
  lucideCopy,
  lucideEllipsis,
  lucideFile,
  lucideFileText,
} from '@ng-icons/lucide';
import { BrnPopover } from '@spartan-ng/brain/popover';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { MAX_DIFF_ROWS, type Scope } from '../../core/changes/changes-argv';
import { Changes, type ChangeFile } from '../../core/changes/changes';
import { treeOrder } from '../../core/changes/changes-tree';
import { addedRows, type DiffRow } from '../../core/changes/changes-parse';
import { splitPath } from '../../core/changes/changes-view';
import { injectProject } from '../../core/changes/project';
import { Files } from '../../core/files/files';
import { RemoteError } from '../../core/files/remote-exec';
import { middleTruncate } from '../../core/folders/folder-path';
import { SCOPES } from '../changes-screen/changes-screen';

type Phase = 'loading' | 'ready' | 'binary' | 'too-large' | 'empty' | 'error';

/** One changed file as a unified diff, with the other files of the list one tap away. */
@Component({
  selector: 'app-change-diff',
  imports: [RouterLink, NgIcon, ...HlmButtonImports, ...HlmPopoverImports, ...HlmSkeletonImports],
  viewProviders: [
    provideIcons({ lucideChevronLeft, lucideChevronRight, lucideCircleAlert, lucideCopy, lucideEllipsis, lucideFile, lucideFileText }),
  ],
  host: { class: 'fixed inset-0 flex flex-col bg-background' },
  styleUrl: './change-diff.css',
  templateUrl: './change-diff.html',
})
export class ChangeDiff {
  private readonly changes = inject(Changes);
  private readonly files = inject(Files);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly popover = viewChild(BrnPopover);
  protected readonly address = this.route.snapshot.paramMap.get('address') ?? '';
  private readonly project = injectProject(this.address);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  protected readonly scope = computed<Scope>(() => {
    const wanted = this.query().get('scope');
    return SCOPES.find((s) => s.id === wanted)?.id ?? 'unstaged';
  });
  protected readonly scopeLabel = computed(() => SCOPES.find((s) => s.id === this.scope())!.label);
  protected readonly path = computed(() => this.query().get('path') ?? '');
  protected readonly parts = computed(() => {
    const { name, dir } = splitPath(this.path());
    return { name, dir: middleTruncate(dir.replace(/\/$/, ''), 38) };
  });

  protected readonly phase = signal<Phase>('loading');
  protected readonly rows = signal<DiffRow[]>([]);
  protected readonly truncated = signal(false);
  protected readonly message = signal('');
  protected readonly siblings = signal<ChangeFile[]>([]);
  protected readonly top = signal('');
  protected readonly copied = signal(false);

  protected readonly index = computed(() => this.siblings().findIndex((f) => f.path === this.path()));
  protected readonly file = computed<ChangeFile | null>(() => this.siblings()[this.index()] ?? null);
  protected readonly position = computed(() => (this.index() < 0 ? '' : `File ${this.index() + 1} of ${this.siblings().length}`));
  protected readonly absolute = computed(() => (this.top() ? `${this.top()}/${this.path()}` : ''));
  protected readonly maxRows = MAX_DIFF_ROWS;

  private run = 0;

  constructor() {
    effect(() => {
      const cwd = this.project.cwd();
      const scope = this.scope();
      const path = this.path();
      if (cwd && path) untracked(() => void this.load(cwd, scope, path));
    });
  }

  protected step(by: -1 | 1): void {
    const next = this.siblings()[this.index() + by];
    if (!next) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { scope: this.scope(), path: next.path }, replaceUrl: true });
  }

  protected openFile(): void {
    this.popover()?.close();
    void this.router.navigate(['/t', this.address, 'file'], { queryParams: { path: this.absolute() } });
  }

  protected async copyPath(): Promise<void> {
    this.popover()?.close();
    try {
      await navigator.clipboard.writeText(this.absolute());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // clipboard blocked: nothing to do
    }
  }

  private async load(cwd: string, scope: Scope, path: string): Promise<void> {
    const run = ++this.run;
    const machine = this.project.machine;
    this.phase.set('loading');
    try {
      const repo = await this.changes.repo(machine, cwd);
      if (run !== this.run) return;
      if (!repo) {
        this.fail('This folder is not a git repository.');
        return;
      }
      this.top.set(repo.top);
      const list = this.changes.cached(machine, repo.top, scope) ?? (await this.changes.list(machine, repo.top, scope));
      if (run !== this.run) return;
      this.siblings.set(treeOrder(list.files));
      const file = list.files.find((f) => f.path === path);
      if (file?.binary) return this.show('binary');
      if (file?.untracked) {
        // Nothing to compare an untracked file with: its content is the change.
        const read = await this.files.read(machine, `${repo.top}/${path}`);
        if (run !== this.run) return;
        if (read.kind === 'binary') return this.show('binary');
        if (read.kind === 'too-large') return this.show('too-large');
        if (read.kind === 'not-found') return this.fail('This file is gone.');
        const { rows, truncated } = addedRows(read.text);
        return this.show(rows.length ? 'ready' : 'empty', rows, truncated);
      }
      const { rows, truncated } = await this.changes.diff(machine, repo.top, scope, path);
      if (run !== this.run) return;
      this.show(rows.length ? 'ready' : 'empty', rows, truncated);
    } catch (error) {
      if (run === this.run) this.fail(error instanceof RemoteError ? error.message : 'Could not read this diff.');
    }
  }

  private show(phase: Phase, rows: DiffRow[] = [], truncated = false): void {
    this.rows.set(rows);
    this.truncated.set(truncated);
    this.phase.set(phase);
  }

  private fail(message: string): void {
    this.message.set(message);
    this.phase.set('error');
  }
}
