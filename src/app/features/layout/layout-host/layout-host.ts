import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideFolder } from '@ng-icons/lucide';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { TerminalStore } from '../../../core/hc/terminal-store';
import { LayoutActions, type LayoutRequest } from '../../../core/layout/layout-actions';
import {
  LAUNCH_OPTIONS,
  closeCopy,
  folderError,
  homeFolder,
  nameError,
  type LaunchOption,
} from '../../../core/layout/layout-rules';
import { AgentAvatar } from '../../terminal-list/agent-avatar/agent-avatar';
import { FolderPicker } from '../folder-picker/folder-picker';

/**
 * The one place that shows the layout sheets (new project, new tab, split, rename) and the
 * confirmation before closing. Menus anywhere open them through `LayoutActions`.
 */
@Component({
  selector: 'app-layout-host',
  imports: [AgentAvatar, FolderPicker, NgIcon, ...HlmAlertDialogImports, ...HlmButtonImports, ...HlmInputImports, ...HlmLabelImports, ...HlmSheetImports],
  viewProviders: [provideIcons({ lucideChevronRight, lucideFolder })],
  templateUrl: './layout-host.html',
  styleUrl: './layout-host.css',
})
export class LayoutHost {
  protected readonly actions = inject(LayoutActions);
  private readonly store = inject(TerminalStore);

  protected readonly options = LAUNCH_OPTIONS;
  protected readonly name = signal('');
  protected readonly folder = signal('');
  protected readonly machine = signal('');
  protected readonly optionId = signal(LAUNCH_OPTIONS[0].id);
  /** Errors show after the first submit, not while the person is still typing. */
  protected readonly submitted = signal(false);

  /** The last request, kept while the sheet slides out so its content does not vanish mid-animation. */
  private readonly lastRequest = signal<LayoutRequest | null>(null);
  protected readonly shown = this.lastRequest.asReadonly();
  protected readonly sheet = computed(() => {
    const r = this.actions.request();
    return r !== null && r.kind !== 'close' ? r : null;
  });
  protected readonly sheetState = computed(() => (this.sheet() ? 'open' : 'closed'));
  protected readonly sheetRequest = computed(() => {
    const r = this.shown();
    return r !== null && r.kind !== 'close' ? r : null;
  });
  protected readonly dialogState = computed(() => (this.actions.request()?.kind === 'close' ? 'open' : 'closed'));
  protected readonly closeRequest = computed(() => {
    const r = this.shown();
    return r?.kind === 'close' ? r : null;
  });
  protected readonly copy = computed(() => {
    const r = this.closeRequest();
    return r ? closeCopy(r.target, r.name, r.terminals) : null;
  });

  /** New project picks its folder (and machine) in the folder picker; a new tab still types it. */
  protected readonly usesPicker = computed(() => this.sheetRequest()?.kind === 'new-project');
  protected readonly picking = signal(false);
  protected readonly machineLabel = computed(() => {
    const machine = this.machine();
    return this.store.groups().find((g) => (machine === '' ? g.local : g.name === machine))?.name ?? machine;
  });
  protected readonly folderHint = computed(
    () => homeFolder(this.store.groups().flatMap((g) => (g.local ? g.terminals.map((t) => t.cwd) : []))) || '/home/me/code',
  );

  protected readonly title = computed(() => {
    const r = this.sheetRequest();
    switch (r?.kind) {
      case 'new-project':
        return 'New project';
      case 'new-tab':
        return `New tab in ${r.spaceName}`;
      case 'split':
        return r.direction === 'right' ? 'Split right' : 'Split down';
      case 'rename':
        return r.target === 'space' ? 'Rename project' : 'Rename tab';
      default:
        return '';
    }
  });
  protected readonly submitLabel = computed(() => {
    const r = this.sheetRequest();
    const busy = this.actions.busy();
    if (r?.kind === 'rename') return busy ? 'Saving…' : 'Save';
    if (r?.kind === 'split') return busy ? 'Splitting…' : 'Split';
    return busy ? 'Creating…' : 'Create';
  });
  protected readonly needsName = computed(() => {
    const k = this.sheetRequest()?.kind;
    return k === 'new-project' || k === 'new-tab' || k === 'rename';
  });
  protected readonly needsFolder = computed(() => {
    const k = this.sheetRequest()?.kind;
    return k === 'new-project' || k === 'new-tab';
  });
  protected readonly needsAgent = computed(() => this.sheetRequest()?.kind !== 'rename');
  protected readonly nameProblem = computed(() => (this.submitted() ? nameError(this.name()) : ''));
  protected readonly folderProblem = computed(() => {
    if (!this.submitted()) return '';
    if (this.usesPicker()) return this.folder() === '' ? 'Choose a folder.' : '';
    return folderError(this.folder(), this.sheetRequest()?.kind === 'new-tab');
  });

  constructor() {
    effect(() => {
      const request = this.actions.request();
      if (request === null) return;
      untracked(() => {
        this.lastRequest.set(request);
        this.name.set(request.kind === 'rename' ? request.name : '');
        this.folder.set('');
        this.machine.set('');
        this.picking.set(false);
        this.optionId.set(LAUNCH_OPTIONS[0].id);
        this.submitted.set(false);
      });
    });
  }

  protected chooseFolder(choice: { machine: string; folder: string }): void {
    this.machine.set(choice.machine);
    this.folder.set(choice.folder);
    this.picking.set(false);
  }

  protected setText(target: 'name' | 'folder' | 'machine', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this[target].set(value);
  }

  private option(): LaunchOption {
    return LAUNCH_OPTIONS.find((o) => o.id === this.optionId()) ?? LAUNCH_OPTIONS[0];
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const r = this.sheetRequest();
    if (r === null || this.actions.busy()) return;
    this.submitted.set(true);
    const option = this.option();
    switch (r.kind) {
      case 'new-project':
        if (nameError(this.name()) || folderError(this.folder())) return;
        void this.actions.createProject({ name: this.name(), folder: this.folder(), machine: this.machine(), option });
        break;
      case 'new-tab':
        if (nameError(this.name()) || folderError(this.folder(), true)) return;
        void this.actions.createTab({ space: r.spaceId, name: this.name(), folder: this.folder(), option });
        break;
      case 'split':
        void this.actions.split({ tab: r.tabId, pane: r.paneId, direction: r.direction, option });
        break;
      case 'rename':
        if (nameError(this.name())) return;
        void this.actions.rename(r.target, r.id, this.name());
        break;
    }
  }

  protected confirmClose(): void {
    const r = this.closeRequest();
    if (r) void this.actions.close(r.target);
  }
}
