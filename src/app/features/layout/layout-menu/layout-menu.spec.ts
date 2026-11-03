import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TerminalStore } from '../../../core/hc/terminal-store';
import type { Space } from '../../../core/hc/spaces';
import { LayoutActions } from '../../../core/layout/layout-actions';
import { LayoutMenu } from './layout-menu';

const pane = (a: string) => ({ id: `p${a}`, address: a });
const spaces = signal<Space[]>([]);

describe('LayoutMenu', () => {
  let actions: { open: ReturnType<typeof vi.fn>; moveSpace: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<LayoutMenu>;

  async function setup(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LayoutActions, useValue: actions },
        { provide: TerminalStore, useValue: { spaces } },
      ],
    });
    fixture = TestBed.createComponent(LayoutMenu);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-layout-menu]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const labels = () =>
    [...document.body.querySelectorAll<HTMLButtonElement>('[role="group"] button')].map((b) => b.textContent!.trim());
  const item = (text: string) =>
    [...document.body.querySelectorAll<HTMLButtonElement>('[role="group"] button')].find((b) => b.textContent!.trim() === text)!;

  beforeEach(() => {
    actions = { open: vi.fn(), moveSpace: vi.fn() };
    spaces.set([
      {
        id: 's1',
        name: 'Work',
        tabs: [
          { id: 'a', name: 'one', addresses: ['t1', 't2'], panes: [pane('t1'), pane('t2')] },
          { id: 'b', name: 'two', addresses: ['t3'], panes: [pane('t3')] },
        ],
      },
      { id: 's2', name: 'Solo', tabs: [{ id: 'c', name: 'only', addresses: ['t9'], panes: [pane('t9')] }] },
    ]);
  });

  afterEach(() => document.body.querySelectorAll('.cdk-overlay-container').forEach((e) => (e.innerHTML = '')));

  describe('project menu', () => {
    it('lists the project actions', async () => {
      await setup({ spaceId: 's1', label: 'Work' });
      expect(labels()).toEqual(['New tab', 'Rename', 'Move up', 'Move down', 'Close project']);
    });

    it('names the trigger after the project', async () => {
      await setup({ spaceId: 's1', label: 'Work' });
      expect(fixture.nativeElement.querySelector('[data-layout-menu]').getAttribute('aria-label')).toBe(
        'More actions for Work',
      );
    });

    it('cannot move the first project up or the last one down', async () => {
      await setup({ spaceId: 's1' });
      expect(item('Move up').disabled).toBe(true);
      expect(item('Move down').disabled).toBe(false);
    });

    it('moves a project one place', async () => {
      await setup({ spaceId: 's1' });
      item('Move down').click();
      expect(actions.moveSpace).toHaveBeenCalledWith('s1', 1);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('asks to confirm closing', async () => {
      await setup({ spaceId: 's1' });
      item('Close project').click();
      expect(actions.open).toHaveBeenCalledWith({
        kind: 'close',
        target: { kind: 'space', id: 's1', label: 'project' },
        name: 'Work',
        terminals: 3,
      });
    });

    it('opens the new tab and rename sheets', async () => {
      await setup({ spaceId: 's1' });
      item('New tab').click();
      expect(actions.open).toHaveBeenCalledWith({ kind: 'new-tab', spaceId: 's1', spaceName: 'Work' });
      fixture.detectChanges();
      fixture.nativeElement.querySelector('[data-layout-menu]').click();
      fixture.detectChanges();
      await fixture.whenStable();
      item('Rename').click();
      expect(actions.open).toHaveBeenCalledWith({ kind: 'rename', target: 'space', id: 's1', name: 'Work' });
    });
  });

  describe('terminal menu', () => {
    it('offers split, rename and close pane when the tab has several panes', async () => {
      await setup({ address: 't1' });
      expect(labels()).toEqual(['Split right', 'Split down', 'Rename tab', 'Close pane']);
    });

    it('adds Open terminal for agents on a row', async () => {
      await setup({ address: 't1', agent: true });
      expect(labels()[0]).toBe('Open terminal');
    });

    it('closes the tab when the pane is its only one', async () => {
      await setup({ address: 't3' });
      expect(labels().at(-1)).toBe('Close tab');
      item('Close tab').click();
      expect(actions.open).toHaveBeenCalledWith({
        kind: 'close',
        target: { kind: 'tab', id: 'b', label: 'tab' },
        name: 'two',
        terminals: 1,
      });
    });

    it('closes the project when it is the last pane of the last tab', async () => {
      await setup({ address: 't9' });
      expect(labels().at(-1)).toBe('Close project');
    });

    it('splits the pane it belongs to', async () => {
      await setup({ address: 't2' });
      item('Split down').click();
      expect(actions.open).toHaveBeenCalledWith({ kind: 'split', tabId: 'a', paneId: 'pt2', direction: 'down' });
    });

    it('renames its tab', async () => {
      await setup({ address: 't2' });
      item('Rename tab').click();
      expect(actions.open).toHaveBeenCalledWith({ kind: 'rename', target: 'tab', id: 'a', name: 'one' });
    });

    it('adds New tab here in the terminal view', async () => {
      await setup({ address: 't2', context: 'view' });
      expect(labels()[0]).toBe('New tab here');
      item('New tab here').click();
      expect(actions.open).toHaveBeenCalledWith({ kind: 'new-tab', spaceId: 's1', spaceName: 'Work' });
    });

    it('shows no menu for a terminal that sits in no tab', async () => {
      await setup({ address: 'nowhere' });
      expect(fixture.nativeElement.querySelector('[data-layout-menu]')).toBeNull();
    });
  });
});
