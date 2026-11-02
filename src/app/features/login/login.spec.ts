import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Session } from '../../core/session/session';
import { Login } from './login';

/** Lets pending promises finish, then renders what they changed. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('Login', () => {
  let login: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function setup() {
    login = vi.fn();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: Session, useValue: { login } }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Login);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  async function submit(fixture: ComponentFixture<unknown>, el: HTMLElement, value: string) {
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle(fixture);
  }

  it('renders a labelled password field, the hint and a submit button', async () => {
    const { el } = await setup();
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(el.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('Access token');
    expect(el.textContent).toContain('~/.config/spacee-herdr/token');
    expect(el.querySelector('button[type="submit"]')).toBeTruthy();
  });

  it('logs in and goes to /', async () => {
    const { fixture, el } = await setup();
    login.mockResolvedValue('ok');
    await submit(fixture, el, 'abc');
    expect(login).toHaveBeenCalledWith('abc');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows "Token not valid" on 401 and stays', async () => {
    const { fixture, el } = await setup();
    login.mockResolvedValue('invalid');
    await submit(fixture, el, 'bad');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Token not valid');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('tells when the bridge cannot be reached', async () => {
    const { fixture, el } = await setup();
    login.mockResolvedValue('unreachable');
    await submit(fixture, el, 'x');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not reach the bridge');
  });

  it('does not submit an empty token', async () => {
    const { fixture, el } = await setup();
    await submit(fixture, el, '');
    expect(login).not.toHaveBeenCalled();
  });
});
