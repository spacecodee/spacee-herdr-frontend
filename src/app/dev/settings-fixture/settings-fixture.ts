import { Component } from '@angular/core';
import { SettingsPage } from '../../features/settings/settings';
import { provideFixtureUpdates } from '../update-fixture';

/** Dev-only: the settings screen with a canned update state. `?u=none|ready|later|reloading`. */
@Component({
  imports: [SettingsPage],
  providers: [provideFixtureUpdates],
  templateUrl: './settings-fixture.html',
})
export class SettingsFixture {}
