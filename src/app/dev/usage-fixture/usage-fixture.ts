import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Machines } from '../../core/machines/machines';
import { Quota } from '../../core/quota/quota';
import { Usage } from '../../features/usage/usage/usage';
import { fixtureQuota } from './quota-fixture';

/** Dev-only: the Usage screen with canned quota. `?s=low|blocked|loading|not-installed|error|signed-out|stale`. */
@Component({
  imports: [Usage],
  providers: [
    { provide: Quota, useFactory: () => fixtureQuota(inject(ActivatedRoute).snapshot.queryParamMap.get('s')) },
    {
      provide: Machines,
      useValue: {
        rows: signal([
          { name: 'workstation', target: '', local: true, status: null },
          { name: 'gandalf', target: 'me@gandalf', local: false, status: { kind: 'connected', dot: 'done', label: 'Connected' } },
          { name: 'rohan', target: 'me@rohan', local: false, status: { kind: 'offline', dot: 'idle', label: 'Offline' } },
        ]).asReadonly(),
      },
    },
  ],
  templateUrl: './usage-fixture.html',
})
export class UsageFixture {}
