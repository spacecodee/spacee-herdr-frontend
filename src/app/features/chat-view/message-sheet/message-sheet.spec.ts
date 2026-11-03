import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { RewindAgent } from '../../../core/answers/rewind';
import { MessageSheet, type SheetAction, type SheetTarget } from './message-sheet';

@Component({
  imports: [MessageSheet],
  template: `<app-message-sheet
    [target]="target()"
    [agent]="agent()"
    [free]="free()"
    [busy]="busy()"
    [error]="error()"
    [codeChanges]="codeChanges()"
    (action)="actions.push($event)"
    (closed)="closed = closed + 1"
  />`,
})
class Host {
  target = signal<SheetTarget | null>(null);
  agent = signal<RewindAgent | null>('claude');
  free = signal(true);
  busy = signal(false);
  error = signal<string | null>(null);
  codeChanges = signal<boolean | null>(null);
  actions: SheetAction[] = [];
  closed = 0;
}

const sent: SheetTarget = { kind: 'sent', id: 'u2', text: 'add a test', removed: 3 };
const queued: SheetTarget = { kind: 'queued', id: 'q', text: 'then deploy' };

async function setup(target: SheetTarget | null) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.target.set(target);
  fixture.detectChanges();
  await fixture.whenStable();
  const body = () => document.body;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const q = <T extends HTMLElement>(sel: string) => body().querySelector<T>(sel);
  return { fixture, host: fixture.componentInstance, q, settle };
}

describe('MessageSheet', () => {
  it('stays closed without a target', async () => {
    const { q } = await setup(null);
    expect(q('[data-message-sheet]')).toBeNull();
  });

  it('a queued message offers Edit and Cancel', async () => {
    const { q, host, settle } = await setup(queued);
    expect(q('[data-quote]')?.textContent).toContain('then deploy');
    q<HTMLButtonElement>('[data-action-edit-queued]')!.click();
    q<HTMLButtonElement>('[data-action-cancel-queued]')!.click();
    await settle();
    expect(host.actions).toEqual([{ type: 'edit-queued' }, { type: 'cancel-queued' }]);
  });

  it('a sent message offers Edit and resend, Rewind to here and Copy', async () => {
    const { q, host, settle } = await setup(sent);
    q<HTMLButtonElement>('[data-action-edit-sent]')!.click();
    q<HTMLButtonElement>('[data-action-copy]')!.click();
    await settle();
    expect(host.actions).toEqual([{ type: 'edit-sent' }, { type: 'copy' }]);
    expect(q('[data-open-terminal]')).toBeNull();
  });

  it('Rewind to here asks for confirmation, quoting the message and counting what goes', async () => {
    const { q, host, settle } = await setup(sent);
    q<HTMLButtonElement>('[data-action-rewind]')!.click();
    await settle();
    expect(host.actions).toEqual([{ type: 'peek' }]);
    expect(q('[data-confirm-title]')?.textContent).toContain('Rewind to this message?');
    expect(q('[data-quote]')?.textContent).toContain('add a test');
    expect(q('[data-removed]')?.textContent).toContain('3 later messages will be removed from the conversation');
    q<HTMLButtonElement>('[data-confirm-rewind]')!.click();
    expect(host.actions.at(-1)).toEqual({ type: 'rewind', files: false });
  });

  it('shows "Also restore files" only when Claude has file changes there, off by default', async () => {
    const { q, host, settle } = await setup(sent);
    q<HTMLButtonElement>('[data-action-rewind]')!.click();
    await settle();
    expect(q('hlm-switch')).toBeNull();
    host.codeChanges.set(true);
    await settle();
    expect(q('hlm-switch')).not.toBeNull();
    expect(q('[data-files-note]')?.textContent).toContain('Undoes the agent’s file changes made after this message');
    q<HTMLButtonElement>('[data-confirm-rewind]')!.click();
    expect(host.actions.at(-1)).toEqual({ type: 'rewind', files: false });
  });

  it('hides the toggle when there is nothing to restore', async () => {
    const { q, host, settle } = await setup(sent);
    host.codeChanges.set(false);
    q<HTMLButtonElement>('[data-action-rewind]')!.click();
    await settle();
    expect(q('hlm-switch')).toBeNull();
  });

  it('Codex and opencode say what happens to files and have no toggle', async () => {
    const { q, host, settle } = await setup(sent);
    host.agent.set('codex');
    q<HTMLButtonElement>('[data-action-rewind]')!.click();
    await settle();
    expect(q('[data-files-note]')?.textContent).toContain('Files are not changed');
    expect(q('hlm-switch')).toBeNull();
    host.agent.set('opencode');
    await settle();
    expect(q('[data-files-note]')?.textContent).toContain('Files changed after this message are restored too');
  });

  it('shows the progress on the button and blocks a second press', async () => {
    const { q, host, settle } = await setup(sent);
    q<HTMLButtonElement>('[data-action-rewind]')!.click();
    host.busy.set(true);
    await settle();
    const button = q<HTMLButtonElement>('[data-confirm-rewind]')!;
    expect(button.textContent).toContain('Rewinding…');
    expect(button.disabled).toBe(true);
  });

  it('falls back to "Open the terminal to rewind" when the agent is not idle', async () => {
    const { q, host, settle } = await setup(sent);
    host.free.set(false);
    await settle();
    expect(q<HTMLButtonElement>('[data-action-edit-sent]')!.disabled).toBe(true);
    expect(q<HTMLButtonElement>('[data-action-rewind]')!.disabled).toBe(true);
    expect(q('[data-open-terminal-note]')?.textContent).toContain('Open the terminal to rewind');
    q<HTMLButtonElement>('[data-open-terminal]')!.click();
    expect(host.actions).toEqual([{ type: 'terminal' }]);
  });

  it('an agent that cannot be rewound only offers Copy and the terminal', async () => {
    const { q, host, settle } = await setup(sent);
    host.agent.set(null);
    await settle();
    expect(q<HTMLButtonElement>('[data-action-rewind]')!.disabled).toBe(true);
    expect(q<HTMLButtonElement>('[data-action-copy]')!.disabled).toBe(false);
  });

  it('shows a failure with a way to the terminal', async () => {
    const { q, host, settle } = await setup(queued);
    host.error.set('The agent already took the queued messages.');
    await settle();
    expect(q('[data-error]')?.textContent).toContain('already took');
    expect(q('[data-open-terminal]')).not.toBeNull();
  });
});
