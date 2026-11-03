import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePermission, type PermissionPrompt } from '../../core/answers/permission';
import { CLAUDE_LIVE_SCREEN } from '../../core/answers/testing/claude-live-screen';
import { Permissions, type PermissionState } from '../../core/answers/permissions';
import type { ChatMessage, ChatState, NoneReason, ToolPart } from '../../core/chat/types';
import { ChatView } from './chat-view';

@Component({
  imports: [ChatView],
  template: `<app-chat-view
    [messages]="messages()"
    [state]="state()"
    [noneReason]="reason()"
    [status]="status()"
    [address]="'t13'"
    [agent]="'claude'"
    [typing]="typing()"
    (showTerminal)="shown = shown + 1"
    (denyText)="denied.push($event)"
  />`,
})
class Host {
  messages = signal<ChatMessage[]>([]);
  state = signal<ChatState>('live');
  reason = signal<NoneReason | null>(null);
  status = signal<string | undefined>(undefined);
  typing = signal<number | null>(null);
  shown = 0;
  denied: number[] = [];
}

const msgs: ChatMessage[] = [
  { id: '1', role: 'user', time: 0, parts: [{ type: 'text', text: 'hello there' }] },
  {
    id: '2',
    role: 'assistant',
    time: 0,
    parts: [
      { type: 'thinking', text: 'hmm' },
      { type: 'text', text: '## Title\n\n```ts\nconst a = 1;\n```' },
      { type: 'tool', id: 't', name: 'Bash', summary: 'ls -la', input: 'ls -la', output: 'x', status: 'ok' },
      { type: 'image', path: '/tmp/up/shot.png' },
    ],
  },
  { id: '3', role: 'system', time: 0, parts: [{ type: 'text', text: 'Rate limited' }] },
];

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, el };
}

