import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { loadHistory, pushHistory } from '../../../core/input/history';
import { ComposeBar } from './compose-bar';

@Component({
  imports: [ComposeBar],
  template: `<app-compose-bar
    [address]="address"
    [disabled]="disabled()"
    [ctrl]="ctrl()"
    (send)="sent.push($event)"
    (ctrlChar)="ctrlChars.push($event)"
  />`,
})
class Host {
  address = 'rohan/t7';
  disabled = signal(false);
  ctrl = signal(false);
  sent: string[] = [];
  ctrlChars: string[] = [];
  bar = viewChild.required(ComposeBar);
}

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

describe('ComposeBar', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  const host = () => fixture.componentInstance;
  const el = () => fixture.nativeElement as HTMLElement;
  const field = () => el().querySelector('textarea')!;
  const send = () => el().querySelector<HTMLButtonElement>('button[aria-label="Send"]')!;
  const chips = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button[aria-label^="Use: "]'));

  function type(text: string): void {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
  function key(init: KeyboardEventInit & { key: string }): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
    field().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function create(): void {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  }

  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  describe('field', () => {
    beforeEach(create);

    it('is a labelled textarea with iOS keyboard help on', () => {
      const f = field();
      expect(f.getAttribute('aria-label')).toBe('Message');
      expect(f.getAttribute('autocorrect')).toBe('on');
      expect(f.getAttribute('spellcheck')).toBe('true');
      expect(f.getAttribute('autocapitalize')).toBe('sentences');
      expect(f.getAttribute('enterkeyhint')).toBe('send');
      expect(f.rows).toBe(1);
    });

    it('has a 44px Send button, disabled while empty', () => {
      expect(send().disabled).toBe(true);
      type('echo hi');
      expect(send().disabled).toBe(false);
      type('   ');
      expect(send().disabled).toBe(true);
    });
  });

  describe('sending', () => {
    beforeEach(create);

    it('sends on the Send button, clears and records history', () => {
      type('echo hi');
      send().click();
      fixture.detectChanges();
      expect(host().sent).toEqual(['echo hi']);
      expect(field().value).toBe('');
      expect(loadHistory('rohan/t7')).toEqual(['echo hi']);
    });

    it('sends on Enter and does not insert a newline', () => {
      type('ls');
      const event = key({ key: 'Enter' });
      expect(event.defaultPrevented).toBe(true);
      expect(host().sent).toEqual(['ls']);
      expect(field().value).toBe('');
    });

    it('lets Shift+Enter insert a newline', () => {
      type('a');
      const event = key({ key: 'Enter', shiftKey: true });
      expect(event.defaultPrevented).toBe(false);
      expect(host().sent).toEqual([]);
    });

    it('ignores Enter while an IME composition is open', () => {
      type('ni');
      const event = key({ key: 'Enter', isComposing: true });
      expect(event.defaultPrevented).toBe(false);
      expect(host().sent).toEqual([]);
    });

    it('an empty send is a no-op', () => {
      key({ key: 'Enter' });
      send().click();
      expect(host().sent).toEqual([]);
      expect(loadHistory('rohan/t7')).toEqual([]);
    });

    it('keeps multi-line text as one message', () => {
      type('one\ntwo');
      send().click();
      expect(host().sent).toEqual(['one\ntwo']);
    });

    it('keeps focus on the field when Send is pressed', () => {
      for (const type of ['pointerdown', 'mousedown']) {
        const event = new Event(type, { cancelable: true, bubbles: true });
        send().dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
    });
  });

  describe('disabled', () => {
    beforeEach(create);

    it('disables field and button, keeps the text, and does not send', () => {
      type('keep me');
      host().disabled.set(true);
      fixture.detectChanges();
      expect(field().disabled).toBe(true);
      expect(send().disabled).toBe(true);
      expect(field().value).toBe('keep me');
      key({ key: 'Enter' });
      expect(host().sent).toEqual([]);
      host().disabled.set(false);
      fixture.detectChanges();
      expect(field().value).toBe('keep me');
      expect(send().disabled).toBe(false);
    });
  });

  describe('suggestions', () => {
    beforeEach(() => {
      for (const c of ['git add', 'git push', 'git status', 'git stash', 'ls']) {
        pushHistory('rohan/t7', c);
      }
      create();
    });

    it('shows nothing for empty text', () => {
      expect(chips()).toEqual([]);
    });

    it('shows up to 3 chips starting with the text, most recent first', () => {
      type('git');
      expect(chips().map((c) => c.getAttribute('aria-label'))).toEqual([
        'Use: git stash',
        'Use: git status',
        'Use: git push',
      ]);
    });

    it('narrows while typing and hides on an exact match', () => {
      type('git pu');
      expect(chips().map((c) => c.getAttribute('aria-label'))).toEqual(['Use: git push']);
      type('git push');
      expect(chips()).toEqual([]);
    });

    it('fills the field on tap without sending', () => {
      type('git st');
      chips()[0].click();
      fixture.detectChanges();
      expect(field().value).toBe('git stash');
      expect(host().sent).toEqual([]);
    });

    it('does not steal focus from the field', () => {
      type('git');
      for (const t of ['pointerdown', 'mousedown']) {
        const event = new Event(t, { cancelable: true, bubbles: true });
        chips()[0].dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
    });

    it('uses a new entry right after sending', () => {
      type('make');
      send().click();
      fixture.detectChanges();
      type('ma');
      expect(chips().map((c) => c.getAttribute('aria-label'))).toEqual(['Use: make']);
    });
  });

  describe('arrow keys walk the history', () => {
    beforeEach(() => {
      for (const c of ['first', 'second', 'third']) pushHistory('rohan/t7', c);
      create();
    });

    it('goes back with Up and forward with Down, restoring the draft', () => {
      type('draft');
      let event = key({ key: 'ArrowUp' });
      expect(event.defaultPrevented).toBe(true);
      expect(field().value).toBe('third');
      key({ key: 'ArrowUp' });
      expect(field().value).toBe('second');
      key({ key: 'ArrowUp' });
      key({ key: 'ArrowUp' });
      expect(field().value).toBe('first');
      key({ key: 'ArrowDown' });
      expect(field().value).toBe('second');
      key({ key: 'ArrowDown' });
      key({ key: 'ArrowDown' });
      expect(field().value).toBe('draft');
      event = key({ key: 'ArrowDown' });
      expect(event.defaultPrevented).toBe(false);
      expect(field().value).toBe('draft');
    });

    it('leaves Up/Down to the caret when it is not on the first/last line', () => {
      type('one\ntwo');
      field().setSelectionRange(7, 7);
      expect(key({ key: 'ArrowUp' }).defaultPrevented).toBe(false);
      expect(field().value).toBe('one\ntwo');
      field().setSelectionRange(1, 1);
      expect(key({ key: 'ArrowDown' }).defaultPrevented).toBe(false);
    });

    it('starts over after the user edits a recalled entry', () => {
      key({ key: 'ArrowUp' });
      type('third!');
      key({ key: 'ArrowUp' });
      expect(field().value).toBe('third');
    });
  });

  describe('Ctrl', () => {
    function beforeInput(data: string | null, inputType = 'insertText'): InputEvent {
      const event = new InputEvent('beforeinput', {
        data,
        inputType,
        cancelable: true,
        bubbles: true,
      });
      field().dispatchEvent(event);
      fixture.detectChanges();
      return event;
    }
    beforeEach(create);

    it('types normally when Ctrl is off', () => {
      const event = beforeInput('c');
      expect(event.defaultPrevented).toBe(false);
      expect(host().ctrlChars).toEqual([]);
    });

    it('swallows the next character and reports it when Ctrl is on', () => {
      host().ctrl.set(true);
      fixture.detectChanges();
      const event = beforeInput('c');
      expect(event.defaultPrevented).toBe(true);
      expect(host().ctrlChars).toEqual(['c']);
      expect(field().value).toBe('');
    });

    it('does not swallow deletions or composition without text', () => {
      host().ctrl.set(true);
      fixture.detectChanges();
      expect(beforeInput(null, 'deleteContentBackward').defaultPrevented).toBe(false);
      expect(host().ctrlChars).toEqual([]);
    });
  });

  describe('focus()', () => {
    beforeEach(create);

    it('focuses the field', () => {
      document.body.appendChild(el());
      host().bar().focus();
      expect(document.activeElement).toBe(field());
      el().remove();
    });
  });
});
