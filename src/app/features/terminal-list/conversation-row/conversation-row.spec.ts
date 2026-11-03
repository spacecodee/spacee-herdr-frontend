import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Conversation } from '../../../core/list/conversations';
import { ConversationRow } from './conversation-row';

const NOW = new Date(2026, 10, 2, 14, 30).getTime();
const base: Conversation = {
  address: 'rohan/t7',
  title: 'Fix login',
  preview: 'You: please retry',
  meta: 'Backend · rohan/t7',
  agent: 'claude',
  status: 'idle',
  time: NOW - 5 * 60_000,
};

async function render(extra: Partial<Conversation> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ConversationRow);
  fixture.componentRef.setInput('conversation', { ...base, ...extra });
  fixture.componentRef.setInput('now', NOW);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ConversationRow', () => {
  it('shows title, relative time, preview and meta', async () => {
    const el = await render();
    expect(el.querySelector('[data-title]')?.textContent?.trim()).toBe('Fix login');
    expect(el.querySelector('[data-time]')?.textContent?.trim()).toBe('5m');
    expect(el.querySelector('[data-preview]')?.textContent?.trim()).toBe('You: please retry');
    expect(el.querySelector('[data-meta]')?.textContent?.trim()).toBe('Backend · rohan/t7');
  });

  it('links to the terminal with the address as one path segment', async () => {
    const link = (await render()).querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/t/rohan%2Ft7');
  });

  it('names the link after the title, agent and any non-idle status', async () => {
    expect((await render()).querySelector('a')?.getAttribute('aria-label')).toBe('Fix login, Claude');
    const blocked = await render({ status: 'blocked', agent: 'pi' });
    expect(blocked.querySelector('a')?.getAttribute('aria-label')).toBe('Fix login, pi, blocked');
  });

  it('shows Working… instead of the preview while the agent works', async () => {
    const el = await render({ status: 'working' });
    expect(el.querySelector('[data-preview]')?.textContent?.replace(/\s/g, '')).toBe('Working...');
    expect(el.textContent).not.toContain('please retry');
  });

  it('leaves out the time and the preview when there are none', async () => {
    const el = await render({ time: null, preview: '' });
    expect(el.querySelector('[data-time]')).toBeNull();
    expect(el.querySelector('[data-preview]')).toBeNull();
  });
});
