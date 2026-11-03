import type { MachineView, Terminal } from '../hc/types';

export type MachineKind = 'connected' | 'connecting' | 'offline' | 'needs-login' | 'needs-update';
export type StatusDot = 'done' | 'working' | 'blocked' | 'idle';

export interface MachineStatus {
  kind: MachineKind;
  dot: StatusDot;
  label: string;
}

export type MachineAction = 'rename' | 'reconnect' | 'remove';

export const MAX_NAME_LENGTH = 40;

/** Live terminals of one machine: finished ones are history, not something running there. */
export function terminalCount(terminals: Pick<Terminal, 'state'>[]): number {
  return terminals.filter((t) => t.state === 'live').length;
}

/**
 * What a machine row says. `localVersion` is the hc version of the core this app talks to: a
 * connected machine running another one is shown as needing an update (core has no state for it).
 */
export function machineStatus(
  machine: Pick<MachineView, 'state' | 'version'>,
  localVersion: string | undefined,
  terminals: number,
): MachineStatus {
  switch (machine.state) {
    case 'connected': {
      const version = machine.version.trim();
      if (version && localVersion && version !== localVersion.trim()) {
        return { kind: 'needs-update', dot: 'working', label: `Needs update · hc ${version}` };
      }
      return {
        kind: 'connected',
        dot: 'done',
        label: `Connected · ${terminals} ${terminals === 1 ? 'terminal' : 'terminals'}`,
      };
    }
    case 'connecting':
      return { kind: 'connecting', dot: 'working', label: 'Connecting…' };
    case 'needs_login':
      return { kind: 'needs-login', dot: 'blocked', label: 'Needs login' };
    default:
      return { kind: 'offline', dot: 'idle', label: 'Offline' };
  }
}

/** Empty when the ssh host is usable: `gandalf`, `user@host`, `user@host:2222`. */
export function hostProblem(host: string): string {
  const value = host.trim();
  if (!value) return 'Enter the ssh host';
  return /\s/.test(value) ? 'An ssh host has no spaces' : '';
}

/** Empty when the optional name is fine. */
export function machineNameProblem(name: string, required = false): string {
  const value = name.trim();
  if (!value) return required ? 'Enter a name' : '';
  if (/[\s/]/.test(value)) return 'A name has no spaces or slashes';
  return value.length > MAX_NAME_LENGTH ? `Use ${MAX_NAME_LENGTH} characters or fewer` : '';
}

const SHARED: Record<string, string> = {
  name_taken: 'That name is already used by another machine.',
  not_connected: 'Cannot reach the bridge. Try again in a moment.',
  connection_closed: 'Cannot reach the bridge. Try again in a moment.',
};

/** A `machine.add` error kind in plain words. */
export function addProblem(kind: string, host: string): string {
  switch (kind) {
    case 'unreachable':
      return `Could not reach ${host} over ssh. Check the host and that its ssh keys work.`;
    case 'hc_missing':
      return `hc is not installed on ${host}.`;
    case 'incompatible':
      return `hc on ${host} is too different to work with this one. Update it and try again.`;
    case 'already_added':
      return 'That machine is already added.';
    case 'invalid_params':
      return 'Check the host and the name.';
    default:
      return SHARED[kind] ?? 'Could not add the machine. Try again.';
  }
}

/** A rename, reconnect or remove error kind in plain words. */
export function writeProblem(kind: string, action: MachineAction): string {
  if (kind === 'machine_unknown') return 'That machine is no longer added.';
  if (kind === 'invalid_params') return 'Check the name.';
  return SHARED[kind] ?? `Could not ${action} the machine. Try again.`;
}
