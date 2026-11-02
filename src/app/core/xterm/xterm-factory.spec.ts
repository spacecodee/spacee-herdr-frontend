import { TestBed } from '@angular/core/testing';
import { XtermFactory } from './xterm-factory';

// xterm needs a real layout engine (canvas, measured fonts); the view specs use a fake handle and
// the real thing is checked in a browser. Here only the wiring that jsdom can exercise.
describe('XtermFactory', () => {
  it('is injectable and exposes create()', () => {
    const factory = TestBed.inject(XtermFactory);
    expect(typeof factory.create).toBe('function');
  });
});
