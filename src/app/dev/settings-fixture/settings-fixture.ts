import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { machineStatus } from '../../core/machines/machine-format';
import { Machines, type MachineRow, type Outcome } from '../../core/machines/machines';
import { SettingsPage } from '../../features/settings/settings';
import { provideFixtureUpdates } from '../update-fixture';

const ok = async (): Promise<Outcome> => ({ ok: true });

/** Machine rows for `?m=` (`all` by default, `none` for only this machine). */
function fixtureMachines(scenario: string | null) {
  const remote = (name: string, target: string, state: string, version: string, terminals: number): MachineRow => ({
    name,
    target,
    local: false,
    status: machineStatus({ state, version }, '0.4.0', terminals),
  });
  const rows: MachineRow[] = [{ name: 'workstation', target: '', local: true, status: null }];
  if (scenario !== 'none') {
    rows.push(
      remote('gandalf', 'user@gandalf', 'connected', '0.4.0', 3),
      remote('rohan', 'rohan', 'unreachable', '0.4.0', 0),
      remote('bilbo', 'bilbo.local', 'needs_login', '0.4.0', 0),
      remote('frodo', 'frodo', 'connected', '0.3.2', 1),
    );
  }
  const list = signal(rows);
  return {
    rows: list.asReadonly(),
    localName: signal('workstation').asReadonly(),
    load: async () => undefined,
    add: ok,
    rename: ok,
    reconnect: ok,
    remove: ok,
  } as unknown as Machines;
}

/**
 * Dev-only: the settings screen with a canned update state (`?u=none|ready|later|reloading`) and
 * canned machines (`?m=all|none`).
 */
@Component({
  imports: [SettingsPage],
  providers: [
    provideFixtureUpdates,
    { provide: Machines, useFactory: () => fixtureMachines(inject(ActivatedRoute).snapshot.queryParamMap.get('m')) },
  ],
  templateUrl: './settings-fixture.html',
})
export class SettingsFixture {}
