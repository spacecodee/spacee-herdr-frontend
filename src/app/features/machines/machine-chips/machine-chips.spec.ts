import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Machines, type MachineRow } from '../../../core/machines/machines';
import { machineStatus } from '../../../core/machines/machine-format';
import { MachineChips } from './machine-chips';

const row = (name: string, state: string, local = false): MachineRow => ({
  name, target: local ? '' : name, local, status: local ? null : machineStatus({ state, version: '0.4.0' }, '0.4.0', 0),
});

describe('MachineChips', () => {
  const rows = signal<MachineRow[]>([]);
  let fixture: ComponentFixture<MachineChips>;
  const chips = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-machine-chip]')];

  beforeEach(() => {
    rows.set([row('workstation', '', true), row('gandalf', 'connected'), row('rohan', 'offline')]);
    TestBed.configureTestingModule({ providers: [{ provide: Machines, useValue: { rows } }] });
    fixture = TestBed.createComponent(MachineChips);
    fixture.detectChanges();
  });

  it('lists this machine first, then the added ones with a status dot; offline ones are muted and disabled', () => {
    expect(chips().map((c) => c.textContent!.trim())).toEqual(['workstation', 'gandalf', 'rohan']);
    expect(chips()[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips()[1].querySelector('[data-dot]')!.className).toContain('bg-status-done');
    expect(chips()[2].querySelector('[data-dot]')!.className).toContain('bg-status-idle');
    expect(chips()[2].disabled).toBe(true);
  });

  it('picking a machine sets the model: "" for this machine, the name for an added one', () => {
    chips()[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.machine()).toBe('gandalf');
    expect(chips()[1].getAttribute('aria-pressed')).toBe('true');
    expect(chips()[0].getAttribute('aria-pressed')).toBe('false');
    chips()[0].click();
    expect(fixture.componentInstance.machine()).toBe('');
  });

  it('shows nothing when there is only this machine', () => {
    rows.set([row('workstation', '', true)]);
    fixture.detectChanges();
    expect(chips()).toHaveLength(0);
  });
});
