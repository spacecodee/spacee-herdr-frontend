import { Component, signal } from '@angular/core';
import { Permissions } from '../../core/answers/permissions';
import { Summaries } from '../../core/chat/summaries';
import { HcClient } from '../../core/hc/hc-client';
import { TerminalStore } from '../../core/hc/terminal-store';
import { Quota } from '../../core/quota/quota';
import { Session } from '../../core/session/session';
import { TerminalList } from '../../features/terminal-list/terminal-list';
import { PI_PROMPT, fixturePermissions } from '../permission-fixture';
import { fixtureQuota } from '../usage-fixture/quota-fixture';
import { provideFixtureUpdates } from '../update-fixture';
import { homeFixture, type Scenario } from './fixtures';

const scenario = (new URLSearchParams(location.search).get('s') ?? 'conversations') as Scenario;
const data = homeFixture(scenario);

/** Dev-only: the home screen against canned data. `?s=conversations|blocked|loading|empty`. */
@Component({
  imports: [TerminalList],
  providers: [
    provideFixtureUpdates,
    { provide: HcClient, useValue: { state: signal('open'), ensureOpen: async () => undefined } },
    {
      provide: TerminalStore,
      useValue: {
        groups: data.groups,
        spaces: data.spaces,
        stream: signal('live'),
        syncing: signal(false),
        ensureStarted: async () => undefined,
      },
    },
    { provide: Quota, useFactory: () => fixtureQuota(new URLSearchParams(location.search).get('q')) },
    { provide: Permissions, useValue: fixturePermissions('t2', PI_PROMPT) },
    { provide: Session, useValue: { check: async () => 'authenticated' } },
    {
      provide: Summaries,
      useValue: {
        list: data.summaries,
        loaded: signal(data.loaded),
        now: signal(Date.now()),
        start: () => undefined,
        stop: () => undefined,
      },
    },
  ],
  templateUrl: './home-fixture.html',
})
export class HomeFixture {}
