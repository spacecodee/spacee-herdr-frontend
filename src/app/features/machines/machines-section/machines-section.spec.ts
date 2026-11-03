import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { machineStatus } from '../../../core/machines/machine-format';
import { Machines, type MachineRow, type Outcome } from '../../../core/machines/machines';
import { MachinesSection } from './machines-section';

const remote = (name: string, state: string, version = '0.4.0', terminals = 0): MachineRow => ({
  name,
  target: name === 'gandalf' ? 'user@gandalf' : name,
  local: false,
  status: machineStatus({ state, version }, '0.4.0', terminals),
});
const local: MachineRow = { name: 'workstation', target: '', local: true, status: null };

describe('MachinesSection', () => {
  const rows = signal<MachineRow[]>([]);
  let machines: Record<'load' | 'add' | 'rename' | 'reconnect' | 'remove', ReturnType<typeof vi.fn>> & {
    rows: typeof rows;
    localName: ReturnType<typeof signal<string>>;
  };
  let fixture: ComponentFixture<MachinesSection>;
  let writeText: ReturnType<typeof vi.fn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(sel: string) => document.body.querySelector<T>(sel);
  const button = (text: string) =>
    [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }
  const submit = async (selector: string) => {
    q<HTMLFormElement>(`${selector} form`)!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  };
  const type = (selector: string, value: string) => {
    const input = q<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const machineRows = () => [...el().querySelectorAll<HTMLElement>('[data-machine]')];

  beforeEach(async () => {
    rows.set([
      local,
      remote('gandalf', 'connected', '0.4.0', 3),
      remote('rohan', 'unreachable'),
      remote('bilbo', 'needs_login'),
      remote('frodo', 'connected', '0.3.2', 1),
    ]);
    const ok: Outcome = { ok: true };
    machines = {
      rows,
      localName: signal('workstation'),
      load: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(ok),
      rename: vi.fn().mockResolvedValue(ok),
      reconnect: vi.fn().mockResolvedValue(ok),
      remove: vi.fn().mockResolvedValue(ok),
    };
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    TestBed.configureTestingModule({ providers: [{ provide: Machines, useValue: machines }] });
    fixture = TestBed.createComponent(MachinesSection);
    await settle();
  });

  afterEach(() => {
    fixture.destroy();
    document.body.querySelectorAll('.cdp-overlay-container, .cdk-overlay-container').forEach((e) => (e.innerHTML = ''));
  });

  it('loads the machines when it appears', () => {
    expect(machines.load).toHaveBeenCalledTimes(1);
  });

  it('shows this machine first with a badge and no way to open actions', () => {
    const first = machineRows()[0];
    expect(first.textContent).toContain('workstation');
    expect(first.textContent).toContain('This machine');
    expect(first.querySelector('button')).toBeNull();
  });

  it('shows each added machine with its host and status', () => {
    const [, gandalf, rohan, bilbo, frodo] = machineRows();
    expect(gandalf.textContent).toContain('user@gandalf');
    expect(gandalf.textContent).toContain('Connected · 3 terminals');
    expect(gandalf.querySelector('[data-dot]')?.className).toContain('bg-status-done');
    expect(rohan.textContent).toContain('Offline');
    expect(rohan.querySelector('[data-dot]')?.className).toContain('bg-status-idle');
    expect(bilbo.querySelector('[data-dot]')?.className).toContain('bg-status-blocked');
    expect(frodo.textContent).toContain('Needs update');
    expect(frodo.querySelector('[data-dot]')?.className).toContain('bg-status-working');
  });

  it('needs login: shows the command to run on this machine and copies it', async () => {
    const hint = machineRows()[3].querySelector('[data-login-hint]')!;
    expect(hint.textContent).toContain('Run on workstation:');
    expect(hint.textContent).toContain('hc machine login bilbo');
    expect(machineRows()[1].querySelector('[data-login-hint]')).toBeNull();
    hint.querySelector('button')!.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('hc machine login bilbo');
  });

  describe('add machine', () => {
    async function openAdd() {
      el().querySelector<HTMLButtonElement>('[data-add-machine]')!.click();
      await settle();
    }

    it('has an ssh host field, an optional name, the ssh keys help and no password field', async () => {
      await openAdd();
      const sheet = q('[data-machine-add]')!;
      expect(sheet.textContent).toContain('SSH host');
      expect(sheet.textContent).toContain('Name (optional)');
      expect(sheet.textContent).toContain('This machine must reach it with ssh keys.');
      expect(sheet.querySelector('input[type="password"]')).toBeNull();
    });

    it('needs a host before it calls core', async () => {
      await openAdd();
      await submit('[data-machine-add]');
      expect(q('[data-machine-add] [role="alert"]')?.textContent).toContain('Enter the ssh host');
      expect(machines.add).not.toHaveBeenCalled();
    });

    it('adds with the host and name, then closes', async () => {
      await openAdd();
      type('#machine-host', 'user@gandalf');
      type('#machine-name', 'wizard');
      await submit('[data-machine-add]');
      expect(machines.add).toHaveBeenCalledWith('user@gandalf', 'wizard');
      expect(q('[data-machine-add]')?.closest('[data-state="open"]') ?? null).toBeNull();
    });

    it('shows a pending state while core dials', async () => {
      let finish!: (o: Outcome) => void;
      machines.add.mockReturnValue(new Promise<Outcome>((resolve) => (finish = resolve)));
      await openAdd();
      type('#machine-host', 'gandalf');
      await submit('[data-machine-add]');
      expect(q<HTMLButtonElement>('[data-machine-add] button[type="submit"]')!.textContent).toContain('Adding…');
      expect(q<HTMLButtonElement>('[data-machine-add] button[type="submit"]')!.disabled).toBe(true);
      finish({ ok: true });
      await settle();
    });

    it('keeps the sheet and shows core errors inline', async () => {
      machines.add.mockResolvedValue({ ok: false, message: 'Could not reach gandalf over ssh. Check the host and that its ssh keys work.' });
      await openAdd();
      type('#machine-host', 'gandalf');
      await submit('[data-machine-add]');
      expect(q('[data-machine-add] [data-machine-error]')?.textContent).toContain('Could not reach gandalf');
    });
  });

  describe('machine actions', () => {
    async function openActions(index: number) {
      machineRows()[index].querySelector('button')!.click();
      await settle();
    }

    it('opens a sheet with Rename, Reconnect and Remove; Update hc only when it applies', async () => {
      await openActions(1);
      const sheet = q('[data-machine-actions]')!;
      expect(sheet.textContent).toContain('gandalf');
      expect(button('Rename')).toBeTruthy();
      expect(button('Reconnect')).toBeTruthy();
      expect(button('Remove machine')).toBeTruthy();
      expect(sheet.querySelector('[data-update-hc]')).toBeNull();
    });

    it('Update hc copies the command to run on this machine', async () => {
      await openActions(4);
      q<HTMLButtonElement>('[data-update-hc]')!.click();
      await settle();
      expect(writeText).toHaveBeenCalledWith('hc machine update frodo');
      expect(q('[data-update-hc]')?.textContent).toContain('Run it on workstation');
    });

    it('Reconnect calls core for that machine and closes', async () => {
      await openActions(2);
      button('Reconnect')!.click();
      await settle();
      expect(machines.reconnect).toHaveBeenCalledWith('rohan');
    });

    it('Reconnect failure stays in the sheet', async () => {
      machines.reconnect.mockResolvedValue({ ok: false, message: 'Could not reconnect the machine. Try again.' });
      await openActions(2);
      button('Reconnect')!.click();
      await settle();
      expect(q('[data-machine-actions] [data-machine-error]')?.textContent).toContain('Could not reconnect');
    });

    it('Rename: validates, then saves the trimmed name for the old one', async () => {
      await openActions(1);
      button('Rename')!.click();
      await settle();
      expect(q<HTMLInputElement>('#machine-rename')!.value).toBe('gandalf');
      type('#machine-rename', '   ');
      await submit('[data-machine-rename]');
      expect(q('[data-machine-rename] [role="alert"]')?.textContent).toContain('Enter a name');
      expect(machines.rename).not.toHaveBeenCalled();
      type('#machine-rename', 'wizard');
      await submit('[data-machine-rename]');
      expect(machines.rename).toHaveBeenCalledWith('gandalf', 'wizard');
    });

    it('Remove asks first, with the reassurance, then removes', async () => {
      await openActions(1);
      button('Remove machine')!.click();
      await settle();
      const dialog = q('[data-machine-confirm]')!;
      expect(dialog.textContent).toContain('Remove gandalf?');
      expect(dialog.textContent).toContain('Its terminals keep running there. You can add it again later.');
      expect(machines.remove).not.toHaveBeenCalled();
      button('Remove')!.click();
      await settle();
      expect(machines.remove).toHaveBeenCalledWith('gandalf');
    });

    it('a failed remove says why and keeps the dialog', async () => {
      machines.remove.mockResolvedValue({ ok: false, message: 'Could not remove the machine. Try again.' });
      await openActions(1);
      button('Remove machine')!.click();
      await settle();
      button('Remove')!.click();
      await settle();
      expect(q('[data-machine-confirm] [role="alert"]')?.textContent).toContain('Could not remove');
    });
  });
});
