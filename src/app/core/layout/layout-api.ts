import { InjectionToken, Service, inject } from '@angular/core';

/** Sends the request; swapped for a fake in tests. */
export type LayoutFetch = (url: string, init?: RequestInit) => Promise<Response>;
export const LAYOUT_FETCH = new InjectionToken<LayoutFetch>('LAYOUT_FETCH', {
  factory: () => (url, init) => fetch(url, init),
});

export type LayoutErrorKind = 'invalid' | 'not-found' | 'conflict' | 'last-item' | 'core';

const MESSAGES: Record<LayoutErrorKind, string> = {
  invalid: 'Invalid input.',
  'not-found': 'It no longer exists.',
  conflict: 'The layout changed meanwhile. Try again.',
  'last-item': 'It is the last one; close the tab or project instead.',
  core: 'Herdr core could not do it.',
};

export class LayoutError extends Error {
  constructor(readonly kind: LayoutErrorKind) {
    super(MESSAGES[kind]);
    this.name = 'LayoutError';
  }
}

/** The ids the bridge answers with after it creates something. */
export interface Created {
  space: string;
  tab: string;
  pane: string;
  terminal: string;
}

/** Program to start; omitted means the shell. */
export type LaunchArgv = ['claude'] | ['pi'] | ['codex'] | ['opencode'] | ['agy'];

export interface NewSpace {
  name: string;
  folder: string;
  machine?: string;
  argv?: LaunchArgv;
}

export interface NewTab {
  space: string;
  name: string;
  folder?: string;
  argv?: LaunchArgv;
}

export interface NewSplit {
  tab: string;
  pane?: string;
  direction: 'right' | 'down';
  argv?: LaunchArgv;
  folder?: string;
}

export type MoveKind = 'space' | 'tab';
export type CloseKind = 'space' | 'tab' | 'pane';

/** The bridge's layout API: projects (spaces), tabs and panes. The list follows the doc event by itself. */
@Service()
export class LayoutApi {
  private readonly send = inject(LAYOUT_FETCH);

  createSpace(body: NewSpace): Promise<Created> {
    return this.json<Created>('POST', '/api/layout/space', body);
  }

  createTab(body: NewTab): Promise<Created> {
    return this.json<Created>('POST', '/api/layout/tab', body);
  }

  split(body: NewSplit): Promise<Created> {
    return this.json<Created>('POST', '/api/layout/split', body);
  }

  async renameSpace(id: string, name: string): Promise<void> {
    await this.request('PATCH', `/api/layout/space/${encodeURIComponent(id)}`, { name });
  }

  async renameTab(id: string, name: string): Promise<void> {
    await this.request('PATCH', `/api/layout/tab/${encodeURIComponent(id)}`, { name });
  }

  /** `index` is the 0-based position the bridge puts it at (the bridge rejects `index >= count`). */
  async move(kind: MoveKind, id: string, index: number): Promise<void> {
    await this.request('POST', '/api/layout/move', { kind, id, index });
  }

  /** Ends the terminals inside. A 409 means it is the last tab or pane of its parent. */
  async close(kind: CloseKind, id: string): Promise<void> {
    await this.request('DELETE', `/api/layout/${kind}/${encodeURIComponent(id)}?confirmed=1`, undefined, true);
  }

  private async json<T>(method: string, url: string, body: unknown): Promise<T> {
    const response = await this.request(method, url, body);
    return (await response.json()) as T;
  }

  private async request(method: string, url: string, body?: unknown, isClose = false): Promise<Response> {
    let response: Response;
    try {
      response = await this.send(url, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new LayoutError('core');
    }
    if (response.ok) return response;
    if (response.status === 400) throw new LayoutError('invalid');
    if (response.status === 404) throw new LayoutError('not-found');
    if (response.status === 409) throw new LayoutError(isClose ? 'last-item' : 'conflict');
    throw new LayoutError('core');
  }
}
