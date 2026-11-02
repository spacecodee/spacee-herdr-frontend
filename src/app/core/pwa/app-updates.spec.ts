import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdates, RELOAD_PAGE } from './app-updates';

describe('AppUpdates', () => {
  let events: Subject<VersionEvent>;
  let sw: { isEnabled: boolean; versionUpdates: Subject<VersionEvent>; unrecoverable: Subject<unknown>; checkForUpdate: ReturnType<typeof vi.fn>; activateUpdate: ReturnType<typeof vi.fn> };
  let reload: ReturnType<typeof vi.fn>;

  const setup = (isEnabled = true) => {
    events = new Subject();
    sw = {
      isEnabled,
      versionUpdates: events,
      unrecoverable: new Subject(),
      checkForUpdate: vi.fn().mockResolvedValue(false),
      activateUpdate: vi.fn().mockResolvedValue(true),
    };
    reload = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: sw },
        { provide: RELOAD_PAGE, useValue: reload },
      ],
    });
    return TestBed.inject(AppUpdates);
  };

  const visibility = (state: 'visible' | 'hidden') => {
    const doc = TestBed.inject(DOCUMENT);
    Object.defineProperty(doc, 'visibilityState', { value: state, configurable: true });
    doc.dispatchEvent(new Event('visibilitychange'));
  };

  const ready = { type: 'VERSION_READY' } as VersionEvent;

  it('starts with no update', () => {
    expect(setup().updateReady()).toBe(false);
  });

  it('flags an update on VERSION_READY only', () => {
    const updates = setup();
    events.next({ type: 'VERSION_DETECTED' } as VersionEvent);
    expect(updates.updateReady()).toBe(false);
    events.next(ready);
    expect(updates.updateReady()).toBe(true);
  });

  it('applyUpdate activates the new version then reloads, in that order', async () => {
    const updates = setup();
    let activated = false;
    sw.activateUpdate.mockImplementation(async () => {
      activated = true;
      return true;
    });
    reload.mockImplementation(() => expect(activated).toBe(true));
    await updates.applyUpdate();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('checks for an update when the page becomes visible, not when hidden', () => {
    setup();
    visibility('hidden');
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
    visibility('visible');
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('reloads on an unrecoverable state', () => {
    setup();
    sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'x' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the service worker is disabled', () => {
    const updates = setup(false);
    visibility('visible');
    sw.unrecoverable.next({});
    events.next(ready);
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(updates.updateReady()).toBe(false);
  });

  it('swallows a failed update check', async () => {
    setup();
    sw.checkForUpdate.mockRejectedValue(new Error('offline'));
    visibility('visible');
    await Promise.resolve();
    expect(sw.checkForUpdate).toHaveBeenCalled();
  });
});
