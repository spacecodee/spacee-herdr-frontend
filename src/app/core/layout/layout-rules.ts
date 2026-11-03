import type { Location, Space } from '../hc/spaces';
import type { AgentKind } from '../list/conversations';
import type { LaunchArgv } from './layout-api';

export interface LaunchOption {
  id: string;
  label: string;
  agent: AgentKind;
  /** Omitted for the shell. */
  argv?: LaunchArgv;
}

/** What a new pane can start with, in picker order. */
export const LAUNCH_OPTIONS: readonly LaunchOption[] = [
  { id: 'shell', label: 'Shell', agent: 'shell' },
  { id: 'claude', label: 'Claude Code', agent: 'claude', argv: ['claude'] },
  { id: 'pi', label: 'pi', agent: 'pi', argv: ['pi'] },
  { id: 'codex', label: 'Codex', agent: 'codex', argv: ['codex'] },
  { id: 'opencode', label: 'opencode', agent: 'opencode', argv: ['opencode'] },
  { id: 'agy', label: 'Antigravity', agent: 'antigravity', argv: ['agy'] },
];

export const nameError = (name: string): string => (name.trim() === '' ? 'Enter a name.' : '');

const FOLDER_HINT = 'Enter an absolute folder, like /home/me/code.';

/** The bridge needs an absolute path; `~` cannot be expanded in the browser. */
export function folderError(folder: string, optional = false): string {
  const value = folder.trim();
  if (value === '') return optional ? '' : FOLDER_HINT;
  // eslint-disable-next-line no-control-regex
  if (!value.startsWith('/') || value.length > 4096 || /[\u0000-\u001f]/.test(value)) return FOLDER_HINT;
  return '';
}

export interface CloseTarget {
  kind: 'pane' | 'tab' | 'space';
  id: string;
  label: 'pane' | 'tab' | 'project';
}

/**
 * What "Close" removes for a terminal: its pane, or the tab when it is the tab's only pane, or the
 * project when that tab is the project's last. The bridge refuses the last pane and tab (409).
 */
export function closeTarget(loc: Location): CloseTarget {
  if (loc.paneId !== null && loc.paneCount > 1) return { kind: 'pane', id: loc.paneId, label: 'pane' };
  if (loc.tabCount > 1) return { kind: 'tab', id: loc.tabId, label: 'tab' };
  return { kind: 'space', id: loc.spaceId, label: 'project' };
}

export const spaceTerminals = (space: Space): number =>
  space.tabs.reduce((sum, tab) => sum + tab.addresses.length, 0);

export interface CloseCopy {
  title: string;
  description: string;
  action: string;
}

/** Words of the confirmation: closing ends every terminal inside and cannot be undone. */
export function closeCopy(target: CloseTarget, name: string, terminals: number): CloseCopy {
  const action = `Close ${target.label}`;
  if (target.kind === 'pane') {
    return {
      title: 'Close pane?',
      description: 'Close this pane and end its terminal? This cannot be undone.',
      action,
    };
  }
  const count = `${terminals} terminal${terminals === 1 ? '' : 's'}`;
  return {
    title: `Close ${name}?`,
    description: `Close ${name} and end its ${count}? This cannot be undone.`,
    action,
  };
}

/** A hint for the folder field: the home folder seen in a terminal's working directory. */
export function homeFolder(cwds: readonly string[]): string {
  for (const cwd of cwds) {
    const home = /^\/(?:home|Users)\/[^/]+/.exec(cwd);
    if (home) return home[0];
  }
  return cwds[0] ?? '';
}
