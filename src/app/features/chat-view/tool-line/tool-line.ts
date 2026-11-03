import { Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleAlert,
  lucideFileText,
  lucideGlobe,
  lucideLoaderCircle,
  lucidePencil,
  lucideSearch,
  lucideTerminal,
  lucideWrench,
} from '@ng-icons/lucide';
import { HlmTraceImports } from '@spartan-ng/helm/trace';
import { toolKind, type ToolKind } from '../../../core/chat/tool-kind';
import type { ToolPart } from '../../../core/chat/types';

const KIND_ICONS: Record<ToolKind, string> = {
  shell: 'lucideTerminal',
  read: 'lucideFileText',
  edit: 'lucidePencil',
  search: 'lucideSearch',
  web: 'lucideGlobe',
  other: 'lucideWrench',
};

/** One tool call: a line with kind icon, summary and status; expands to input and output. */
@Component({
  selector: 'app-tool-line',
  imports: [NgIcon, ...HlmTraceImports],
  viewProviders: [
    provideIcons({
      lucideCheck,
      lucideCircleAlert,
      lucideFileText,
      lucideGlobe,
      lucideLoaderCircle,
      lucidePencil,
      lucideSearch,
      lucideTerminal,
      lucideWrench,
    }),
  ],
  host: { class: 'block min-w-0' },
  styleUrl: './tool-line.css',
  templateUrl: './tool-line.html',
})
export class ToolLine {
  readonly part = input.required<ToolPart>();
  protected readonly icon = computed(() => KIND_ICONS[toolKind(this.part().name)]);
  protected readonly lineStatus = computed<'running' | 'error' | undefined>(() => {
    const status = this.part().status;
    return status === 'ok' ? undefined : status;
  });
  protected readonly statusText = computed(
    () => ({ running: 'Running', ok: 'Done', error: 'Failed' })[this.part().status],
  );
  protected readonly hasDetails = computed(() => !!(this.part().input || this.part().output));
}
