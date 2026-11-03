import { Component, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { renderMarkdown } from '../../../core/chat/markdown';

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
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly html = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(this.source())),
  );

  /** The copy buttons inside rendered code blocks are plain HTML, so the click is delegated. */
  protected onClick(event: Event): void {
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
}
