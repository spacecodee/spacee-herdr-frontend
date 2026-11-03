import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConnectionCard } from './connection-card';

describe('ConnectionCard', () => {
  function setup(canReattach: boolean) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ConnectionCard);
    fixture.componentRef.setInput('text', 'Connection lost');
    fixture.componentRef.setInput('canReattach', canReattach);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('says what happened and offers Reattach and Back', () => {
    const { fixture, el } = setup(true);
    expect(el.querySelector('h2')?.textContent).toBe('Disconnected');
    expect(el.textContent).toContain('Connection lost');
    let reattached = 0;
    fixture.componentInstance.reattach.subscribe(() => reattached++);
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(reattached).toBe(1);
    expect(el.querySelector('a')?.textContent?.trim()).toBe('Back');
  });

  it('has no Reattach when reattaching cannot work', () => {
    const { el } = setup(false);
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('a')).not.toBeNull();
  });
});
