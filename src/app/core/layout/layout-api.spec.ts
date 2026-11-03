import { TestBed } from '@angular/core/testing';
import { LAYOUT_FETCH, LayoutApi, LayoutError } from './layout-api';

const created = { space: 's1', tab: 'tb1', pane: 'p1', terminal: 't1' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const empty = (status = 204) => new Response(null, { status });

describe('LayoutApi', () => {
  let fetchFake: ReturnType<typeof vi.fn>;

  function setup() {
    TestBed.configureTestingModule({ providers: [{ provide: LAYOUT_FETCH, useValue: fetchFake }] });
    return TestBed.inject(LayoutApi);
  }

  const lastCall = () => {
    const [url, init] = fetchFake.mock.calls.at(-1) as [string, RequestInit];
    return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined, init };
  };

  beforeEach(() => {
    fetchFake = vi.fn();
  });

  it('creates a project with a JSON body', async () => {
    fetchFake.mockResolvedValue(json(created));
    const api = setup();
    const result = await api.createSpace({ name: 'W', folder: '/tmp', argv: ['claude'] });
    expect(result).toEqual(created);
    expect(lastCall()).toMatchObject({
      url: '/api/layout/space',
      method: 'POST',
      body: { name: 'W', folder: '/tmp', argv: ['claude'] },
    });
    expect(lastCall().init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('creates a tab and a split', async () => {
    fetchFake.mockImplementation(() => Promise.resolve(json(created)));
    const api = setup();
    await api.createTab({ space: 's1', name: 'T' });
    expect(lastCall()).toMatchObject({ url: '/api/layout/tab', method: 'POST', body: { space: 's1', name: 'T' } });
    await api.split({ tab: 'tb1', pane: 'p1', direction: 'down' });
    expect(lastCall()).toMatchObject({
      url: '/api/layout/split',
      method: 'POST',
      body: { tab: 'tb1', pane: 'p1', direction: 'down' },
    });
  });

  it('renames a project and a tab', async () => {
    fetchFake.mockResolvedValue(empty());
    const api = setup();
    await api.renameSpace('s1', 'New');
    expect(lastCall()).toMatchObject({ url: '/api/layout/space/s1', method: 'PATCH', body: { name: 'New' } });
    await api.renameTab('tb1', 'Tab');
    expect(lastCall()).toMatchObject({ url: '/api/layout/tab/tb1', method: 'PATCH', body: { name: 'Tab' } });
  });

  it('moves a project to a 0-based index', async () => {
    fetchFake.mockResolvedValue(empty());
    await setup().move('space', 's1', 1);
    expect(lastCall()).toMatchObject({
      url: '/api/layout/move',
      method: 'POST',
      body: { kind: 'space', id: 's1', index: 1 },
    });
  });

  it('closes with the confirmation flag', async () => {
    fetchFake.mockResolvedValue(empty());
    const api = setup();
    await api.close('space', 's1');
    expect(lastCall()).toMatchObject({ url: '/api/layout/space/s1?confirmed=1', method: 'DELETE' });
    await api.close('tab', 'tb1');
    expect(lastCall().url).toBe('/api/layout/tab/tb1?confirmed=1');
    await api.close('pane', 'p1');
    expect(lastCall().url).toBe('/api/layout/pane/p1?confirmed=1');
  });

  it('encodes ids in the path', async () => {
    fetchFake.mockResolvedValue(empty());
    await setup().close('pane', 'a/b');
    expect(lastCall().url).toBe('/api/layout/pane/a%2Fb?confirmed=1');
  });

  it.each([
    [400, 'invalid'],
    [404, 'not-found'],
    [409, 'conflict'],
    [502, 'core'],
    [500, 'core'],
  ] as const)('maps %i to %s', async (status, kind) => {
    fetchFake.mockResolvedValue(new Response('x', { status }));
    const error = await setup().renameTab('tb1', 'x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LayoutError);
    expect((error as LayoutError).kind).toBe(kind);
  });

  it('treats a 409 on close as the last item', async () => {
    fetchFake.mockResolvedValue(new Response('conflict', { status: 409 }));
    const error = await setup().close('pane', 'p1').catch((e: unknown) => e);
    expect((error as LayoutError).kind).toBe('last-item');
  });

  it('reports an unreachable bridge as a core error', async () => {
    fetchFake.mockRejectedValue(new TypeError('offline'));
    const error = await setup().renameTab('tb1', 'x').catch((e: unknown) => e);
    expect((error as LayoutError).kind).toBe('core');
  });

  it('has a readable message per kind', () => {
    expect(new LayoutError('last-item').message).toMatch(/last/i);
    expect(new LayoutError('invalid').message).toMatch(/invalid/i);
  });
});
