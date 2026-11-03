import { Service, computed, inject, signal, type Signal } from '@angular/core';
import { HcClient } from '../hc/hc-client';
import { execOn, textOf, type Ran } from '../files/remote-exec';
import {
  GIT_TIMEOUT_S,
  branchArgv,
  diffArgv,
  nameStatusArgv,
  numstatArgv,
  repoArgv,
  summaryArgv,
  untrackedArgv,
  untrackedCountArgv,
  type Scope,
} from './changes-argv';
import { parseDiff, parseNameStatus, parseNumstat, sumFiles, type NumstatFile, type ParsedDiff, type StatusLetter } from './changes-parse';

export interface RepoInfo {
  /** The repository's top folder: every path below is relative to it. */
  top: string;
  branch: string;
}

export interface ChangeFile extends NumstatFile {
  status: StatusLetter;
  /** Not tracked by git yet: shown as added, and its "diff" is the file itself. */
  untracked: boolean;
}

export interface Totals {
  files: number;
  added: number;
  deleted: number;
}

export interface FileList {
  files: ChangeFile[];
  total: Totals;
}

/** The chip never asks git more often than this. */
export const MIN_GAP_MS = 15_000;

const key = (machine: string, dir: string) => `${machine}\0${dir}`;
const lines = (text: string): string[] => text.split('\n').filter((l) => l !== '');

/** Git state of a project folder, read with core's `machine.exec` on the terminal's machine. Read-only. */
@Service()
export class Changes {
  private readonly client = inject(HcClient);
  private readonly sums = signal<Record<string, Totals | null>>({});
  private readonly lastRun = new Map<string, number>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly lists = new Map<string, FileList>();

  private run(machine: string, argv: string[]): Promise<Ran> {
    return execOn(this.client, machine, argv, GIT_TIMEOUT_S);
  }

  /** Null when `dir` is not inside a git repository. */
  async repo(machine: string, dir: string): Promise<RepoInfo | null> {
    const top = await this.run(machine, repoArgv(dir));
    const path = textOf(top.stdout).trim();
    if (top.code !== 0 || !path.startsWith('/')) return null;
    const branch = await this.run(machine, branchArgv(path));
    return { top: path, branch: textOf(branch.stdout).trim() };
  }

  async list(machine: string, top: string, scope: Scope): Promise<FileList> {
    const [numstat, names] = await Promise.all([
      this.run(machine, numstatArgv(top, scope)),
      this.run(machine, nameStatusArgv(top, scope)),
    ]);
    const status = parseNameStatus(textOf(names.stdout));
    const files: ChangeFile[] = parseNumstat(textOf(numstat.stdout)).map((f) => ({
      ...f,
      status: status.get(f.path) ?? 'M',
      untracked: false,
    }));
    if (scope === 'unstaged') files.push(...(await this.untracked(machine, top)));
    const list = { files, total: sumFiles(files) };
    this.lists.set(`${key(machine, top)}\0${scope}`, list);
    return list;
  }

  /** The last list read for this scope, so the diff screen can step through files without asking git again. */
  cached(machine: string, top: string, scope: Scope): FileList | undefined {
    return this.lists.get(`${key(machine, top)}\0${scope}`);
  }

  private async untracked(machine: string, top: string): Promise<ChangeFile[]> {
    const [names, counts] = await Promise.all([
      this.run(machine, untrackedArgv(top)),
      this.run(machine, untrackedCountArgv(top)),
    ]);
    const paths = textOf(names.stdout).split('\0').filter((p) => p !== '');
    if (paths.length === 0) return [];
    // `wc -l` prints `  N path`; a path that cannot be matched keeps a count of 0.
    const counted = new Map<string, number>();
    for (const line of lines(textOf(counts.stdout))) {
      const m = /^\s*(\d+) (.+)$/.exec(line);
      if (m) counted.set(m[2], Number(m[1]));
    }
    return paths.map((path) => ({ path, added: counted.get(path) ?? 0, deleted: 0, binary: false, status: 'A', untracked: true }));
  }

  /** What differs from HEAD in the whole repository, or null when it is clean or not a repository. */
  async summary(machine: string, dir: string): Promise<Totals | null> {
    const repo = await this.repo(machine, dir);
    if (!repo) return null;
    let tracked = await this.run(machine, summaryArgv(repo.top));
    // No HEAD yet (nothing committed): the staged files are all there is.
    if (tracked.code !== 0) tracked = await this.run(machine, numstatArgv(repo.top, 'staged'));
    const files = parseNumstat(textOf(tracked.stdout));
    files.push(...(await this.untracked(machine, repo.top)));
    const total = sumFiles(files);
    return total.files === 0 ? null : total;
  }

  /** The last summary of `dir`, for the header chip. Null: nothing to show. */
  summaryOf(machine: string, dir: string): Signal<Totals | null> {
    return computed(() => this.sums()[key(machine, dir)] ?? null);
  }

  /**
   * Updates `summaryOf`, at most once per `MIN_GAP_MS` per folder. A call inside the window waits for
   * its end and runs once, so the end of an agent's turn is never lost.
   */
  refresh(machine: string, dir: string): Promise<void> {
    const k = key(machine, dir);
    const waiting = this.pending.get(k);
    if (waiting) return waiting;
    const wait = Math.max(0, (this.lastRun.get(k) ?? -Infinity) + MIN_GAP_MS - Date.now());
    const job = (async () => {
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRun.set(k, Date.now());
      try {
        const total = await this.summary(machine, dir);
        this.sums.update((all) => ({ ...all, [k]: total }));
      } catch {
        // An unreachable machine just leaves the chip hidden.
      } finally {
        this.pending.delete(k);
      }
    })();
    this.pending.set(k, job);
    return job;
  }

  /** The diff of one tracked file, as rows. */
  async diff(machine: string, top: string, scope: Scope, path: string): Promise<ParsedDiff> {
    const r = await this.run(machine, diffArgv(top, scope, path));
    return parseDiff(textOf(r.stdout));
  }
}
