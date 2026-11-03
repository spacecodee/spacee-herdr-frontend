import { signal } from '@angular/core';
import type { Space } from '../../core/hc/spaces';
import type { MachineGroup } from '../../core/hc/terminal-store';
import type { Terminal } from '../../core/hc/types';
import type { Summary } from '../../core/list/conversations';

const term = (address: string, extra: Partial<Terminal> = {}): Terminal => ({
  address,
  labels: {},
  argv: ['zsh'],
  cwd: '/home/me/code/app',
  state: 'live',
  created_ms: 1,
  screen: 'exact',
  cols: 80,
  rows: 24,
  ...extra,
});

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const summary = (
  terminal: string,
  agent: string,
  title: string,
  text: string,
  minutes: number,
  role: 'user' | 'assistant' = 'assistant',
): Summary => ({
  terminal,
  agent,
  session: 's',
  title,
  last: { role, text, time: ago(minutes) },
  messages: 12,
});

export type Scenario = 'conversations' | 'blocked' | 'loading' | 'empty';

export function homeFixture(scenario: Scenario) {
  const blocked = scenario === 'blocked';
  const terminals: Terminal[] =
    scenario === 'empty'
      ? []
      : [
          term('t1', { name: 'api', status: { state: 'working', app: 'claude' } }),
          term('t2', { name: 'web', status: { state: blocked ? 'blocked' : 'idle', app: 'pi' } }),
          term('t3', { name: 'infra', status: { state: 'done', app: 'codex' } }),
          term('t4', { name: 'shell', cwd: '/home/me/code/spacee-herdr' }),
          term('rohan/t7', { name: 'ops', status: { state: blocked ? 'blocked' : 'idle', app: 'claude' } }),
          term('t9', { name: 'nvim', cwd: '/etc/nixos', status: { state: 'idle' } }),
        ];
  const spaces: Space[] = [
    {
      id: 's1',
      name: 'Herdr',
      tabs: [
        { id: 'a', name: 'Backend', addresses: ['t1'], panes: [{ id: 'p1', address: 't1' }] },
        { id: 'b', name: 'Frontend', addresses: ['t2', 't4'], panes: [{ id: 'p2', address: 't2' }, { id: 'p4', address: 't4' }] },
      ],
    },
    { id: 's2', name: 'Infra', tabs: [{ id: 'c', name: 'Deploy', addresses: ['t3'], panes: [{ id: 'p3', address: 't3' }] }] },
  ];
  const groups: MachineGroup[] = [
    { name: 'gandalf', local: true, state: 'local', terminals: terminals.filter((t) => !t.address.includes('/')) },
    { name: 'rohan', local: false, state: 'connected', terminals: terminals.filter((t) => t.address.includes('/')) },
  ];
  const summaries: Summary[] =
    scenario === 'empty'
      ? []
      : [
          summary('t1', 'claude', 'Add push notifications', 'I will wire the service worker next.', 1),
          summary('t2', 'pi', 'Home redesign', 'Which agent colors do you prefer for the avatars?', 25, 'assistant'),
          summary('t3', 'codex', 'Fix the deploy script', 'run the migration first, then restart', 60 * 26, 'user'),
          summary('rohan/t7', 'claude', '', 'Done. The backup finished and the logs are clean.\nNothing else to do.', 60 * 24 * 4),
        ];
  return {
    spaces: signal(spaces),
    groups: signal(groups),
    summaries: signal(summaries),
    loaded: scenario !== 'loading',
  };
}
