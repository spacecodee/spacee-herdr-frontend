import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatusLabel } from './status-label';

@Component({
  imports: [StatusLabel],
  template: `<app-status-label [state]="state" />`,
})
class Host {
  state = 'blocked';
}

describe('StatusLabel', () => {
  function render(state: string) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.state = state;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      label: el.querySelector('app-status-label')!,
      dot: el.querySelector('[data-dot]')!,
    };
  }

  it('always shows the state as text next to the dot', () => {
    for (const state of ['idle', 'working', 'done', 'blocked', 'error']) {
      expect(render(state).label.textContent?.trim()).toBe(state);
      TestBed.resetTestingModule();
    }
  });

  it('hides the decorative dot from assistive tech and colors it per state', () => {
    const { dot } = render('blocked');
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    expect(dot.classList.contains('bg-status-blocked')).toBe(true);
  });

  it('makes blocked stand out', () => {
    const { label } = render('blocked');
    expect(label.classList.contains('text-status-blocked-text')).toBe(true);
    expect(label.classList.contains('font-semibold')).toBe(true);
  });

  it('uses the matching text color for working and done, and idle for anything else', () => {
    expect(render('working').label.classList.contains('text-status-working-text')).toBe(true);
    TestBed.resetTestingModule();
    expect(render('done').label.classList.contains('text-status-done-text')).toBe(true);
    TestBed.resetTestingModule();
    const { label, dot } = render('whatever');
    expect(label.classList.contains('text-status-idle-text')).toBe(true);
    expect(dot.classList.contains('bg-status-idle')).toBe(true);
  });

  it('treats error like blocked so it is not missed', () => {
    const { dot } = render('error');
    expect(dot.classList.contains('bg-status-blocked')).toBe(true);
  });
});
