import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TerminalStore } from '../hc/terminal-store';
import type { Space } from '../hc/spaces';
import { LAYOUT_NOTIFY, LayoutActions } from './layout-actions';
import { LayoutApi, LayoutError } from './layout-api';
import { LAUNCH_OPTIONS } from './layout-rules';

const toastError = vi.fn();

const created = { space: 's9', tab: 'tb9', pane: 'p9', terminal: 'rohan/t9' };
const spaces: Space[] = [
  { id: 's1', name: 'A', tabs: [{ id: 'a1', name: 'one', addresses: ['t1'], panes: [{ id: 'p1', address: 't1' }] }] },
  { id: 's2', name: 'B', tabs: [{ id: 'b1', name: 'two', addresses: ['t2'], panes: [{ id: 'p2', address: 't2' }] }] },
];

describe('LayoutActions', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let navigate: ReturnType<typeof vi.fn>;
  let actions: LayoutActions;

  beforeEach(() => {
    toastError.mockClear();
    api = {
      createSpace: vi.fn().mockResolvedValue(created),
      createTab: vi.fn().mockResolvedValue(created),
      split: vi.fn().mockResolvedValue(created),
      renameSpace: vi.fn().mockResolvedValue(undefined),
      renameTab: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: LAYOUT_NOTIFY, useValue: toastError },
        { provide: LayoutApi, useValue: api },
        { provide: Router, useValue: { navigate } },
        { provide: TerminalStore, useValue: { spaces: signal(spaces) } },
      ],
    });
    actions = TestBed.inject(LayoutActions);
  });

  it('creates a project, closes the sheet and opens the new terminal', async () => {
    actions.open({ kind: 'new-project' });
    const claude = LAUNCH_OPTIONS[1];
    await actions.createProject({ name: ' Work ', folder: '/tmp', machine: '', option: claude });
    expect(api['createSpace']).toHaveBeenCalledWith({ name: 'Work', folder: '/tmp', argv: ['claude'] });
    expect(actions.request()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/t', 'rohan/t9']);
    expect(actions.busy()).toBe(false);
  });

  it('sends the machine only when one is chosen, and no argv for a shell', async () => {
    await actions.createProject({ name: 'W', folder: '/tmp', machine: 'rohan', option: LAUNCH_OPTIONS[0] });
    expect(api['createSpace']).toHaveBeenCalledWith({ name: 'W', folder: '/tmp', machine: 'rohan' });
  });

  it('creates a tab with an optional folder', async () => {
    await actions.createTab({ space: 's1', name: 'T', folder: '', option: LAUNCH_OPTIONS[0] });
    expect(api['createTab']).toHaveBeenCalledWith({ space: 's1', name: 'T' });
    await actions.createTab({ space: 's1', name: 'T', folder: '/srv', option: LAUNCH_OPTIONS[2] });
    expect(api['createTab']).toHaveBeenLastCalledWith({ space: 's1', name: 'T', folder: '/srv', argv: ['pi'] });
  });

  it('splits a pane', async () => {
    await actions.split({ tab: 'a1', pane: 'p1', direction: 'down', option: LAUNCH_OPTIONS[3] });
    expect(api['split']).toHaveBeenCalledWith({ tab: 'a1', pane: 'p1', direction: 'down', argv: ['codex'] });
    expect(navigate).toHaveBeenCalledWith(['/t', 'rohan/t9']);
  });

  it('renames and keeps the sheet closed afterwards', async () => {
    actions.open({ kind: 'rename', target: 'tab', id: 'a1', name: 'one' });
    await actions.rename('tab', 'a1', ' Renamed ');
    expect(api['renameTab']).toHaveBeenCalledWith('a1', 'Renamed');
    expect(actions.request()).toBeNull();
    await actions.rename('space', 's1', 'S');
    expect(api['renameSpace']).toHaveBeenCalledWith('s1', 'S');
  });

  it('moves a project by its 0-based position among all projects', async () => {
    await actions.moveSpace('s2', -1);
    expect(api['move']).toHaveBeenCalledWith('space', 's2', 0);
    await actions.moveSpace('s1', 1);
    expect(api['move']).toHaveBeenLastCalledWith('space', 's1', 1);
  });

  it('does not move past either end', async () => {
    await actions.moveSpace('s1', -1);
    await actions.moveSpace('s2', 1);
    expect(api['move']).not.toHaveBeenCalled();
  });

  it('closes after confirmation and dismisses the dialog', async () => {
    actions.open({ kind: 'close', target: { kind: 'tab', id: 'a1', label: 'tab' }, name: 'one', terminals: 1 });
    await actions.close({ kind: 'tab', id: 'a1', label: 'tab' });
    expect(api['close']).toHaveBeenCalledWith('tab', 'a1');
    expect(actions.request()).toBeNull();
  });

  it('toasts the reason and keeps the sheet open when the bridge refuses', async () => {
    api['createSpace'].mockRejectedValue(new LayoutError('invalid'));
    actions.open({ kind: 'new-project' });
    await actions.createProject({ name: 'W', folder: '/tmp', machine: '', option: LAUNCH_OPTIONS[0] });
    expect(toastError).toHaveBeenCalledWith('Invalid input.');
    expect(actions.request()).toEqual({ kind: 'new-project' });
    expect(navigate).not.toHaveBeenCalled();
    expect(actions.busy()).toBe(false);
  });

  it('ignores a second request while one runs', async () => {
    let release!: () => void;
    api['renameTab'].mockReturnValue(new Promise<void>((r) => (release = r)));
    const first = actions.rename('tab', 'a1', 'x');
    expect(actions.busy()).toBe(true);
    await actions.rename('tab', 'a1', 'y');
    expect(api['renameTab']).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(actions.busy()).toBe(false);
  });
});
