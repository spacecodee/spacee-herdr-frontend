import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ViewHeader } from './view-header';

describe('ViewHeader', () => {
  function setup(mode: 'chat' | 'terminal' = 'chat') {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ViewHeader);
    fixture.componentRef.setInput('heading', 'api');
    fixture.componentRef.setInput('agent', 'claude');
    fixture.componentRef.setInput('line', { text: 'Working', tone: 'working' });
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the name, one status line, the avatar and a way back', () => {
    const { el } = setup();
    expect(el.querySelector('[data-heading]')?.textContent?.trim()).toBe('api');
    expect(el.querySelector('[data-connection]')?.textContent?.trim()).toBe('Working');
    expect(el.querySelector('app-agent-avatar')).not.toBeNull();
    expect(el.querySelector('a')?.getAttribute('aria-label')).toBe('Back to terminals');
  });

  it('colors the status dot by tone', () => {
    const { fixture, el } = setup();
    expect(el.querySelector('[data-dot]')?.classList.contains('bg-status-working')).toBe(true);
    fixture.componentRef.setInput('line', { text: 'Blocked', tone: 'blocked' });
    fixture.detectChanges();
    expect(el.querySelector('[data-dot]')?.classList.contains('bg-status-blocked')).toBe(true);
  });

  it('the segmented control marks the current mode and emits the other one', () => {
    const { fixture, el } = setup('chat');
    const chat = el.querySelector<HTMLButtonElement>('[data-view="chat"]')!;
    const terminal = el.querySelector<HTMLButtonElement>('[data-view="terminal"]')!;
    expect(chat.textContent?.trim()).toBe('Chat');
    expect(chat.getAttribute('aria-pressed')).toBe('true');
    expect(terminal.getAttribute('aria-pressed')).toBe('false');
    const emitted: string[] = [];
    fixture.componentInstance.modeChange.subscribe((m) => emitted.push(m));
    terminal.click();
    expect(emitted).toEqual(['terminal']);
  });
});
