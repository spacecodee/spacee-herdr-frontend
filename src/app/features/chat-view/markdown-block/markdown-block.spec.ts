import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { TerminalStore } from '../../../core/hc/terminal-store';
import { MarkdownBlock } from './markdown-block';

describe('MarkdownBlock', () => {
  it('renders markdown and copies a code block', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = TestBed.createComponent(MarkdownBlock);
    fixture.componentRef.setInput('source', '**hi**\n\n```sh\necho 1\n```');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('strong')?.textContent).toBe('hi');
    el.querySelector<HTMLButtonElement>('[data-copy]')!.click();
    expect(writeText).toHaveBeenCalledWith('echo 1');
  });

  describe('file links', () => {
    const terminals = signal([{ address: 'rohan/t7', cwd: '/home/me/proj' }]);
    const navigate = vi.fn(() => Promise.resolve(true));

    function render(source: string, address = 'rohan/t7') {
      TestBed.configureTestingModule({
        providers: [
          { provide: Router, useValue: { navigate } },
          { provide: TerminalStore, useValue: { terminals } },
        ],
      });
      const fixture = TestBed.createComponent(MarkdownBlock);
      fixture.componentRef.setInput('source', source);
      fixture.componentRef.setInput('address', address);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    beforeEach(() => navigate.mockClear());

    it('links a relative path and opens it in the viewer, resolved against the terminal folder', () => {
      const el = render('I changed src/app/settings.ts and the tests pass.');
      const link = el.querySelector<HTMLAnchorElement>('a.file-link')!;
      expect(link.textContent).toBe('src/app/settings.ts');
      link.click();
      expect(navigate).toHaveBeenCalledWith(['/t', 'rohan/t7', 'file'], { queryParams: { path: '/home/me/proj/src/app/settings.ts' } });
    });

    it('opens an absolute path as it is, also from inline code', () => {
      const el = render('See `/etc/nginx/nginx.conf:12`.');
      el.querySelector<HTMLAnchorElement>('a.file-link')!.click();
      expect(navigate).toHaveBeenCalledWith(['/t', 'rohan/t7', 'file'], { queryParams: { path: '/etc/nginx/nginx.conf' } });
    });

    it('leaves URLs and code blocks alone', () => {
      const el = render('Open https://example.com/a/b.html\n\n```\nsrc/a.ts\n```');
      expect(el.querySelector('a.file-link')).toBeNull();
    });

    it('does not link anything without a terminal (user messages, other uses)', () => {
      const el = render('src/app/settings.ts', '');
      expect(el.querySelector('a.file-link')).toBeNull();
    });
  });
});
