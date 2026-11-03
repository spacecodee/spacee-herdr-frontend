import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ChangesChip } from './changes-chip';

describe('ChangesChip', () => {
  it('shows the counts and links to the Changes screen of the terminal', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ChangesChip);
    fixture.componentRef.setInput('address', 'rohan/t7');
    fixture.componentRef.setInput('totals', { files: 6, added: 124, deleted: 18 });
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('[data-changes-chip]') as HTMLAnchorElement;
    // The gaps between the parts come from CSS (flex gap), not from text.
    expect(link.textContent!.replace(/\s+/g, '')).toBe('+124−18·6files');
    expect(link.getAttribute('href')).toBe('/t/rohan%2Ft7/changes');
    expect(link.getAttribute('aria-label')).toBe('Changes: 124 added, 18 removed, 6 files');
  });

  it('says "1 file" for one', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ChangesChip);
    fixture.componentRef.setInput('address', 't1');
    fixture.componentRef.setInput('totals', { files: 1, added: 1, deleted: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 file');
    expect(fixture.nativeElement.textContent).not.toContain('1 files');
  });
});
