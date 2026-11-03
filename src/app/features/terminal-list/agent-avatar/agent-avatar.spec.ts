import { TestBed } from '@angular/core/testing';
import { AgentAvatar } from './agent-avatar';

async function render(agent: string, status: string | null = null) {
  const fixture = TestBed.createComponent(AgentAvatar);
  fixture.componentRef.setInput('agent', agent);
  fixture.componentRef.setInput('status', status);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('AgentAvatar', () => {
  it('shows a glyph and a color class per agent', async () => {
    const claude = await render('claude');
    expect(claude.querySelector('[data-mark]')?.textContent?.trim()).toBe('C');
    expect(claude.querySelector('.mark-claude')).not.toBeNull();
    const pi = await render('pi');
    expect(pi.querySelector('[data-mark]')?.textContent?.trim()).toBe('π');
    expect((await render('whatever')).querySelector('.mark-whatever')).not.toBeNull();
  });

  it('is decoration for assistive technology', async () => {
    expect((await render('claude')).getAttribute('aria-hidden')).toBe('true');
  });

  it('puts a status dot on the corner for blocked, working and done only', async () => {
    expect((await render('claude', 'blocked')).querySelector('[data-dot].bg-status-blocked')).not.toBeNull();
    expect((await render('claude', 'done')).querySelector('[data-dot].bg-status-done')).not.toBeNull();
    const working = await render('claude', 'working');
    expect(working.querySelector('[data-dot].bg-status-working.dot-working')).not.toBeNull();
    expect((await render('claude', 'idle')).querySelector('[data-dot]')).toBeNull();
    expect((await render('claude')).querySelector('[data-dot]')).toBeNull();
  });
});
