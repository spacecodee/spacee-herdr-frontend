import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GroupSummary } from '../../../core/hc/group-summary';
import { COLLAPSED_KEY } from '../../../core/list/collapsed-groups';
import { ListSection } from './list-section';

@Component({
  imports: [ListSection],
  template: `<app-list-section
    sectionId="space:s1"
    name="Work"
    [level]="level()"
    [summary]="summary()"
    [note]="note()"
    ><p id="inner">content</p></app-list-section
  >`,
})
class Host {
  level = signal<2 | 3>(2);
  summary = signal<GroupSummary>({ total: 3, blocked: 0, working: 0 });
  note = signal<string | null>(null);
}

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

describe('ListSection', () => {
  let storage: Storage;
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  const el = () => fixture.nativeElement as HTMLElement;
  const trigger = () => el().querySelector<HTMLButtonElement>('button[aria-expanded]')!;
  const content = () => el().querySelector<HTMLElement>('[data-slot="collapsible-content"]')!;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is open by default, with the trigger inside a heading of the requested level', () => {
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().closest('h2')).not.toBeNull();
    expect(content().getAttribute('data-state')).toBe('open');
    fixture.componentInstance.level.set(3);
    fixture.detectChanges();
    expect(trigger().closest('h3')).not.toBeNull();
    expect(el().querySelector('h2')).toBeNull();
  });

  it('shows the name, the terminal count and the content', () => {
    expect(el().querySelector('[data-name]')?.textContent?.trim()).toBe('Work');
    expect(el().querySelector('[data-count]')?.textContent?.trim()).toBe('3');
    expect(el().querySelector('#inner')).not.toBeNull();
  });

  it('toggles with a click, keeping the control focusable and persisting the choice', () => {
    trigger().click();
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(content().getAttribute('data-state')).toBe('closed');
    expect(JSON.parse(storage.getItem(COLLAPSED_KEY)!)).toEqual(['space:s1']);
    trigger().click();
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(JSON.parse(storage.getItem(COLLAPSED_KEY)!)).toEqual([]);
  });

  it('starts collapsed when the stored state says so', () => {
    storage.setItem(COLLAPSED_KEY, '["space:s1"]');
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('calls out blocked terminals as "needs you", with a red dot', () => {
    fixture.componentInstance.summary.set({ total: 3, blocked: 1, working: 0 });
    fixture.detectChanges();
    const summary = el().querySelector('[data-summary]')!;
    expect(summary.textContent?.trim()).toBe('1 needs you');
    expect(summary.querySelector('[data-dot]')?.classList.contains('bg-status-blocked')).toBe(true);
  });

  it('shows working alone, both when both apply, and nothing when quiet', () => {
    expect(el().querySelector('[data-summary]')).toBeNull();
    fixture.componentInstance.summary.set({ total: 3, blocked: 0, working: 2 });
    fixture.detectChanges();
    expect(el().querySelector('[data-summary]')?.textContent?.trim()).toBe('2 working');
    fixture.componentInstance.summary.set({ total: 3, blocked: 1, working: 1 });
    fixture.detectChanges();
    const parts = Array.from(el().querySelectorAll('[data-summary]')).map((e) => e.textContent?.trim());
    expect(parts).toEqual(['1 working', '1 needs you']);
    expect(el().querySelector('[data-summary] [data-dot].bg-status-working')).not.toBeNull();
    expect(el().querySelector('[data-summary] [data-dot].bg-status-blocked')).not.toBeNull();
  });

  it('shows a machine state note when given', () => {
    fixture.componentInstance.note.set('unreachable');
    fixture.detectChanges();
    expect(el().textContent).toContain('unreachable');
  });
});
