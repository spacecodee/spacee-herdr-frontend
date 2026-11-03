import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
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
});
