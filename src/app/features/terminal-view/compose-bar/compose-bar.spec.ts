import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { loadHistory, pushHistory } from '../../../core/input/history';
import { Uploads, UploadError } from '../../../core/input/uploads';
import { Settings } from '../../../core/settings/settings';
import { ComposeBar } from './compose-bar';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('@spartan-ng/brain/sonner', () => ({ toast: { error: toastError } }));

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

  const upload = vi.fn();
  function create(): void {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    TestBed.configureTestingModule({ providers: [{ provide: Uploads, useValue: { upload } }] });
    toastError.mockClear();
    upload.mockReset();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const gif = (name = 'a.gif') => new File([new Uint8Array(4)], name, { type: 'image/gif' });
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  };
  function paste(files: File[]): Event {
    const event = new Event('paste', { cancelable: true, bubbles: true });
    Object.defineProperty(event, 'clipboardData', { value: { files } });
    field().dispatchEvent(event);
    return event;
  }

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

  describe('drafts', () => {
    it('restores the saved draft with the caret at the end', async () => {
      localStorage.setItem('spacee-herdr.draft.rohan/t7', 'half typed');
      create();
      await fixture.whenStable();
      expect(field().value).toBe('half typed');
      expect(field().selectionStart).toBe('half typed'.length);
    });

    it('saves debounced and flushes on visibility hidden and pagehide', () => {
      vi.useFakeTimers();
      try {
        create();
        type('abc');
        expect(localStorage.getItem('spacee-herdr.draft.rohan/t7')).toBeNull();
        vi.advanceTimersByTime(300);
        expect(localStorage.getItem('spacee-herdr.draft.rohan/t7')).toBe('abc');
        type('abcd');
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
        expect(localStorage.getItem('spacee-herdr.draft.rohan/t7')).toBe('abcd');
        type('abcde');
        window.dispatchEvent(new Event('pagehide'));
        expect(localStorage.getItem('spacee-herdr.draft.rohan/t7')).toBe('abcde');
      } finally {
        vi.useRealTimers();
      }
    });

    it('saves on destroy and clears on send', () => {
      create();
      type('keep');
      fixture.destroy();
      expect(localStorage.getItem('spacee-herdr.draft.rohan/t7')).toBe('keep');
      create();
      type('sent');
      send().click();
      expect(localStorage.getItem('spacee-herdr.draft.rohan/t7')).toBeNull();
    });
  });

  describe('new line', () => {
    const newLine = () =>
      el().querySelector<HTMLButtonElement>('button[aria-label="New line"]')!;
    function lineBreak(inputType: string): InputEvent {
      const event = new InputEvent('beforeinput', { inputType, cancelable: true, bubbles: true });
      field().dispatchEvent(event);
      fixture.detectChanges();
      return event;
    }
    beforeEach(create);

    it('has a 44px New line button next to Send', () => {
      expect(newLine().classList.contains('newline')).toBe(true);
      expect(newLine().nextElementSibling).toBe(send());
    });

    it('inserts a line break at the caret without sending or closing the keyboard', () => {
      type('ab');
      field().focus();
      field().setSelectionRange(1, 1);
      const down = new Event('pointerdown', { cancelable: true, bubbles: true });
      newLine().dispatchEvent(down);
      newLine().click();
      fixture.detectChanges();
      expect(down.defaultPrevented).toBe(true);
      expect(field().value).toBe('a\nb');
      expect(field().selectionStart).toBe(2);
      expect(host().sent).toEqual([]);
      expect(document.activeElement).toBe(field());
    });

    it('works in newline mode too, and the lines go out as one message', () => {
      TestBed.inject(Settings).setReturnKey('newline');
      fixture.detectChanges();
      type('one');
      newLine().click();
      type(field().value + 'two');
      send().click();
      expect(host().sent).toEqual(['one\ntwo']);
    });

    it('replaces a selection and is disabled with the bar', () => {
      type('abc');
      field().setSelectionRange(0, 3);
      newLine().click();
      expect(field().value).toBe('\n');
      host().disabled.set(true);
      fixture.detectChanges();
      expect(newLine().disabled).toBe(true);
    });

    it('leaves the text alone when the input event fires (caret stays)', () => {
      field().value = 'abcd';
      field().setSelectionRange(2, 2);
      field().dispatchEvent(new Event('input'));
      expect(field().selectionStart).toBe(2);
    });

    describe('send mode, iOS soft keyboard event shapes', () => {
      it('sends on beforeinput insertParagraph when keydown was a composing 229', () => {
        type('hi');
        const down = key({ key: 'Enter', keyCode: 229, isComposing: true });
        expect(down.defaultPrevented).toBe(false);
        const event = lineBreak('insertParagraph');
        expect(event.defaultPrevented).toBe(true);
        expect(host().sent).toEqual(['hi']);
      });

      it('sends on a bare insertLineBreak with no keydown at all', () => {
        type('hi');
        expect(lineBreak('insertLineBreak').defaultPrevented).toBe(true);
        expect(host().sent).toEqual(['hi']);
      });

      it('does not send twice when keydown already sent', () => {
        type('hi');
        key({ key: 'Enter' });
        expect(host().sent).toEqual(['hi']);
        type('yo');
        // keydown was cancelled, so the browser fires no beforeinput; a stray one must not resend the old text
        expect(host().sent).toEqual(['hi']);
      });

      it('Shift+Return stays a line break', () => {
        type('a');
        key({ key: 'Enter', shiftKey: true });
        const event = lineBreak('insertLineBreak');
        expect(event.defaultPrevented).toBe(false);
        expect(host().sent).toEqual([]);
      });

      it('does not send an empty field', () => {
        lineBreak('insertParagraph');
        expect(host().sent).toEqual([]);
      });
    });

    describe('newline mode, iOS soft keyboard event shapes', () => {
      beforeEach(() => {
        TestBed.inject(Settings).setReturnKey('newline');
        fixture.detectChanges();
      });

      it('lets a composing 229 keydown and the line-break beforeinput through', () => {
        type('hi');
        expect(key({ key: 'Enter', keyCode: 229, isComposing: true }).defaultPrevented).toBe(false);
        expect(lineBreak('insertParagraph').defaultPrevented).toBe(false);
        expect(lineBreak('insertLineBreak').defaultPrevented).toBe(false);
        expect(host().sent).toEqual([]);
      });

      it('lets Return through even while the one-shot Ctrl is on', () => {
        host().ctrl.set(true);
        fixture.detectChanges();
        type('hi');
        expect(lineBreak('insertParagraph').defaultPrevented).toBe(false);
        expect(host().ctrlChars).toEqual([]);
      });

      it('still sends on Ctrl+Return', () => {
        type('hi');
        key({ key: 'Enter', ctrlKey: true });
        expect(host().sent).toEqual(['hi']);
      });
    });
  });

  describe('return key newline', () => {
    beforeEach(() => {
      create();
      TestBed.inject(Settings).setReturnKey('newline');
      fixture.detectChanges();
    });

    it('uses the enter hint and lets Return insert a newline', () => {
      expect(field().getAttribute('enterkeyhint')).toBe('enter');
      type('a');
      const event = key({ key: 'Enter' });
      expect(event.defaultPrevented).toBe(false);
      expect(host().sent).toEqual([]);
    });

    it('sends on Ctrl+Enter and Cmd+Enter, and with the button', () => {
      type('a');
      key({ key: 'Enter', ctrlKey: true });
      type('b');
      key({ key: 'Enter', metaKey: true });
      type('c');
      send().click();
      expect(host().sent).toEqual(['a', 'b', 'c']);
    });
  });

  describe('images', () => {
    const attach = () => el().querySelector<HTMLButtonElement>('button[aria-label="Attach image"]')!;
    const picker = () => el().querySelector<HTMLInputElement>('input[type="file"]')!;
    const thumbs = () => el().querySelectorAll('button[aria-label="Remove attached image"]');
    beforeEach(create);

    it('has an Attach image button opening an image picker', () => {
      expect(picker().accept).toBe('image/*');
      expect(picker().multiple).toBe(true);
      const click = vi.spyOn(picker(), 'click');
      attach().click();
      expect(click).toHaveBeenCalled();
    });

    it('uploads a paste, inserts the path at the caret and shows a chip', async () => {
      upload.mockResolvedValue('/home/me/up/a.gif');
      type('see  now');
      field().setSelectionRange(4, 4);
      const event = paste([gif()]);
      expect(event.defaultPrevented).toBe(true);
      await flush();
      expect(field().value).toBe('see /home/me/up/a.gif now');
      expect(thumbs().length).toBe(1);
    });

    it('ignores a paste without images', () => {
      expect(paste([]).defaultPrevented).toBe(false);
      expect(upload).not.toHaveBeenCalled();
    });

    it('shows progress and disables Send while uploading', async () => {
      let done!: (p: string) => void;
      upload.mockReturnValue(new Promise<string>((r) => (done = r)));
      type('hi');
      paste([gif()]);
      await flush();
      expect(el().querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe(
        'Uploading 1 image…',
      );
      expect(send().disabled).toBe(true);
      done('/p/a.gif');
      await flush();
      expect(send().disabled).toBe(false);
    });

    it('inserts several paths separated by spaces', async () => {
      upload.mockResolvedValueOnce('/p/a.gif').mockResolvedValueOnce('/p/b.gif');
      paste([gif('a.gif'), gif('b.gif')]);
      await flush();
      expect(field().value).toBe('/p/a.gif /p/b.gif ');
    });

    it('removing the chip removes its path from the text', async () => {
      upload.mockResolvedValue('/p/a.gif');
      type('look');
      field().setSelectionRange(4, 4);
      paste([gif()]);
      await flush();
      expect(field().value).toBe('look /p/a.gif ');
      (thumbs()[0] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(field().value).toBe('look ');
      expect(thumbs().length).toBe(0);
    });

    it('toasts a short reason on failure and inserts nothing', async () => {
      upload.mockRejectedValue(new UploadError('too-big'));
      paste([gif()]);
      await flush();
      expect(toastError).toHaveBeenCalledWith('Image is too big (15 MB max).');
      expect(field().value).toBe('');
      expect(send().disabled).toBe(true);
    });

    it('keeps the paths in the draft', async () => {
      upload.mockResolvedValue('/p/a.gif');
      paste([gif()]);
      await flush();
      fixture.destroy();
      expect(localStorage.getItem('spacee-herdr.draft.rohan/t7')).toBe('/p/a.gif ');
    });
  });
});
