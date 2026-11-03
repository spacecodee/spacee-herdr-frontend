import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Changes } from '../../core/changes/changes';
import { ChangesChip } from '../../features/changes-chip/changes-chip';
import { ChatView } from '../../features/chat-view/chat-view';
import { LayoutMenu } from '../../features/layout/layout-menu/layout-menu';
import { ComposeBar } from '../../features/terminal-view/compose-bar/compose-bar';
import { ViewHeader } from '../../features/terminal-view/view-header/view-header';
import { FIXTURE_ADDRESS, MESSAGES, changesFixtureProviders } from './changes-fixtures';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFileDiff } from '@ng-icons/lucide';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';

/** Dev-only: the chat with the Changes chip and menu item. `?s=chip|menu|link`. */
@Component({
  imports: [ChangesChip, ChatView, ComposeBar, LayoutMenu, NgIcon, RouterLink, ViewHeader, ...HlmButtonImports],
  providers: changesFixtureProviders,
  viewProviders: [provideIcons({ lucideFileDiff })],
  templateUrl: './changes-fixture.html',
})
export class ChangesFixture {
  protected readonly address = FIXTURE_ADDRESS;
  protected readonly scenario = inject(ActivatedRoute).snapshot.queryParamMap.get('s') ?? 'chip';
  protected readonly totals = inject(Changes).summaryOf('', '')();
  protected readonly messages = MESSAGES(this.scenario === 'link');
}
