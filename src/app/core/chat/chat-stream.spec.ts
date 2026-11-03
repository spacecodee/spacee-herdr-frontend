import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatStream, EVENT_SOURCE_FACTORY } from './chat-stream';
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
});
