import { Component, Injector, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { renderMarkdown } from '../../../core/chat/markdown';
import { linkFilePaths, resolveFilePath } from '../../../core/files/file-links';
import { TerminalStore } from '../../../core/hc/terminal-store';

/** Renders transcript markdown. `renderMarkdown` sanitizes (DOMPurify), so the result is trusted here. */
@Component({
  selector: 'app-markdown-block',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'md block min-w-0', '(click)': 'onClick($event)' },
  styleUrl: './markdown-block.css',
  templateUrl: './markdown-block.html',
})
export class MarkdownBlock {
  readonly source = input.required<string>();
  /** The terminal this text belongs to. With it, file paths in the text open in the file viewer. */
  readonly address = input('');
  private readonly sanitizer = inject(DomSanitizer);
  private readonly injector = inject(Injector);

  protected readonly html = computed<SafeHtml>(() => {
    const html = renderMarkdown(this.source());
    // `linkFilePaths` only wraps text in links it builds itself, so the sanitized markup stays safe.
    return this.sanitizer.bypassSecurityTrustHtml(this.address() ? linkFilePaths(html) : html);
  });

  /** The copy buttons inside rendered code blocks are plain HTML, so the click is delegated. */
  protected onClick(event: Event): void {
    const link = (event.target as Element | null)?.closest<HTMLElement>('[data-file]');
    if (link) {
      event.preventDefault();
      this.openFile(link.dataset['file'] ?? '');
      return;
    }
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-copy]');
    if (!button) return;
    const code = button.closest('.md-code')?.querySelector('code')?.textContent ?? '';
    void navigator.clipboard?.writeText(code).then(
      () => {
        button.textContent = 'Copied';
        setTimeout(() => (button.textContent = 'Copy'), 2000);
      },
      () => undefined,
    );
  }

  /** The store and router are read on the tap, so a block that never shows a path never needs them. */
  private openFile(link: string): void {
    const address = this.address();
    const cwd = this.injector.get(TerminalStore).terminals().find((t) => t.address === address)?.cwd ?? '';
    const path = resolveFilePath(link, cwd);
    if (path) void this.injector.get(Router).navigate(['/t', address, 'file'], { queryParams: { path } });
  }
}
