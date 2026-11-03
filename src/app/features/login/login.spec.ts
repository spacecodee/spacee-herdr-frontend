import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
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
  let loginWithCode: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function setup(query: Record<string, string> = {}, codeResult: string = 'ok') {
    login = vi.fn();
    loginWithCode = vi.fn().mockResolvedValue(codeResult);
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: Session, useValue: { login, loginWithCode } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Login);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  const boxes = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLInputElement>('input[data-code-box]'));

  async function type(fixture: ComponentFixture<unknown>, box: HTMLInputElement, value: string) {
    box.value = value;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(fixture);
  }

  function paste(box: HTMLInputElement, text: string) {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    box.dispatchEvent(event);
    return event;
  }

  const alert = (el: HTMLElement) => el.querySelector('[role="alert"]')?.textContent ?? '';
  const link = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

  describe('pairing code', () => {
    it('is the default view: six labelled boxes that suggest a one-time code', async () => {
      const { el } = await setup();
      expect(el.textContent).toContain('Enter the pairing code');
      expect(boxes(el)).toHaveLength(6);
      expect(boxes(el)[0].getAttribute('aria-label')).toBe('Pairing code character 1 of 6');
      expect(boxes(el)[0].getAttribute('autocomplete')).toBe('one-time-code');
      expect(boxes(el)[0].getAttribute('inputmode')).toBe('text');
      expect(el.querySelector('input[type="password"]')).toBeNull();
    });

    it('uppercases what is typed and moves to the next box', async () => {
      const { fixture, el } = await setup();
      await type(fixture, boxes(el)[0], 'k');
      expect(boxes(el)[0].value).toBe('K');
      expect(document.activeElement).toBe(boxes(el)[1]);
    });

    it('ignores characters that are not letters or digits', async () => {
      const { fixture, el } = await setup();
      await type(fixture, boxes(el)[0], ' ');
      expect(boxes(el)[0].value).toBe('');
      expect(document.activeElement).not.toBe(boxes(el)[1]);
    });

    it('backspace in an empty box clears and focuses the previous one', async () => {
      const { fixture, el } = await setup();
      await type(fixture, boxes(el)[0], 'k');
      await type(fixture, boxes(el)[1], '7');
      boxes(el)[2].focus();
      boxes(el)[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
      await settle(fixture);
      expect(document.activeElement).toBe(boxes(el)[1]);
      expect(boxes(el)[1].value).toBe('');
      expect(boxes(el)[0].value).toBe('K');
    });

    it('submits once the sixth character is typed', async () => {
      const { fixture, el } = await setup();
      loginWithCode.mockResolvedValue('ok');
      for (const [i, c] of [...'K7M2QX'].entries()) await type(fixture, boxes(el)[i], c);
      expect(loginWithCode).toHaveBeenCalledTimes(1);
      expect(loginWithCode).toHaveBeenCalledWith('K7M2QX');
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it.each(['K7M2QX', 'k7m 2qx', ' K7M-2QX\n'])('pasting %j fills every box and submits', async (text) => {
      const { fixture, el } = await setup();
      loginWithCode.mockResolvedValue('ok');
      const event = paste(boxes(el)[3], text);
      await settle(fixture);
      expect(event.defaultPrevented).toBe(true);
      expect(boxes(el).map((b) => b.value).join('')).toBe('K7M2QX');
      expect(loginWithCode).toHaveBeenCalledWith('K7M2QX');
    });

    it('takes a whole code that autofill puts in one box', async () => {
      const { fixture, el } = await setup();
      loginWithCode.mockResolvedValue('ok');
      await type(fixture, boxes(el)[0], 'k7m2qx');
      expect(loginWithCode).toHaveBeenCalledWith('K7M2QX');
    });

    it('shows "Code expired or wrong", clears the boxes and focuses the first', async () => {
      const { fixture, el } = await setup();
      loginWithCode.mockResolvedValue('invalid');
      paste(boxes(el)[0], 'AAAAAA');
      await settle(fixture);
      expect(alert(el)).toContain('Code expired or wrong');
      expect(boxes(el).every((b) => b.value === '')).toBe(true);
      expect(document.activeElement).toBe(boxes(el)[0]);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('says to wait or use the token when the bridge locked code logins', async () => {
      const { fixture, el } = await setup();
      loginWithCode.mockResolvedValue('locked');
      paste(boxes(el)[0], 'AAAAAA');
      await settle(fixture);
      expect(alert(el)).toContain('Too many attempts. Try again in 10 minutes or use the access token.');
    });

    it('tells when the bridge cannot be reached', async () => {
      const { fixture, el } = await setup();
      loginWithCode.mockResolvedValue('unreachable');
      paste(boxes(el)[0], 'AAAAAA');
      await settle(fixture);
      expect(alert(el)).toContain('Could not reach the bridge');
    });

    it('does not submit twice while a login is running', async () => {
      const { fixture, el } = await setup();
      loginWithCode.mockReturnValue(new Promise(() => undefined));
      paste(boxes(el)[0], 'AAAAAA');
      paste(boxes(el)[0], 'BBBBBB');
      await settle(fixture);
      expect(loginWithCode).toHaveBeenCalledTimes(1);
    });
  });

  describe('login link (?code=)', () => {
    it('fills the boxes and signs in', async () => {
      const { el } = await setup({ code: 'k7m2qx' }, 'unreachable');
      expect(loginWithCode).toHaveBeenCalledWith('K7M2QX');
      expect(alert(el)).toContain('Could not reach the bridge');
    });

    it('ignores a code that is not six characters long', async () => {
      const { el } = await setup({ code: 'K7M' });
      expect(loginWithCode).not.toHaveBeenCalled();
      expect(boxes(el).map((b) => b.value).join('')).toBe('K7M');
    });
  });

  describe('access token', () => {
    async function openToken() {
      const ctx = await setup();
      link(ctx.el, 'Use access token instead')?.click();
      await settle(ctx.fixture);
      return ctx;
    }

    async function submit(fixture: ComponentFixture<unknown>, el: HTMLElement, value: string) {
      const input = el.querySelector('input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await settle(fixture);
    }

    it('swaps the boxes for a labelled password field, the hint and a submit button', async () => {
      const { el } = await openToken();
      const input = el.querySelector('input') as HTMLInputElement;
      expect(boxes(el)).toHaveLength(0);
      expect(input.type).toBe('password');
      expect(el.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('Access token');
      expect(el.textContent).toContain('~/.config/spacee-herdr/token');
      expect(el.querySelector('button[type="submit"]')).toBeTruthy();
    });

    it('goes back to the pairing code', async () => {
      const { fixture, el } = await openToken();
      link(el, 'Use pairing code instead')?.click();
      await settle(fixture);
      expect(boxes(el)).toHaveLength(6);
    });

    it('logs in and goes to /', async () => {
      const { fixture, el } = await openToken();
      login.mockResolvedValue('ok');
      await submit(fixture, el, 'abc');
      expect(login).toHaveBeenCalledWith('abc');
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('shows "Token not valid" on 401 and stays', async () => {
      const { fixture, el } = await openToken();
      login.mockResolvedValue('invalid');
      await submit(fixture, el, 'bad');
      expect(alert(el)).toContain('Token not valid');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('tells when the bridge cannot be reached', async () => {
      const { fixture, el } = await openToken();
      login.mockResolvedValue('unreachable');
      await submit(fixture, el, 'x');
      expect(alert(el)).toContain('Could not reach the bridge');
    });

    it('does not submit an empty token', async () => {
      const { fixture, el } = await openToken();
      await submit(fixture, el, '');
      expect(login).not.toHaveBeenCalled();
    });

    it('clears an error from the other view when switching', async () => {
      const { fixture, el } = await setup();
      loginWithCode.mockResolvedValue('invalid');
      paste(boxes(el)[0], 'AAAAAA');
      await settle(fixture);
      link(el, 'Use access token instead')?.click();
      await settle(fixture);
      expect(alert(el)).toBe('');
    });
  });
});
