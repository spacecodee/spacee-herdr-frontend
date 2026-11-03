import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TerminalStore } from '../../../core/hc/terminal-store';
import { LayoutActions, type LayoutRequest } from '../../../core/layout/layout-actions';
import { LayoutHost } from './layout-host';

describe('LayoutHost', () => {
  const request = signal<LayoutRequest | null>(null);
  const busy = signal(false);
  let actions: Record<string, ReturnType<typeof vi.fn>> & { request: typeof request; busy: typeof busy };
  let fixture: ComponentFixture<LayoutHost>;
  let groups: ReturnType<typeof signal<unknown[]>>;

  const body = () => document.body;
  const q = <T extends Element>(sel: string) => body().querySelector<T>(sel);

  async function show(r: LayoutRequest) {
    request.set(r);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function type(sel: string, value: string) {
    const input = q<HTMLInputElement>(sel)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  const submit = async () => {
    q<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    request.set(null);
    busy.set(false);
    groups = signal<unknown[]>([
      { name: 'gandalf', local: true, state: 'local', terminals: [{ cwd: '/home/me/code/app' }] },
    ]);
    actions = {
      request,
      busy,
      dismiss: vi.fn(() => request.set(null)),
      createProject: vi.fn(),
      createTab: vi.fn(),
      split: vi.fn(),
      rename: vi.fn(),
      close: vi.fn(),
    } as never;
    TestBed.configureTestingModule({
      providers: [
        { provide: LayoutActions, useValue: actions },
        { provide: TerminalStore, useValue: { groups } },
      ],
    });
    fixture = TestBed.createComponent(LayoutHost);
    fixture.detectChanges();
  });

  afterEach(() => {
    request.set(null);
    fixture.detectChanges();
    body().querySelectorAll('.cdk-overlay-container').forEach((e) => (e.innerHTML = ''));
  });

  it('shows nothing until a request arrives', () => {
    expect(q('[data-layout-sheet]')).toBeNull();
    expect(q('[data-layout-confirm]')).toBeNull();
  });

  describe('new project', () => {
    it('asks for name, folder and agent, with the home folder as a hint', async () => {
      await show({ kind: 'new-project' });
      expect(q('h2')!.textContent).toContain('New project');
      expect(q<HTMLInputElement>('#layout-name')).not.toBeNull();
      expect(q<HTMLInputElement>('#layout-folder')!.placeholder).toBe('/home/me');
      expect([...body().querySelectorAll('input[name="agent"]')].length).toBe(6);
      expect(q<HTMLInputElement>('input[name="agent"]')!.checked).toBe(true);
      expect(q('#layout-machine')).toBeNull();
    });

    it('closes with the X only: there is no Cancel button, and Create is the one action', async () => {
      await show({ kind: 'new-project' });
      const sheet = q('[data-layout-sheet]')!;
      const labels = [...sheet.querySelectorAll('button')].map((b) => b.textContent!.trim());
      expect(labels).not.toContain('Cancel');
      expect(labels).toContain('Create');
      expect(sheet.querySelector('button[hlmSheetClose] .sr-only')?.textContent).toBe('Close');
    });

    it('shows the agents as hug chips', async () => {
      await show({ kind: 'new-project' });
      const chip = q('[data-layout-sheet] .agent-card')!;
      expect(chip.className).toContain('rounded-full');
    });

    it('does not submit an empty form and says why', async () => {
      await show({ kind: 'new-project' });
      await submit();
      expect(actions['createProject']).not.toHaveBeenCalled();
      expect(q('#layout-name-error')!.textContent).toContain('Enter a name.');
      expect(q('#layout-folder-error')!.textContent).toContain('absolute folder');
    });

    it('rejects a relative folder', async () => {
      await show({ kind: 'new-project' });
      type('#layout-name', 'Work');
      type('#layout-folder', '~/code');
      await submit();
      expect(actions['createProject']).not.toHaveBeenCalled();
    });

    it('creates the project with the chosen agent', async () => {
      await show({ kind: 'new-project' });
      type('#layout-name', 'Work');
      type('#layout-folder', '/tmp');
      const claude = [...body().querySelectorAll<HTMLInputElement>('input[name="agent"]')][1];
      claude.click();
      fixture.detectChanges();
      await submit();
      expect(actions['createProject']).toHaveBeenCalledTimes(1);
      const arg = actions['createProject'].mock.calls[0][0];
      expect(arg).toMatchObject({ name: 'Work', folder: '/tmp', machine: '' });
      expect(arg.option.argv).toEqual(['claude']);
    });

    it('offers the connected remote machines, local by default', async () => {
      groups.set([
        { name: 'gandalf', local: true, state: 'local', terminals: [] },
        { name: 'rohan', local: false, state: 'connected', terminals: [] },
        { name: 'down', local: false, state: 'unreachable', terminals: [] },
      ]);
      await show({ kind: 'new-project' });
      const options = [...body().querySelectorAll<HTMLOptionElement>('#layout-machine option')].map((o) => o.value);
      expect(options).toEqual(['', 'rohan']);
    });

    it('disables the buttons while a request runs', async () => {
      await show({ kind: 'new-project' });
      busy.set(true);
      fixture.detectChanges();
      expect(q<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
      expect(q<HTMLButtonElement>('button[type="submit"]')!.textContent).toContain('Creating…');
    });
  });

  describe('new tab', () => {
    it('allows an empty folder but not a relative one', async () => {
      await show({ kind: 'new-tab', spaceId: 's1', spaceName: 'Work' });
      expect(q('h2')!.textContent).toContain('New tab in Work');
      type('#layout-name', 'Logs');
      await submit();
      expect(actions['createTab']).toHaveBeenCalledWith(expect.objectContaining({ space: 's1', name: 'Logs', folder: '' }));
      actions['createTab'].mockClear();
      type('#layout-folder', 'logs');
      await submit();
      expect(actions['createTab']).not.toHaveBeenCalled();
    });
  });

  describe('split', () => {
    it('only asks for the agent and splits the pane', async () => {
      await show({ kind: 'split', tabId: 'a', paneId: 'p1', direction: 'right' });
      expect(q('h2')!.textContent).toContain('Split right');
      expect(q('#layout-name')).toBeNull();
      await submit();
      expect(actions['split']).toHaveBeenCalledWith(
        expect.objectContaining({ tab: 'a', pane: 'p1', direction: 'right' }),
      );
    });
  });

  describe('rename', () => {
    it('starts with the current name and saves the new one', async () => {
      await show({ kind: 'rename', target: 'tab', id: 'a', name: 'one' });
      expect(q<HTMLInputElement>('#layout-name')!.value).toBe('one');
      expect(q('input[name="agent"]')).toBeNull();
      type('#layout-name', 'two');
      await submit();
      expect(actions['rename']).toHaveBeenCalledWith('tab', 'a', 'two');
    });

    it('does not save an empty name', async () => {
      await show({ kind: 'rename', target: 'space', id: 's', name: 'Work' });
      type('#layout-name', '  ');
      await submit();
      expect(actions['rename']).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    const target = { kind: 'space', id: 's1', label: 'project' } as const;

    it('asks before ending the terminals and closes only on confirm', async () => {
      await show({ kind: 'close', target, name: 'Work', terminals: 3 });
      const dialog = q('[data-layout-confirm]')!;
      expect(dialog.textContent).toContain('Close Work and end its 3 terminals?');
      expect(actions['close']).not.toHaveBeenCalled();
      const confirm = [...dialog.querySelectorAll('button')].find((b) => b.textContent!.includes('Close project'))!;
      confirm.click();
      expect(actions['close']).toHaveBeenCalledWith(target);
    });

    it('puts Cancel as a plain text button below a solid destructive action', async () => {
      await show({ kind: 'close', target, name: 'Work', terminals: 3 });
      const buttons = [...q('[data-layout-confirm]')!.querySelectorAll('button')];
      expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Close project', 'Cancel']);
      expect(buttons[0].className).toContain('bg-destructive');
      expect(buttons[0].className).not.toContain('bg-destructive/10');
      // Ghost variant: no fill and no border until pressed.
      expect(buttons[1].className).toContain('hover:bg-muted');
      expect(buttons[1].className).not.toContain('bg-primary');
    });

    it('marks the confirm action as destructive', async () => {
      await show({ kind: 'close', target, name: 'Work', terminals: 3 });
      const confirm = [...q('[data-layout-confirm]')!.querySelectorAll('button')].find((b) =>
        b.textContent!.includes('Close project'),
      )!;
      expect(confirm.className).toMatch(/destructive/);
    });
  });
});
