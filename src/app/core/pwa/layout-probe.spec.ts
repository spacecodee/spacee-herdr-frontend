import { formatLayout, measureLayout } from './layout-probe';

describe('formatLayout', () => {
  it('prints top/height per part and hidden parts', () => {
    expect(
      formatLayout({
        clientHeight: 844,
        parts: {
          root: { top: 0, height: 844 },
          header: { top: 0, height: 44 },
          screen: { top: 44, height: 700 },
          compose: null,
          keybar: { top: 744, height: 100 },
        },
      }).split('\n'),
    ).toEqual([
      'layout (terminal view): clientHeight=844',
      '  root: top=0 h=844',
      '  header: top=0 h=44',
      '  screen: top=44 h=700',
      '  compose: hidden',
      '  keybar: top=744 h=100',
    ]);
  });

  it('says so when no terminal view was opened yet', () => {
    expect(formatLayout(null)).toBe('layout (terminal view): not opened yet');
  });
});

describe('measureLayout', () => {
  it('measures marked parts and reports missing ones as hidden', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-probe="header"></div><div data-probe="keybar"></div>';
    const snap = measureLayout(root, document);
    expect(snap.parts.header).toEqual({ top: 0, height: 0 });
    expect(snap.parts.compose).toBeNull();
    expect(snap.parts.root).toEqual({ top: 0, height: 0 });
  });
});
