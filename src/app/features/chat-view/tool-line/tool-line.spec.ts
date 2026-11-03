import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { ToolPart } from '../../../core/chat/types';
import { ToolLine } from './tool-line';

function render(part: ToolPart) {
  const fixture = TestBed.createComponent(ToolLine);
  fixture.componentRef.setInput('part', part);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}
const base: ToolPart = { type: 'tool', id: 't', name: 'Bash', summary: 'npm test', status: 'ok' };

describe('ToolLine', () => {
  it('shows the summary and a status in the label', () => {
    const el = render({ ...base, input: 'npm test', output: 'ok' });
    expect(el.textContent).toContain('npm test');
    expect(el.querySelector('button')?.getAttribute('aria-label')).toContain('Done');
  });

  it('running shows a spinner and error is labelled failed', () => {
    expect(render({ ...base, status: 'running' }).querySelector('.animate-spin')).not.toBeNull();
    const err = render({ ...base, status: 'error', input: 'x', output: 'boom' });
    expect(err.querySelector('button')?.getAttribute('aria-label')).toContain('Failed');
    expect(err.querySelector('[data-status="error"]')).not.toBeNull();
  });

  it('expands to input, output and the truncated notice', () => {
    const el = render({ ...base, input: 'cmd', output: 'out', truncated: true });
    el.querySelector<HTMLButtonElement>('button')!.click();
    TestBed.tick();
    expect(el.textContent).toContain('Input');
    expect(el.textContent).toContain('out');
    expect(el.textContent).toContain('Output truncated');
  });
});
