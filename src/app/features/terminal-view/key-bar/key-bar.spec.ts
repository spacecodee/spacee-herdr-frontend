import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BarKey } from '../../../core/xterm/key-bytes';
import { KeyBar } from './key-bar';

@Component({
  imports: [KeyBar],
  template: `<app-key-bar
    [disabled]="disabled()"
    [mode]="mode()"
    [(ctrl)]="ctrl"
    (key)="keys.push($event)"
    (modeToggle)="toggles = toggles + 1"
  />`,
})
class Host {
  disabled = signal(false);
  ctrl = signal(false);
  mode = signal<'compose' | 'direct'>('compose');
  toggles = 0;
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

  it('renders the keys in order with accessible names', () => {
    expect(buttons().map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())).toEqual([
      'Direct typing',
      'Esc',
      'Tab',
      'Ctrl',
      'Arrow left',
      'Arrow up',
      'Arrow down',
      'Arrow right',
      'Enter',
    ]);
    const bar = fixture.nativeElement.querySelector('[role="toolbar"]');
    expect(bar.getAttribute('aria-label')).toBe('Terminal keys');
  });

  it('emits the key on click', () => {
    const [, esc, tab, , left, up, down, right, enter] = buttons();
    for (const b of [esc, tab, left, up, down, right, enter]) b.click();
    expect(fixture.componentInstance.keys).toEqual([
      'esc',
      'tab',
      'left',
      'up',
      'down',
      'right',
      'enter',
    ]);
  });

  it('toggles Ctrl and aria-pressed without emitting', () => {
    const ctrl = buttons()[3];
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

  it('disables every key but not the mode toggle', () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    const [toggle, ...keys] = buttons();
    expect(keys.every((b) => b.disabled)).toBe(true);
    expect(toggle.disabled).toBe(false);
  });

  it('shows the mode toggle: name and aria-pressed follow the mode, click emits', () => {
    const toggle = buttons()[0];
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Direct typing');
    toggle.click();
    expect(fixture.componentInstance.toggles).toBe(1);
    fixture.componentInstance.mode.set('direct');
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Message input');
    expect(fixture.componentInstance.keys).toEqual([]);
  });
});
