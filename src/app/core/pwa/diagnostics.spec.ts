import { formatDiagnostics, scriptBuildId, type DiagnosticsSnapshot } from './diagnostics';

const snapshot: DiagnosticsSnapshot = {
  build: 'main-ABC123.js',
  sw: 'controlling (activated)',
  standalone: { navigator: true, displayMode: true },
  statusBarMeta: 'default',
  inner: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  dpr: 3,
  visual: { width: 390, height: 797, offsetTop: 0, scale: 1 },
  units: { vh: 844, dvh: 797, svh: 797, lvh: 844 },
  safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('formatDiagnostics', () => {
  it('prints one labelled line per measurement', () => {
    expect(formatDiagnostics(snapshot).split('\n')).toEqual([
      'build: main-ABC123.js',
      'sw: controlling (activated)',
      'standalone: navigator=true display-mode=true',
      'status-bar meta: default',
      'inner: 390x844',
      'screen: 390x844 @3x',
      'visualViewport: 390x797 top=0 scale=1',
      'vh=844 dvh=797 svh=797 lvh=844',
      'safe-area: top=47 right=0 bottom=34 left=0',
    ]);
  });

  it('shows missing values as n/a', () => {
    const text = formatDiagnostics({
      ...snapshot,
      build: null,
      statusBarMeta: null,
      visual: null,
      standalone: { navigator: null, displayMode: false },
    });
    expect(text).toContain('build: n/a');
    expect(text).toContain('status-bar meta: n/a');
    expect(text).toContain('visualViewport: n/a');
    expect(text).toContain('standalone: navigator=n/a display-mode=false');
  });
});

describe('scriptBuildId', () => {
  it('returns the file name of the main bundle', () => {
    const doc = document.implementation.createHTMLDocument('x');
    doc.body.innerHTML = '<script src="/chunk-1.js"></script><script src="main-XYZ789.js" type="module"></script>';
    expect(scriptBuildId(doc)).toBe('main-XYZ789.js');
  });

  it('is null without a main bundle', () => {
    expect(scriptBuildId(document.implementation.createHTMLDocument('x'))).toBeNull();
  });
});
