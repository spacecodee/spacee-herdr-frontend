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
  it.each([
    ['claude', '/agents/claude-color.svg'],
    ['codex', '/agents/codex-color.svg'],
    ['opencode', '/agents/opencode.svg'],
    ['antigravity', '/agents/antigravity-color.svg'],
    ['gemini', '/agents/gemini-color.svg'],
    ['pi', '/agents/pi-96.webp'],
  ])('shows the real icon for %s as a decorative image', async (agent, src) => {
    const img = (await render(agent)).querySelector('[data-mark] img');
    expect(img?.getAttribute('src')).toBe(src);
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('width')).not.toBeNull();
    expect(img?.getAttribute('height')).not.toBeNull();
  });

  it('serves the pi rose at 2x', async () => {
    const img = (await render('pi')).querySelector('[data-mark] img');
    expect(img?.getAttribute('srcset')).toBe('/agents/pi-96.webp 1x, /agents/pi-192.webp 2x');
  });

  it('marks the monochrome opencode icon so it follows the theme', async () => {
    expect((await render('opencode')).querySelector('[data-mark] img.icon-mono')).not.toBeNull();
    expect((await render('claude')).querySelector('[data-mark] img.icon-mono')).toBeNull();
  });

  it('shows a program glyph instead of >_ for a shell running a known program', async () => {
    const fixture = TestBed.createComponent(AgentAvatar);
    fixture.componentRef.setInput('agent', 'shell');
    fixture.componentRef.setInput('program', 'editor');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-program]')).not.toBeNull();
    expect(el.querySelector('[data-mark]')?.textContent).not.toContain('>_');
    expect(el.querySelector('.mark-shell')).not.toBeNull();
  });

  it('keeps the glyph for the shell and unknown agents', async () => {
    const shell = await render('shell');
    expect(shell.querySelector('[data-mark]')?.textContent?.trim()).toBe('>_');
    expect(shell.querySelector('img')).toBeNull();
    const generic = await render('generic');
    expect(generic.querySelector('[data-mark]')?.textContent?.trim()).toBe('AI');
    expect(generic.querySelector('img')).toBeNull();
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
