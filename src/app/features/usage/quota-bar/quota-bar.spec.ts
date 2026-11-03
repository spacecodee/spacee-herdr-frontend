import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { QuotaBar } from './quota-bar';

describe('QuotaBar', () => {
  let fixture: ComponentFixture<QuotaBar>;
  const el = () => fixture.nativeElement as HTMLElement;

  function render(inputs: Record<string, unknown>) {
    fixture = TestBed.createComponent(QuotaBar);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
  }

  it('is a labelled progress bar of the used share', () => {
    render({ used: 42, label: 'Claude 5-hour' });
    const bar = el().querySelector('hlm-progress')!;
    expect(bar.getAttribute('aria-label')).toBe('Claude 5-hour');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
  });

  it('colors by tier with the amber token and blocked red; ink otherwise', () => {
    const cls = (tier: string) => {
      render({ used: 50, tier, label: 'x' });
      return el().querySelector('[data-fill]')!.className;
    };
    expect(cls('ink')).toContain('bg-foreground');
    expect(cls('amber')).toContain('bg-amber');
    expect(cls('low')).toContain('bg-amber');
    expect(cls('blocked')).toContain('bg-status-blocked');
  });

  it('draws the pace tick only when it has a position', () => {
    render({ used: 50, label: 'x', tick: null });
    expect(el().querySelector('[data-tick]')).toBeNull();
    render({ used: 50, label: 'x', tick: 80 });
    expect(el().querySelector<HTMLElement>('[data-tick]')!.style.left).toBe('80%');
  });
});
