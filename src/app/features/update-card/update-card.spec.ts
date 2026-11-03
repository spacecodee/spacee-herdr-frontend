import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppUpdates } from '../../core/pwa/app-updates';
import { UpdateCard } from './update-card';

describe('UpdateCard', () => {
  const cardVisible = signal(false);
  const applying = signal(false);
  const updates = { cardVisible, applying, later: vi.fn(), applyUpdate: vi.fn() };
  let fixture: ComponentFixture<UpdateCard>;
  const el = () => fixture.nativeElement as HTMLElement;
  const card = () => el().querySelector('[data-update-card]');
  const button = (name: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes(name)) as HTMLButtonElement | undefined;

  beforeEach(() => {
    cardVisible.set(false);
    applying.set(false);
    updates.later.mockReset();
    updates.applyUpdate.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: AppUpdates, useValue: updates }] });
    fixture = TestBed.createComponent(UpdateCard);
    fixture.detectChanges();
  });

  it('renders nothing without an update', () => {
    expect(card()).toBeNull();
  });

  it('shows the update ready card with Later and Reload', () => {
    cardVisible.set(true);
    fixture.detectChanges();
    expect(card()?.textContent).toContain('Update ready');
    expect(card()?.textContent).toContain('Reload to use the new version.');
    expect(button('Later')).toBeTruthy();
    expect(button('Reload')).toBeTruthy();
  });

  it('Reload applies the update and Later postpones it', () => {
    cardVisible.set(true);
    fixture.detectChanges();
    button('Reload')!.click();
    expect(updates.applyUpdate).toHaveBeenCalledTimes(1);
    button('Later')!.click();
    expect(updates.later).toHaveBeenCalledTimes(1);
  });

  it('while reloading shows a spinner and Reloading…, disables Later and stays', () => {
    cardVisible.set(true);
    applying.set(true);
    fixture.detectChanges();
    expect(card()).not.toBeNull();
    expect(button('Reloading…')).toBeTruthy();
    expect(button('Reloading…')!.disabled).toBe(true);
    expect(button('Later')!.disabled).toBe(true);
    expect(el().querySelector('hlm-spinner')).not.toBeNull();
  });
});
