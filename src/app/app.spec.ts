import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { LayoutActions } from './core/layout/layout-actions';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([]), provideServiceWorker('ngsw-worker.js', { enabled: false })] });
  });

  it('creates the app with a router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).toBeTruthy();
  });

  it('loads the layout host only when a layout sheet is first requested', async () => {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    expect(el.querySelector('app-layout-host')).toBeNull();
    TestBed.inject(LayoutActions).open({ kind: 'new-project' });
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    expect(el.querySelector('app-layout-host')).not.toBeNull();
    expect(document.body.querySelector('[data-layout-sheet]')).not.toBeNull();
  });

  it('mounts the toaster once the app is idle', async () => {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    for (let i = 0; i < 6 && !el.querySelector('hlm-toaster'); i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(el.querySelector('hlm-toaster')).not.toBeNull();
  });
});
