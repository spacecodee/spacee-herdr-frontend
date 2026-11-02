import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BarKey } from '../../../core/xterm/key-bytes';
import { KeyBar } from './key-bar';

@Component({
  imports: [KeyBar],
  template: `<app-key-bar [disabled]="disabled()" [(ctrl)]="ctrl" (key)="keys.push($event)" />`,
})
class Host {
  disabled = signal(false);
  ctrl = signal(false);
  keys: BarKey[] = [];
}

describe('KeyBar', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  const buttons = () =>
    Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('renders the seven keys in order with accessible names', () => {
    expect(buttons().map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())).toEqual([
      'Esc',
      'Tab',
      'Ctrl',
      'Arrow left',
      'Arrow up',
      'Arrow down',
      'Arrow right',
    ]);
    const bar = fixture.nativeElement.querySelector('[role="toolbar"]');
    expect(bar.getAttribute('aria-label')).toBe('Terminal keys');
  });

  it('emits the key on click', () => {
    const [esc, tab, , left, up, down, right] = buttons();
    for (const b of [esc, tab, left, up, down, right]) b.click();
    expect(fixture.componentInstance.keys).toEqual(['esc', 'tab', 'left', 'up', 'down', 'right']);
  });

  it('toggles Ctrl and aria-pressed without emitting', () => {
    const ctrl = buttons()[2];
    expect(ctrl.getAttribute('aria-pressed')).toBe('false');
    ctrl.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.ctrl()).toBe(true);
    expect(ctrl.getAttribute('aria-pressed')).toBe('true');
    ctrl.click();
    fixture.detectChanges();
    expect(ctrl.getAttribute('aria-pressed')).toBe('false');
    expect(fixture.componentInstance.keys).toEqual([]);
  });

  it('keeps focus on the terminal by cancelling pointerdown and mousedown', () => {
    for (const type of ['pointerdown', 'mousedown']) {
      const event = new Event(type, { cancelable: true, bubbles: true });
      buttons()[0].dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('disables every button', () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });
});
