import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideGitBranch } from '@ng-icons/lucide';
import { fileCount } from '../../core/changes/changes-view';
import type { Totals } from '../../core/changes/changes';

/** "+N −N · N files": the project has uncommitted changes. Opens the Changes screen. */
@Component({
  selector: 'app-changes-chip',
  imports: [RouterLink, NgIcon],
  viewProviders: [provideIcons({ lucideChevronRight, lucideGitBranch })],
  host: { class: 'block' },
  styleUrl: './changes-chip.css',
  templateUrl: './changes-chip.html',
})
export class ChangesChip {
  readonly address = input.required<string>();
  readonly totals = input.required<Totals>();

  protected readonly count = fileCount;
}
