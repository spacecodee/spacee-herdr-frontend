import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatStream, EVENT_SOURCE_FACTORY } from './chat-stream';
import { rewindPoint } from './rewind-target';
import type { ChatMessage } from './types';

class FakeEventSource {
  static all: FakeEventSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private handlers = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener(name: string, fn: (e: MessageEvent) => void): void {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]);
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
  emit(name: string, data: unknown): void {
    for (const fn of this.handlers.get(name) ?? [])
      fn({ data: JSON.stringify(data) } as MessageEvent);
  }
}

const msg = (id: string): ChatMessage => ({
  id,
  role: 'user',
  time: 0,
  parts: [{ type: 'text', text: id }],
});

describe('ChatStream', () => {
  let stream: ChatStream;
  beforeEach(() => {
    FakeEventSource.all = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: (url: string) => new FakeEventSource(url) as unknown as EventSource,
        },
      ],
    });
    stream = TestBed.inject(ChatStream);
  });
  const es = () => FakeEventSource.all.at(-1)!;

  it('opens the encoded endpoint and starts connecting', () => {
    stream.connect('rohan/t7');
    expect(es().url).toBe('/api/chat?terminal=rohan%2Ft7');
    expect(stream.state()).toBe('connecting');
  });

  it('applies reset, append and update', () => {
    stream.connect('a');
    es().emit('reset', { agent: 'claude', session: 's', messages: [msg('1')] });
    expect(stream.state()).toBe('live');
    expect(stream.agent()).toBe('claude');
    es().emit('append', { messages: [msg('2')] });
    es().emit('update', { messages: [{ ...msg('2'), role: 'assistant' }] });
    expect(stream.messages().map((m) => [m.id, m.role])).toEqual([
      ['1', 'user'],
      ['2', 'assistant'],
    ]);
  });

  it('shows queued messages last and drops them on remove', () => {
    stream.connect('a');
    es().emit('reset', { agent: 'claude', session: 's', messages: [msg('1')] });
    es().emit('append', { messages: [{ ...msg('q'), queued: true }] });
    es().emit('append', { messages: [{ ...msg('2'), role: 'assistant' }] });
    expect(stream.messages().map((m) => m.id)).toEqual(['1', '2', 'q']);
    es().emit('remove', { ids: ['q'] });
    expect(stream.messages().map((m) => m.id)).toEqual(['1', '2']);
  });

  it('an empty reset is live with no messages and no reason', () => {
    stream.connect('a');
    es().emit('reset', { agent: 'claude', session: 's', messages: [] });
    expect(stream.state()).toBe('live');
    expect(stream.messages()).toEqual([]);
    expect(stream.noneReason()).toBeNull();
    expect(stream.agent()).toBe('claude');
  });

  it('none sets the reason and clears messages', () => {
    stream.connect('a');
    es().emit('none', { reason: 'unsupported' });
    expect(stream.state()).toBe('none');
    expect(stream.noneReason()).toBe('unsupported');
  });

  it('ignores malformed payloads', () => {
    stream.connect('a');
    es().emit('reset', { agent: 'x', session: 's', messages: [msg('1')] });
    es().emit('append', 'nope');
    es().emit('append', {});
    expect(stream.messages()).toHaveLength(1);
  });

  it('error then data goes back to live; close ends the source', () => {
    stream.connect('a');
    const first = es();
    first.onerror?.();
    expect(stream.state()).toBe('error');
    first.onopen?.();
    expect(stream.state()).toBe('connecting');
    first.emit('append', { messages: [msg('9')] });
    expect(stream.state()).toBe('live');
    stream.close();
    expect(first.closed).toBe(true);
  });

  it('reconnecting to another terminal drops the old stream and its events', () => {
    stream.connect('a');
    const old = es();
    stream.connect('b');
    expect(old.closed).toBe(true);
    old.emit('reset', { agent: 'x', session: 's', messages: [msg('old')] });
    expect(stream.messages()).toHaveLength(0);
  });

  it('reopens a closed stream when the tab becomes visible', () => {
    stream.connect('a');
    const first = es();
    first.readyState = 2;
    first.onerror?.();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(FakeEventSource.all).toHaveLength(2);
    stream.close();
  });

  describe('after a rewind', () => {
    const asst = (id: string): ChatMessage => ({ ...msg(id), role: 'assistant' });
    const rewind = (id: string) => {
      const point = rewindPoint(stream.messages(), id, stream.rewoundId())!;
      stream.rewind(stream.messages().find((m) => m.id === id)!, point.removed);
    };
    const start = () => {
      stream.connect('a');
      es().emit('reset', { agent: 'claude', session: 's', messages: [msg('u1'), asst('a1'), msg('u2'), asst('a2'), msg('u3'), asst('a3')] });
    };

    it('hides everything after the rewound message, keeps it, and says how many went', () => {
      start();
      rewind('u2');
      expect(stream.messages().map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'rewound-divider']);
      expect(stream.messages().at(-1)?.parts).toEqual([{ type: 'text', text: 'Rewound · 3 messages removed' }]);
      expect(stream.rewoundId()).toBe('u2');
    });

    it('says "1 message" for one', () => {
      start();
      rewind('u3');
      expect(stream.messages().at(-1)?.parts).toEqual([{ type: 'text', text: 'Rewound · 1 message removed' }]);
    });

    it('stays hidden when the stream repeats itself (a reconnect) or updates old turns', () => {
      start();
      rewind('u2');
      es().emit('update', { messages: [asst('a2')] });
      es().emit('reset', { agent: 'claude', session: 's', messages: [msg('u1'), asst('a1'), msg('u2'), asst('a2'), msg('u3'), asst('a3')] });
      expect(stream.messages().map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'rewound-divider']);
    });

    it('shows the stream again once a new user message arrives', () => {
      start();
      rewind('u2');
      es().emit('append', { messages: [msg('u4')] });
      expect(stream.messages().map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3', 'a3', 'u4']);
      expect(stream.rewoundId()).toBeNull();
    });

    it('also lets go on a reset that carries a new user message', () => {
      start();
      rewind('u2');
      es().emit('reset', { agent: 'claude', session: 's', messages: [msg('u1'), asst('a1'), msg('u9')] });
      expect(stream.messages().map((m) => m.id)).toEqual(['u1', 'a1', 'u9']);
    });

    it('keeps the rewound message when the stream already dropped it (opencode)', () => {
      start();
      rewind('u3');
      es().emit('reset', { agent: 'opencode', session: 's', messages: [msg('u1'), asst('a1'), msg('u2'), asst('a2')] });
      expect(stream.messages().map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3', 'rewound-divider']);
    });

    it('a second rewind counts what the first one hid', () => {
      start();
      rewind('u3');
      rewind('u1');
      expect(stream.messages().map((m) => m.id)).toEqual(['u1', 'rewound-divider']);
      expect(stream.messages().at(-1)?.parts).toEqual([{ type: 'text', text: 'Rewound · 5 messages removed' }]);
    });

    it('counts what was removed from the snapshot taken before, not from what the bridge still lists (opencode)', () => {
      start();
      const message = stream.messages().find((m) => m.id === 'u2')!;
      const removed = rewindPoint(stream.messages(), 'u2')!.removed;
      es().emit('reset', { agent: 'opencode', session: 's', messages: [msg('u1'), asst('a1')] });
      stream.rewind(message, removed);
      expect(stream.messages().map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'rewound-divider']);
      expect(stream.messages().at(-1)?.parts).toEqual([{ type: 'text', text: 'Rewound · 3 messages removed' }]);
    });

    it('unqueue turns delivered queued messages into ordinary ones', () => {
      start();
      es().emit('append', { messages: [{ ...msg('q'), queued: true }] });
      stream.unqueue(['q']);
      expect(stream.messages().find((m) => m.id === 'q')?.queued).toBe(false);
    });

    it('is dropped by connect()', () => {
      start();
      rewind('u2');
      stream.connect('b');
      expect(stream.rewoundId()).toBeNull();
    });
  });
});
