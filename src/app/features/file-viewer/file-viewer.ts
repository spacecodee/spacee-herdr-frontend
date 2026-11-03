import { Location } from '@angular/common';
import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideChevronLeft,
  lucideChevronUp,
  lucideCircleAlert,
  lucideCopy,
  lucideEllipsis,
  lucideFile,
  lucideSearch,
} from '@ng-icons/lucide';
import { BrnPopover } from '@spartan-ng/brain/popover';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { crumbsOf, linesText, splitPath } from '../../core/changes/changes-view';
import { injectProject } from '../../core/changes/project';
import { findMatches, segmentLine, type LineMatch, type Segment } from '../../core/files/file-search';
import { Files, type FileResult } from '../../core/files/files';
import { highlight, languageOf } from '../../core/files/highlight';
import { RemoteError } from '../../core/files/remote-exec';
import { middleTruncate } from '../../core/folders/folder-path';

type Phase = 'loading' | 'text' | 'binary' | 'too-large' | 'not-found' | 'error';

/** A text file on the terminal's machine, read-only: line numbers, light syntax colors, search. */
@Component({
  selector: 'app-file-viewer',
  imports: [NgIcon, ...HlmButtonImports, ...HlmPopoverImports, ...HlmSkeletonImports],
  viewProviders: [
    provideIcons({ lucideChevronDown, lucideChevronLeft, lucideChevronUp, lucideCircleAlert, lucideCopy, lucideEllipsis, lucideFile, lucideSearch }),
  ],
  host: { class: 'fixed inset-0 flex flex-col bg-background' },
  styleUrl: './file-viewer.css',
  templateUrl: './file-viewer.html',
})
export class FileViewer {
  private readonly files = inject(Files);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly popover = viewChild(BrnPopover);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  protected readonly address = this.route.snapshot.paramMap.get('address') ?? '';
  private readonly project = injectProject(this.address);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  protected readonly path = computed(() => this.query().get('path') ?? '');
  protected readonly parts = computed(() => splitPath(this.path()));
  protected readonly crumbs = computed(() => crumbsOf(this.path(), this.project.cwd()));
  protected readonly folderText = computed(() => middleTruncate(this.parts().dir.replace(/\/$/, '') || '/', 38));

  protected readonly phase = signal<Phase>('loading');
  protected readonly text = signal('');
  protected readonly cut = signal(false);
  protected readonly message = signal('');
  protected readonly copied = signal(false);

  private readonly language = computed(() => languageOf(this.path()));
  /** Colored tokens per line; computed once per file, search never redoes it. */
  private readonly tokens = computed(() => {
    const lines = highlight(this.text(), this.path());
    // The newline that ends the file does not start another line.
    if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
    return lines;
  });
  private readonly plain = computed(() => this.tokens().map((line) => line.map((t) => t.text).join('')));
  protected readonly subtitle = computed(() => linesText(this.tokens().length, this.language().label));

  protected readonly term = signal('');
  protected readonly matches = computed(() => findMatches(this.plain(), this.term()));
  protected readonly at = signal(0);
  protected readonly counter = computed(() => {
    if (this.term() === '') return '';
    const n = this.matches().length;
    return n === 0 ? 'No matches' : `${this.at() + 1} of ${n}`;
  });

  protected readonly rows = computed<{ n: number; segments: Segment[] }[]>(() => {
    const byLine = new Map<number, LineMatch[]>();
    this.matches().forEach((m, i) => {
      const list = byLine.get(m.line) ?? [];
      list.push({ start: m.start, end: m.end, current: i === this.at() });
      byLine.set(m.line, list);
    });
    return this.tokens().map((tokens, i) => ({
      n: i + 1,
      segments: segmentLine(tokens, byLine.get(i) ?? []),
    }));
  });

  private run = 0;

  constructor() {
    effect(() => {
      const path = this.path();
      const cwd = this.project.cwd();
      // A relative path means a link that was made before the folder was known; it needs the folder.
      if (path.startsWith('/') || cwd) untracked(() => void this.load(path));
    });
    // A new query starts at its first match; moving to a match brings it into view.
    effect(() => {
      this.term();
      untracked(() => this.at.set(0));
    });
    effect(() => {
      this.at();
      if (this.matches().length > 0) {
        afterNextRender(() => this.scroller()?.nativeElement.querySelector('[data-current]')?.scrollIntoView({ block: 'center' }), {
          injector: this.injector,
        });
      }
    });
  }

  /** Back to where the link was tapped (the chat or a diff); a deep link has no history, so it goes to the conversation. */
  protected back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigate(['/t', this.address]);
  }

  protected setQuery(value: string): void {
    this.term.set(value);
  }

  protected move(by: -1 | 1): void {
    const n = this.matches().length;
    if (n > 0) this.at.set((this.at() + by + n) % n);
  }

  protected async copyPath(): Promise<void> {
    this.popover()?.close();
    try {
      await navigator.clipboard.writeText(this.path());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // clipboard blocked: the path stays on screen
    }
  }

  private async load(path: string): Promise<void> {
    const run = ++this.run;
    this.phase.set('loading');
    this.term.set('');
    try {
      const result: FileResult = await this.files.read(this.project.machine, path);
      if (run !== this.run) return;
      if (result.kind === 'text') {
        this.text.set(result.text);
        this.cut.set(result.truncated);
        this.phase.set('text');
      } else {
        this.phase.set(result.kind);
      }
    } catch (error) {
      if (run !== this.run) return;
      this.message.set(error instanceof RemoteError ? error.message : 'Could not read this file.');
      this.phase.set('error');
    }
  }
}
