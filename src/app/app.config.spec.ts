import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';

describe('appConfig', () => {
  it('keeps overlays out of the top layer so toasts (z-index) stay above sheets and dialogs', () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });
    expect(TestBed.inject(OVERLAY_DEFAULT_CONFIG).usePopover).toBe(false);
  });
});
