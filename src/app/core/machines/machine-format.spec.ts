import type { MachineView } from '../hc/types';
import { addProblem, hostProblem, machineStatus, terminalCount, writeProblem } from './machine-format';

const view = (over: Partial<MachineView> = {}): MachineView => ({
  name: 'gandalf',
  target: 'gandalf',
  id: 'm1',
  host: 'gandalf',
  version: '0.4.0',
  state: 'connected',
  ...over,
});

describe('machineStatus', () => {
  it('connected shows the terminal count with a done dot', () => {
    expect(machineStatus(view(), '0.4.0', 3)).toMatchObject({ kind: 'connected', dot: 'done', label: 'Connected · 3 terminals' });
    expect(machineStatus(view(), '0.4.0', 1).label).toBe('Connected · 1 terminal');
    expect(machineStatus(view(), '0.4.0', 0).label).toBe('Connected · 0 terminals');
  });

  it('unreachable is offline and muted', () => {
    expect(machineStatus(view({ state: 'unreachable' }), '0.4.0', 0)).toMatchObject({ kind: 'offline', dot: 'idle', label: 'Offline' });
  });

  it('needs_login is blocked', () => {
    expect(machineStatus(view({ state: 'needs_login' }), '0.4.0', 0)).toMatchObject({ kind: 'needs-login', dot: 'blocked', label: 'Needs login' });
  });

  it('connecting is working', () => {
    expect(machineStatus(view({ state: 'connecting' }), '0.4.0', 0)).toMatchObject({ kind: 'connecting', dot: 'working', label: 'Connecting…' });
  });

  it('a connected machine running another hc version needs an update', () => {
    expect(machineStatus(view({ version: '0.3.2' }), '0.4.0', 2)).toMatchObject({ kind: 'needs-update', dot: 'working', label: 'Needs update · hc 0.3.2' });
  });

  it('without a known version on either side nothing needs an update', () => {
    expect(machineStatus(view({ version: '' }), '0.4.0', 2).kind).toBe('connected');
    expect(machineStatus(view(), undefined, 2).kind).toBe('connected');
  });
});

describe('terminalCount', () => {
  it('counts live terminals only', () => {
    expect(terminalCount([{ state: 'live' }, { state: 'finished' }, { state: 'live' }])).toBe(2);
  });
});

describe('hostProblem', () => {
  it('is empty for a host, user@host or an ssh config name', () => {
    expect(hostProblem('gandalf')).toBe('');
    expect(hostProblem(' user@10.0.0.7:2222 ')).toBe('');
  });
  it('asks for a host when empty and rejects spaces', () => {
    expect(hostProblem('  ')).toBe('Enter the ssh host');
    expect(hostProblem('my host')).toBe('An ssh host has no spaces');
  });
});

describe('core errors in plain words', () => {
  it('add', () => {
    expect(addProblem('unreachable', 'gandalf')).toBe('Could not reach gandalf over ssh. Check the host and that its ssh keys work.');
    expect(addProblem('hc_missing', 'gandalf')).toBe('hc is not installed on gandalf.');
    expect(addProblem('incompatible', 'gandalf')).toBe('hc on gandalf is too different to work with this one. Update it and try again.');
    expect(addProblem('already_added', 'gandalf')).toBe('That machine is already added.');
    expect(addProblem('name_taken', 'gandalf')).toBe('That name is already used by another machine.');
    expect(addProblem('not_connected', 'gandalf')).toBe('Cannot reach the bridge. Try again in a moment.');
    expect(addProblem('boom', 'gandalf')).toBe('Could not add the machine. Try again.');
  });
  it('rename, reconnect and remove', () => {
    expect(writeProblem('name_taken', 'rename')).toBe('That name is already used by another machine.');
    expect(writeProblem('machine_unknown', 'remove')).toBe('That machine is no longer added.');
    expect(writeProblem('boom', 'reconnect')).toBe('Could not reconnect the machine. Try again.');
    expect(writeProblem('boom', 'rename')).toBe('Could not rename the machine. Try again.');
    expect(writeProblem('boom', 'remove')).toBe('Could not remove the machine. Try again.');
  });
});
