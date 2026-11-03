import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ViewModes } from '../../../core/chat/view-mode';
import type { Conversation } from '../../../core/list/conversations';
import { LayoutActions } from '../../../core/layout/layout-actions';
import { RowMenu } from './row-menu';

const NOW = new Date(2026, 10, 2, 14, 30).getTime();
const chat: Conversation = {
  kind: 'chat',
  address: 'rohan/t7',
  title: 'Fix login',
  preview: 'You: please retry',
  program: null,
  agent: 'claude',
  status: 'idle',
  time: NOW - 5 * 60_000,
};
const rect = { top: 200, left: 0, width: 393, height: 64, bottom: 264, right: 393 } as DOMRect;

async function setup(conversation: Conversation = chat) {
  const actions = { askRename: vi.fn(), askSplit: vi.fn(), askClose: vi.fn() };
  const viewModes = { set: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LayoutActions, useValue: actions },
      { provide: ViewModes, useValue: viewModes },
    ],
  });
  const fixture = TestBed.createComponent(RowMenu);
  fixture.componentRef.setInput('conversation', conversation);
  fixture.componentRef.setInput('now', NOW);
  fixture.componentRef.setInput('rect', rect);
  const dismissed = vi.fn();
  fixture.componentInstance.dismissed.subscribe(dismissed);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const item = (text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('[role="group"] button')).find((b) => b.textContent?.includes(text))!;
  return { fixture, el, actions, viewModes, dismissed, item, router: TestBed.inject(Router) };
}

describe('RowMenu', () => {
  it('is a modal dialog named after the row, over a scrim, with a static copy of the row', async () => {
    const { el } = await setup();
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Actions for Fix login');
    expect(el.querySelector('[data-scrim]')).not.toBeNull();
    expect(el.querySelector('app-conversation-row [data-title]')?.textContent?.trim()).toBe('Fix login');
    expect(el.querySelector('app-conversation-row a')).toBeNull();
  });

  it('lists every row action, with Open terminal for agents only', async () => {
    const { el } = await setup();
    const names = Array.from(el.querySelectorAll('[role="group"] button')).map((b) => b.textContent?.trim());
    expect(names).toEqual(['Open terminal', 'Split right', 'Split down', 'Rename', 'Close']);
    TestBed.resetTestingModule();
    const shell = await setup({ ...chat, kind: 'shell', agent: 'shell' });
    const shellNames = Array.from(shell.el.querySelectorAll('[role="group"] button')).map((b) => b.textContent?.trim());
    expect(shellNames).toEqual(['Split right', 'Split down', 'Rename', 'Close']);
  });

  it('runs rename, split and close through the layout actions and dismisses', async () => {
    const { item, actions, dismissed } = await setup();
    item('Rename').click();
    expect(actions.askRename).toHaveBeenCalledWith('rohan/t7');
    item('Split down').click();
    expect(actions.askSplit).toHaveBeenCalledWith('rohan/t7', 'down');
    item('Close').click();
    expect(actions.askClose).toHaveBeenCalledWith('rohan/t7');
    expect(dismissed).toHaveBeenCalledTimes(3);
  });

  it('opens the terminal view of an agent', async () => {
    const { item, viewModes, router, dismissed } = await setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    item('Open terminal').click();
    expect(viewModes.set).toHaveBeenCalledWith('rohan/t7', 'terminal');
    expect(navigate).toHaveBeenCalledWith(['/t', 'rohan/t7']);
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('closes on the scrim and on Escape, without acting', async () => {
    const { el, fixture, actions, dismissed } = await setup();
    el.querySelector<HTMLElement>('[data-scrim]')!.click();
    expect(dismissed).toHaveBeenCalledTimes(1);
    el.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismissed).toHaveBeenCalledTimes(2);
    expect(actions.askClose).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('ignores the release click of the long press that opened it, but not a tap on the scrim', async () => {
    const { el, dismissed } = await setup();
    const scrim = el.querySelector<HTMLElement>('[data-scrim]')!;
    scrim.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(dismissed).not.toHaveBeenCalled();
    scrim.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    scrim.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('puts focus on the first action and keeps Tab inside the dialog', async () => {
    const { el } = await setup();
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="group"] button'));
    expect(document.activeElement).toBe(buttons[0]);
    buttons.at(-1)!.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    buttons.at(-1)!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('places the menu under the row, or above it when the screen ends first', async () => {
    const { fixture, el } = await setup();
    const menu = () => el.querySelector<HTMLElement>('[role="group"]')!;
    expect(menu().style.top).toBe('272px');
    fixture.componentRef.setInput('rect', { ...rect, top: 700, bottom: 764 } as DOMRect);
    await fixture.whenStable();
    const top = parseFloat(menu().style.top);
    expect(top).toBeLessThan(700);
  });
});
