import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LONG_PRESS_MS } from '../../../core/list/row-gesture';
import { PROMPTS_KEY, Prompts, type SavedPrompt } from '../../../core/prompts/prompts';
import { PromptsSheet } from './prompts-sheet';

function fakeStorage(initial?: unknown): Storage {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(PROMPTS_KEY, JSON.stringify(initial));
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

const SAVED = {
  version: 1,
  prompts: [
    { id: 'p1', title: 'Review the diff', text: 'Read the staged changes and list risks.\nKeep it short.', sendNow: false },
    { id: 'p2', title: 'Write tests first', text: 'Add a failing test for this behavior.', sendNow: true },
    { id: 'p3', title: 'Explain this error', text: 'Explain the last error in plain words.', sendNow: false },
  ],
  commands: [
    { id: 'c1', title: '/clear', text: '/clear', sendNow: false },
    { id: 'c2', title: '/compact', text: '/compact', sendNow: true },
  ],
};

describe('PromptsSheet', () => {
  let fixture: ComponentFixture<PromptsSheet>;
  let picked: SavedPrompt[];
  let store: Storage;

  const q = <T extends Element>(sel: string) => document.body.querySelector<T>(sel);
  const all = <T extends Element>(sel: string) => Array.from(document.body.querySelectorAll<T>(sel));
  const text = (sel: string) => q(sel)?.textContent?.replace(/\s+/g, ' ').trim();
  const rows = () => all<HTMLElement>('[data-prompt-row]');

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function open(mode: 'insert' | 'manage' = 'insert', initial: unknown = SAVED) {
    store = fakeStorage(initial);
    vi.stubGlobal('localStorage', store);
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(PromptsSheet);
    picked = [];
    fixture.componentInstance.picked.subscribe((p) => picked.push(p));
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('open', true);
    await settle();
  }

  async function click(el: Element | null) {
    (el as HTMLElement).click();
    await settle();
  }

  async function type(sel: string, value: string) {
    const el = q<HTMLInputElement | HTMLTextAreaElement>(sel)!;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  function press(el: Element) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerType: 'touch' }));
  }
  function release(el: Element) {
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10, pointerType: 'touch' }));
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fixture?.destroy();
  });

  describe('list (C1b)', () => {
    beforeEach(() => open());

    it('shows the title, search, command chips, prompts, help line and New prompt', () => {
      expect(text('[data-prompts-title]')).toBe('Saved prompts');
      expect(q<HTMLInputElement>('input[type="search"]')?.getAttribute('aria-label')).toBe('Search prompts');
      expect(all('[data-chip]').map((c) => c.textContent?.trim())).toEqual(['/clear', '/compact']);
      expect(rows().map((r) => r.querySelector('[data-row-title]')?.textContent?.trim())).toEqual([
        'Review the diff',
        'Write tests first',
        'Explain this error',
      ]);
      expect(text('[data-prompts-help]')).toBe('Tap to insert · Long-press to edit or delete');
      expect(text('[data-new]')).toBe('New prompt');
    });

    it('shows only the first line of the text, muted, under the title', () => {
      expect(rows()[0].querySelector('[data-row-preview]')?.textContent?.trim()).toBe('Read the staged changes and list risks.');
    });

    it('search filters prompts by title or text, ignoring case', async () => {
      await type('input[type="search"]', 'TESTS');
      expect(rows()).toHaveLength(1);
      await type('input[type="search"]', 'plain words');
      expect(rows().map((r) => r.querySelector('[data-row-title]')?.textContent?.trim())).toEqual(['Explain this error']);
      await type('input[type="search"]', 'zzz');
      expect(rows()).toHaveLength(0);
      expect(q('[data-prompts-empty]')).not.toBeNull();
    });

    it('tapping a prompt hands it over and closes the sheet', async () => {
      await click(rows()[1]);
      expect(picked.map((p) => p.id)).toEqual(['p2']);
      expect(fixture.componentInstance.open()).toBe(false);
    });

    it('tapping a command chip hands it over the same way', async () => {
      await click(all('[data-chip]')[0]);
      expect(picked.map((p) => p.text)).toEqual(['/clear']);
      expect(fixture.componentInstance.open()).toBe(false);
    });
  });

  describe('empty', () => {
    it('says so when there are no prompts and still offers New prompt', async () => {
      await open('insert', { version: 1, prompts: [], commands: [] });
      expect(q('[data-prompts-empty]')).not.toBeNull();
      expect(q('[data-new]')).not.toBeNull();
      expect(all('[data-chip]')).toHaveLength(0);
    });
  });

  describe('long press and the … button', () => {
    beforeEach(() => open());

    it('a long press on a prompt opens Edit / Delete and the release click does not insert it', async () => {
      vi.useFakeTimers();
      press(rows()[0]);
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      release(rows()[0]);
      vi.useRealTimers();
      await click(rows()[0]);
      expect(picked).toEqual([]);
      expect(text('[data-actions-title]')).toBe('Review the diff');
      expect(q('[data-action-edit]')).not.toBeNull();
      expect(q('[data-action-delete]')).not.toBeNull();
    });

    it('a quick tap still inserts, and a press that moves away does not open the menu', async () => {
      vi.useFakeTimers();
      press(rows()[0]);
      rows()[0].dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 60 }));
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      release(rows()[0]);
      vi.useRealTimers();
      expect(q('[data-action-edit]')).toBeNull();
      await click(rows()[0]);
      expect(picked.map((p) => p.id)).toEqual(['p1']);
    });

    it('a long press on a command chip opens its menu', async () => {
      vi.useFakeTimers();
      press(all('[data-chip]')[1]);
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      release(all('[data-chip]')[1]);
      vi.useRealTimers();
      await click(all('[data-chip]')[1]);
      expect(picked).toEqual([]);
      expect(text('[data-actions-title]')).toBe('/compact');
    });

    it('every prompt has a visible … button that opens the same menu', async () => {
      const more = all<HTMLButtonElement>('[data-row-more]');
      expect(more).toHaveLength(3);
      expect(more[2].getAttribute('aria-label')).toBe('Actions for Explain this error');
      await click(more[2]);
      expect(picked).toEqual([]);
      expect(text('[data-actions-title]')).toBe('Explain this error');
    });

    it('every chip has a … button for keyboard and screen reader users', async () => {
      const more = all<HTMLButtonElement>('[data-chip-more]');
      expect(more.map((b) => b.getAttribute('aria-label'))).toEqual(['Actions for /clear', 'Actions for /compact']);
      await click(more[0]);
      expect(text('[data-actions-title]')).toBe('/clear');
    });

    it('the context-menu key opens the menu too', async () => {
      rows()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await settle();
      expect(text('[data-actions-title]')).toBe('Review the diff');
    });

    it('Edit opens the form with the entry filled in; Save updates it in place', async () => {
      await click(all('[data-row-more]')[1]);
      await click(q('[data-action-edit]'));
      expect(text('[data-form-title]')).toBe('Edit prompt');
      expect(q<HTMLInputElement>('[data-title]')!.value).toBe('Write tests first');
      expect(q<HTMLTextAreaElement>('[data-text]')!.value).toBe('Add a failing test for this behavior.');
      await type('[data-title]', 'Tests first');
      await click(q('[data-save]'));
      const saved = TestBed.inject(Prompts).prompts();
      expect(saved.map((p) => p.title)).toEqual(['Review the diff', 'Tests first', 'Explain this error']);
      expect(saved[1].sendNow).toBe(true);
      expect(text('[data-prompts-title]')).toBe('Saved prompts');
    });

    it('Delete asks first, Cancel keeps it, Delete removes it', async () => {
      await click(all('[data-row-more]')[0]);
      await click(q('[data-action-delete]'));
      expect(text('[data-confirm-title]')).toContain('Review the diff');
      await click(q('[data-confirm-cancel]'));
      expect(TestBed.inject(Prompts).prompts()).toHaveLength(3);
      await click(all('[data-row-more]')[0]);
      await click(q('[data-action-delete]'));
      await click(q('[data-confirm-delete]'));
      expect(TestBed.inject(Prompts).prompts().map((p) => p.id)).toEqual(['p2', 'p3']);
      expect(text('[data-prompts-title]')).toBe('Saved prompts');
    });

    it('a chip is edited and deleted the same way', async () => {
      await click(all('[data-chip-more]')[0]);
      await click(q('[data-action-edit]'));
      expect(text('[data-form-title]')).toBe('Edit command');
      await type('[data-text]', '/clear now');
      await click(q('[data-save]'));
      expect(TestBed.inject(Prompts).commands()[0].text).toBe('/clear now');
      await click(all('[data-chip-more]')[1]);
      await click(q('[data-action-delete]'));
      await click(q('[data-confirm-delete]'));
      expect(TestBed.inject(Prompts).commands().map((c) => c.id)).toEqual(['c1']);
    });
  });

  describe('new prompt form (C2)', () => {
    beforeEach(async () => {
      await open();
      await click(q('[data-new]'));
    });

    it('shows Title, Prompt, the Send right away switch and Save', () => {
      expect(text('[data-form-title]')).toBe('New prompt');
      expect(q('label[for="prompt-title"]')?.textContent?.trim()).toBe('Title');
      expect(q('label[for="prompt-text"]')?.textContent?.trim()).toBe('Prompt');
      expect(text('[data-send-label]')).toBe('Send right away');
      expect(text('[data-send-help]')).toBe('Sends as soon as you tap it.');
      expect(q('hlm-switch')).not.toBeNull();
      expect(text('[data-save]')).toBe('Save');
    });

    it('Save is disabled until the title and the text both have content', async () => {
      const save = () => q<HTMLButtonElement>('[data-save]')!;
      expect(save().disabled).toBe(true);
      await type('[data-title]', 'Hello');
      expect(save().disabled).toBe(true);
      await type('[data-text]', '   ');
      expect(save().disabled).toBe(true);
      await type('[data-text]', 'Say hi');
      expect(save().disabled).toBe(false);
      await type('[data-title]', '  ');
      expect(save().disabled).toBe(true);
    });

    it('limits the title to 60 and the text to 4000 characters', async () => {
      expect(q<HTMLInputElement>('[data-title]')!.maxLength).toBe(60);
      expect(q<HTMLTextAreaElement>('[data-text]')!.maxLength).toBe(4000);
      await type('[data-title]', 'x'.repeat(61));
      await type('[data-text]', 'y');
      expect(q<HTMLButtonElement>('[data-save]')!.disabled).toBe(true);
      await type('[data-title]', 'x'.repeat(60));
      await type('[data-text]', 'y'.repeat(4001));
      expect(q<HTMLButtonElement>('[data-save]')!.disabled).toBe(true);
      await type('[data-text]', 'y'.repeat(4000));
      expect(q<HTMLButtonElement>('[data-save]')!.disabled).toBe(false);
    });

    it('Save adds the prompt at the end, honouring the switch, and returns to the list', async () => {
      await type('[data-title]', 'Ship it');
      await type('[data-text]', 'Run the tests, then commit.');
      await click(q('hlm-switch button'));
      await click(q('[data-save]'));
      const prompts = TestBed.inject(Prompts).prompts();
      expect(prompts.at(-1)).toMatchObject({ title: 'Ship it', text: 'Run the tests, then commit.', sendNow: true });
      expect(prompts).toHaveLength(4);
      expect(text('[data-prompts-title]')).toBe('Saved prompts');
      expect(rows()).toHaveLength(4);
    });

    it('opens empty each time', async () => {
      await type('[data-title]', 'abandoned');
      fixture.componentRef.setInput('open', false);
      await settle();
      fixture.componentRef.setInput('open', true);
      await settle();
      expect(text('[data-prompts-title]')).toBe('Saved prompts');
      await click(q('[data-new]'));
      expect(q<HTMLInputElement>('[data-title]')!.value).toBe('');
    });
  });

  describe('manage mode (Settings)', () => {
    it('a tap opens the entry menu instead of inserting, and the help line says so', async () => {
      await open('manage');
      expect(text('[data-prompts-help]')).toBe('Tap to edit or delete');
      await click(rows()[0]);
      expect(picked).toEqual([]);
      expect(text('[data-actions-title]')).toBe('Review the diff');
      expect(fixture.componentInstance.open()).toBe(true);
    });
  });
});
