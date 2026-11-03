import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HcClient, HcError } from '../hc/hc-client';
import { TerminalStore, type MachineGroup } from '../hc/terminal-store';
import type { MachineView, Terminal } from '../hc/types';
import { Machines } from './machines';

const machine = (over: Partial<MachineView> = {}): MachineView => ({
  name: 'gandalf',
  target: 'gandalf',
  id: 'm1',
  host: 'gandalf',
  version: '0.4.0',
  state: 'connected',
  ...over,
});
const terminal = (address: string, state = 'live') => ({ address, state }) as Terminal;

describe('Machines', () => {
  const machines = signal<MachineView[]>([]);
  const groups = signal<MachineGroup[]>([]);
  let call: ReturnType<typeof vi.fn>;
  let store: { machines: typeof machines; groups: typeof groups; refreshMachines: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> };
  let service: Machines;

  beforeEach(() => {
    machines.set([machine(), machine({ name: 'rohan', state: 'unreachable', id: 'm2' })]);
    groups.set([
      { name: 'workstation', local: true, state: 'local', terminals: [terminal('t1')] },
      { name: 'gandalf', local: false, state: 'connected', terminals: [terminal('gandalf/t1'), terminal('gandalf/t2'), terminal('gandalf/t3', 'finished')] },
    ]);
    call = vi.fn().mockResolvedValue({});
    store = { machines, groups, refreshMachines: vi.fn().mockResolvedValue(undefined), start: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        { provide: HcClient, useValue: { call, hello: computed(() => ({ core: { name: 'workstation' }, version: '0.4.0' })) } },
        { provide: TerminalStore, useValue: store },
      ],
    });
    service = TestBed.inject(Machines);
  });

  it('lists this machine first, then the added ones with their status', () => {
    const rows = service.rows();
    expect(rows.map((r) => r.name)).toEqual(['workstation', 'gandalf', 'rohan']);
    expect(rows[0]).toMatchObject({ local: true, status: null });
    expect(rows[1].status?.label).toBe('Connected · 2 terminals');
    expect(rows[2].status?.label).toBe('Offline');
  });

  it('add sends the trimmed ssh host and the name only when given, then re-lists', async () => {
    expect(await service.add(' user@gandalf ', '')).toEqual({ ok: true });
    expect(call).toHaveBeenCalledWith('machine.add', { target: 'user@gandalf' });
    await service.add('gandalf', ' wizard ');
    expect(call).toHaveBeenLastCalledWith('machine.add', { target: 'gandalf', name: 'wizard' });
    expect(store.refreshMachines).toHaveBeenCalledTimes(2);
  });

  it('add turns a core error into a sentence and does not re-list', async () => {
    call.mockRejectedValue(new HcError('unreachable', 'unreachable', -32000));
    expect(await service.add('gandalf', '')).toEqual({
      ok: false,
      message: 'Could not reach gandalf over ssh. Check the host and that its ssh keys work.',
    });
    expect(store.refreshMachines).not.toHaveBeenCalled();
  });

  it('rename and reconnect use the machine name', async () => {
    await service.rename('gandalf', ' wizard ');
    expect(call).toHaveBeenCalledWith('machine.rename', { machine: 'gandalf', new_name: 'wizard' });
    await service.reconnect('rohan');
    expect(call).toHaveBeenCalledWith('machine.connect', { machine: 'rohan' });
  });

  it('remove forgets the machine and takes a fresh snapshot so home drops it', async () => {
    expect(await service.remove('gandalf')).toEqual({ ok: true });
    expect(call).toHaveBeenCalledWith('machine.rm', { machine: 'gandalf' });
    expect(store.start).toHaveBeenCalledTimes(1);
  });

  it('a failed remove leaves the list alone', async () => {
    call.mockRejectedValue(new HcError('machine_unknown', 'machine_unknown', -32000));
    expect(await service.remove('gandalf')).toEqual({ ok: false, message: 'That machine is no longer added.' });
    expect(store.start).not.toHaveBeenCalled();
  });
});
