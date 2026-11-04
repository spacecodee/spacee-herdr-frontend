import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronLeft,
  lucideChevronRight,
  lucideCircleAlert,
  lucideFolder,
  lucideGitBranch,
  lucideRefreshCw,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import type { Scope } from '../../core/changes/changes-argv';
import { Changes, type ChangeFile, type FileList, type RepoInfo } from '../../core/changes/changes';
import { buildTree, type FolderNode, type TreeNode } from '../../core/changes/changes-tree';
import { changedText } from '../../core/changes/changes-view';
import { injectProject } from '../../core/changes/project';
import { RemoteError } from '../../core/files/remote-exec';

/** Deeper folders stop indenting here so a long path never squeezes the name off a phone. */
const MAX_INDENT = 4;
const INDENT_REM = 0.875;

type Phase = 'loading' | 'not-repo' | 'error' | 'ready';

export const SCOPES: readonly { id: Scope; label: string }[] = [
  { id: 'unstaged', label: 'Unstaged' },
  { id: 'staged', label: 'Staged' },
  { id: 'commit', label: 'Last commit' },
];

const EMPTY: Record<Scope, { title: string; text: string }> = {
  unstaged: { title: 'No changes', text: 'The working tree is clean.' },
  staged: { title: 'Nothing staged', text: 'Staged changes will show up here.' },
  commit: { title: 'No commits yet', text: 'The last commit will show up here.' },
};

const BADGE: Record<string, string> = {
  M: 'bg-muted text-status-working-text',
  A: 'bg-pill-done text-pill-done-ink',
  D: 'bg-pill-blocked text-pill-blocked-ink',
  R: 'bg-muted text-foreground',
};

type Row =
  | { kind: 'folder'; key: string; folder: FolderNode; indent: number; open: boolean }
  | { kind: 'file'; key: string; name: string; file: ChangeFile; indent: number; badge: string };

/** What git sees in the terminal's project folder: unstaged, staged and the last commit, file by file. */
@Component({
  selector: 'app-changes-screen',
  imports: [RouterLink, NgIcon, ...HlmButtonImports, ...HlmSkeletonImports],
  viewProviders: [provideIcons({ lucideCheck, lucideChevronLeft, lucideChevronRight, lucideCircleAlert, lucideFolder, lucideGitBranch, lucideRefreshCw })],
  host: { class: 'block' },
  styleUrl: './changes-screen.css',
  templateUrl: './changes-screen.html',
})
export class ChangesScreen {
  private readonly changes = inject(Changes);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly address = this.route.snapshot.paramMap.get('address') ?? '';
  private readonly project = injectProject(this.address);

  protected readonly scopes = SCOPES;
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly scope = computed<Scope>(() => {
    const wanted = this.query().get('scope');
    return SCOPES.find((s) => s.id === wanted)?.id ?? 'unstaged';
  });

  protected readonly phase = signal<Phase>('loading');
  protected readonly repo = signal<RepoInfo | null>(null);
  protected readonly list = signal<FileList | null>(null);
  protected readonly message = signal('');
  protected readonly busy = signal(false);

  protected readonly summary = computed(() => {
    const total = this.list()?.total;
    return total ? changedText(total.files) : '';
  });
  protected readonly empty = computed(() => EMPTY[this.scope()]);
  private readonly tree = computed(() => buildTree(this.list()?.files ?? []));
  /** Folders the user folded in this visit; everything starts open. */
  private readonly folded = signal<ReadonlySet<string>>(new Set());
  /** The visible rows top to bottom: a folded folder keeps its own row and drops what is below it. */
  protected readonly rows = computed(() => {
    const folded = this.folded();
    const out: Row[] = [];
    const walk = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        const indent = Math.min(node.depth, MAX_INDENT) * INDENT_REM;
        if (node.kind === 'file') {
          out.push({ kind: 'file', key: node.file.path, name: node.name, file: node.file, indent, badge: BADGE[node.file.status] });
          continue;
        }
        const open = !folded.has(node.path);
        out.push({ kind: 'folder', key: node.path, folder: node, indent, open });
        if (open) walk(node.children);
      }
    };
    walk(this.tree());
    return out;
  });

  private run = 0;
  private loadedScope: Scope | null = null;

  constructor() {
    effect(() => {
      const cwd = this.project.cwd();
      const scope = this.scope();
      if (cwd) untracked(() => void this.load(cwd, scope));
    });
  }

  protected setScope(scope: Scope): void {
    if (scope !== this.scope()) void this.router.navigate([], { relativeTo: this.route, queryParams: { scope }, replaceUrl: true });
  }

  protected refresh(): void {
    const cwd = this.project.cwd();
    if (cwd) void this.load(cwd, this.scope());
  }

  protected toggle(path: string): void {
    this.folded.update((set) => {
      const next = new Set(set);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  protected fileQuery(file: ChangeFile): Record<string, string> {
    return { scope: this.scope(), path: file.path };
  }

  private async load(cwd: string, scope: Scope): Promise<void> {
    const run = ++this.run;
    this.busy.set(true);
    // Another tab must not show the old tab's files while its own load runs.
    if (scope !== this.loadedScope) this.list.set(null);
    if (!this.list()) this.phase.set('loading');
    try {
      const repo = await this.changes.repo(this.project.machine, cwd);
      if (run !== this.run) return;
      if (!repo) {
        this.repo.set(null);
        this.phase.set('not-repo');
        return;
      }
      const list = await this.changes.list(this.project.machine, repo.top, scope);
      if (run !== this.run) return;
      this.repo.set(repo);
      this.list.set(list);
      this.loadedScope = scope;
      this.phase.set('ready');
    } catch (error) {
      if (run !== this.run) return;
      this.message.set(error instanceof RemoteError ? error.message : 'Could not read the changes.');
      this.phase.set('error');
    } finally {
      if (run === this.run) this.busy.set(false);
    }
  }
}