describe('ChatView', () => {
  it('shows "No conversation yet" when live and empty', () => {
    const { el } = setup();
    expect(el.textContent).toContain('No conversation yet');
  });

  it('shows the not-available state with a button to the terminal', async () => {
    const { fixture, host, el } = setup();
    host.state.set('none');
    host.reason.set('unsupported');
    fixture.detectChanges();
    expect(el.textContent).toContain("This agent's history is not available");
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(host.shown).toBe(1);
  });

  it('renders user, assistant, markdown, tool, thinking, image chip and system notice', async () => {
    const { fixture, host, el } = setup();
    host.messages.set(msgs);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('hello there');
    expect(text).toContain('Thought');
    expect(text).toContain('ls -la');
    expect(text).toContain('shot.png');
    expect(text).toContain('Rate limited');
    expect(el.querySelector('h2')?.textContent).toBe('Title');
    expect(el.querySelector('.md-code code')?.textContent).toContain('const a = 1;');
    expect(el.querySelector('[data-align="end"]')).not.toBeNull();
  });

  it('working shows typing dots, blocked shows the card that opens the terminal', () => {
    const { fixture, host, el } = setup();
    host.status.set('working');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="typing"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="blocked-card"]')).toBeNull();
    host.status.set('blocked');
    fixture.detectChanges();
    const card = el.querySelector<HTMLElement>('[data-testid="blocked-card"]')!;
    expect(card.textContent).toContain('Needs attention');
    expect(card.textContent).toContain('Open terminal');
    card.querySelector('button')!.click();
    expect(host.shown).toBe(1);
    host.status.set('done');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="blocked-card"]')).toBeNull();
    expect(el.querySelector('[data-testid="typing"]')).toBeNull();
  });

  it('blocked card is the last item in the list and quotes what the agent last said', () => {
    const { fixture, host, el } = setup();
    host.messages.set([
      ...msgs,
      { id: '9', role: 'assistant', time: 0, parts: [{ type: 'text', text: 'Run rm -rf build?' }] },
    ]);
    host.status.set('blocked');
    fixture.detectChanges();
    const card = el.querySelector('[data-testid="blocked-card"]')!;
    expect(card.previousElementSibling?.tagName.toLowerCase()).toBe('hlm-message-scroller-item');
    expect(card.nextElementSibling?.tagName.toLowerCase()).not.toBe('hlm-message-scroller-item');
    expect(card.querySelector('[data-blocked-question]')?.textContent?.trim()).toBe('Run rm -rf build?');
  });

  it('blocked card has no question line when the agent said nothing yet', () => {
    const { fixture, host, el } = setup();
    host.status.set('blocked');
    fixture.detectChanges();
    expect(el.querySelector('[data-blocked-question]')).toBeNull();
    expect(el.querySelector('[data-testid="blocked-card"]')).not.toBeNull();
  });

  it('keeps a fixed-height slot where the working line appears', () => {
    const { fixture, host, el } = setup();
    host.status.set('idle');
    fixture.detectChanges();
    const slot = () => el.querySelector('[data-working-slot]')!;
    expect(slot().classList.contains('h-6')).toBe(true);
    expect(slot().textContent?.trim()).toBe('');
    host.status.set('working');
    fixture.detectChanges();
    expect(slot().classList.contains('h-6')).toBe(true);
    expect(el.querySelector('[data-testid="typing"]')?.textContent).toContain('Working…');
  });

  it('quotes the last assistant text without markdown punctuation', () => {
    const { fixture, host, el } = setup();
    host.messages.set([
      { id: '9', role: 'assistant', time: 0, parts: [{ type: 'text', text: '## Allow?\n\nRun **rm** `build`' }] },
    ]);
    host.status.set('blocked');
    fixture.detectChanges();
    expect(el.querySelector('[data-blocked-question]')?.textContent?.trim()).toBe('Allow? Run rm build');
  });

  it('collapses a multi-line markdown quote into one paragraph and clamps it to 3 lines', () => {
    const { fixture, host, el } = setup();
    host.messages.set([
      {
        id: '9',
        role: 'assistant',
        time: 0,
        parts: [{ type: 'text', text: 'Found it.\n\n## Fix\n\n```ts\nopen()\n```\n- a\n- b' }],
      },
    ]);
    host.status.set('blocked');
    fixture.detectChanges();
    const q = el.querySelector<HTMLElement>('[data-blocked-question]')!;
    expect(q.textContent?.trim()).toBe('Found it. Fix a b');
    expect(q.textContent).not.toMatch(/\n/);
    expect(q.classList.contains('line-clamp-3')).toBe(true);
  });

  it('leaves table rows, rules and heading markers out of the quote', () => {
    const { fixture, host, el } = setup();
    host.messages.set([
      {
        id: '9',
        role: 'assistant',
        time: 0,
        parts: [
          {
            type: 'text',
            text: '## Fix\n\nBehaviour per state:\n\n| State | Timer |\n|---|---|\n| open | cleared |\n\n---\n\nAllow this?',
          },
        ],
      },
    ]);
    host.status.set('blocked');
    fixture.detectChanges();
    expect(el.querySelector('[data-blocked-question]')?.textContent?.trim()).toBe(
      'Fix Behaviour per state: Allow this?',
    );
  });

  it('leaves list markers and checkboxes out of the quote', () => {
    const { fixture, host, el } = setup();
    host.messages.set([
      {
        id: '9',
        role: 'assistant',
        time: 0,
        parts: [
          {
            type: 'text',
            text: 'Per state:\n- Keeps backoff\n* Adds a test\n+ Third\n1. First\n2) Second\n- [ ] todo\n- [x] done',
          },
        ],
      },
    ]);
    host.status.set('blocked');
    fixture.detectChanges();
    expect(el.querySelector('[data-blocked-question]')?.textContent?.trim()).toBe(
      'Per state: Keeps backoff Adds a test Third First Second todo done',
    );
  });

  describe('agent questions', () => {
    const tool: ToolPart = {
      type: 'tool',
      id: 'ask-1',
      name: 'AskUserQuestion',
      summary: 'Asked',
      status: 'running',
      questions: [{ question: 'Which color?', header: 'Color', options: [{ label: 'Rojo' }, { label: 'Verde' }] }],
    };
    const withTool = (extra: Partial<ToolPart> = {}): ChatMessage => ({ id: 'q', role: 'assistant', time: 0, parts: [{ ...tool, ...extra }] });
    const asking = withTool();

    it('shows a pending question as a card in the conversation, in place of the generic blocked card', () => {
      const { fixture, host, el } = setup();
      host.messages.set([...msgs, asking]);
      host.status.set('blocked');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="question-card"]')?.textContent).toContain('Which color?');
      expect(el.querySelector('[data-testid="blocked-card"]')).toBeNull();
    });

    it('keeps the blocked card once the question was answered', () => {
      const { fixture, host, el } = setup();
      const answered = withTool({ status: 'ok', answers: { 'Which color?': 'Rojo' } });
      host.messages.set([...msgs, answered]);
      host.status.set('blocked');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="question-card"]')).toBeNull();
      expect(el.textContent).toContain('You answered — Color: Rojo');
      expect(el.querySelector('[data-testid="blocked-card"]')).not.toBeNull();
    });

    it('opens the terminal from the fallback card (an agent the app cannot drive)', () => {
      const { fixture, host, el } = setup();
      host.messages.set([withTool({ truncated: true })]);
      fixture.detectChanges();
      const open = [...el.querySelectorAll('[data-testid="question-fallback"] button')].find((b) => /Open terminal/.test(b.textContent ?? ''));
      (open as HTMLButtonElement).click();
      expect(host.shown).toBe(1);
    });
  });

  describe('permission prompts', () => {
    const prompt: PermissionPrompt = {
      agent: 'claude',
      title: 'Do you want to proceed?',
      request: ['pnpm test'],
      choices: [
        { label: 'Yes', kind: 'approve' },
        { label: 'No, and tell Claude what to do differently', kind: 'deny-text' },
      ],
      cursor: 0,
    };
    const prompts = signal<Record<string, PermissionPrompt>>({});
    const states = signal<Record<string, PermissionState>>({});
    const probe = vi.fn(async (..._args: unknown[]) => undefined);
    const answer = vi.fn(async (..._args: unknown[]) => undefined);
    const settle = vi.fn();

    beforeEach(() => {
      prompts.set({});
      states.set({});
      probe.mockClear();
      answer.mockClear();
      settle.mockClear();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: Permissions,
            useValue: { promptOf: (a: string) => prompts()[a] ?? null, stateOf: (a: string) => states()[a], probe, answer, settle },
          },
        ],
      });
    });

    it('reads the prompt when the agent becomes blocked', () => {
      const { fixture, host } = setup();
      host.status.set('blocked');
      fixture.detectChanges();
      TestBed.tick();
      expect(probe).toHaveBeenCalledWith('t13', 'claude');
    });

    it('does not read the screen for a question card, or while the agent is not blocked', () => {
      const { fixture, host } = setup();
      host.status.set('working');
      fixture.detectChanges();
      TestBed.tick();
      expect(probe).not.toHaveBeenCalled();
      expect(settle).toHaveBeenCalledWith('t13');
    });

    it('shows the choices in place of the generic card; Open terminal is gone', () => {
      const { fixture, host, el } = setup();
      prompts.set({ t13: prompt });
      host.status.set('blocked');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="permission-card"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="blocked-card"]')).toBeNull();
    });

    it('shows the same real captured prompt as Home: three buttons, no panel junk', () => {
      const { fixture, host, el } = setup();
      prompts.set({ t13: parsePermission(CLAUDE_LIVE_SCREEN, 'claude')! });
      host.status.set('blocked');
      fixture.detectChanges();
      const labels = [...el.querySelectorAll('[data-choice]')].map((b) => b.textContent?.trim());
      expect(labels).toEqual(['Yes', 'Yes, and always allow access to /tmp/x from this project', 'No']);
      expect(el.querySelector('[data-testid="permission-card"]')?.textContent).not.toMatch(/FLIGHTDECK|session log|│/);
    });

    it('keeps the generic card when no prompt could be read', () => {
      const { fixture, host, el } = setup();
      host.status.set('blocked');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="permission-card"]')).toBeNull();
      expect(el.querySelector('[data-testid="blocked-card"]')).not.toBeNull();
    });

    it('answers through the service; "No, and tell …" asks the parent to type instead', () => {
      const { fixture, host, el } = setup();
      prompts.set({ t13: prompt });
      host.status.set('blocked');
      fixture.detectChanges();
      const buttons = el.querySelectorAll<HTMLButtonElement>('[data-choice]');
      buttons[0].click();
      expect(answer).toHaveBeenCalledWith('t13', 'claude', 0);
      buttons[1].click();
      expect(host.denied).toEqual([1]);
      expect(answer).toHaveBeenCalledTimes(1);
    });

    it('collapses to "You answered" and stays once the agent works again', () => {
      const { fixture, host, el } = setup();
      prompts.set({ t13: prompt });
      states.set({ t13: { phase: 'answered', label: 'Yes' } });
      host.status.set('working');
      fixture.detectChanges();
      expect(el.querySelector('[data-answered]')?.textContent).toContain('You answered: Yes');
    });
  });
});
