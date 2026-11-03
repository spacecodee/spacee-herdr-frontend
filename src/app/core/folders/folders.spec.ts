import { TestBed } from '@angular/core/testing';
import { HcClient, HcError } from '../hc/hc-client';
import { FolderError, Folders } from './folders';

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const result = (over: Partial<{ code: number; stdout: string; stderr: string; timed_out: boolean }> = {}) => ({
  code: 0,
  stdout: b64(''),
  stderr: b64(''),
  truncated: false,
  timed_out: false,
  ms: 3,
  ...over,
});

describe('Folders', () => {
  let call: ReturnType<typeof vi.fn>;
  let folders: Folders;

  beforeEach(() => {
    call = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: HcClient, useValue: { call } }] });
    folders = TestBed.inject(Folders);
  });

  it('reads home once per machine and runs on the added machine', async () => {
    call.mockResolvedValue(result({ stdout: b64('/home/me') }));
    expect(await folders.home('')).toBe('/home/me');
    expect(await folders.home('')).toBe('/home/me');
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][1]).not.toHaveProperty('on');
    await folders.home('gandalf');
    expect(call.mock.calls[1][1]).toMatchObject({ on: 'gandalf' });
  });

  it('sends a hostile path as one argv element, never as a line or through sh -c', async () => {
    const dir = `/tmp/a b/"q"/$(touch pwned);echo \`x\`'y'`;
    call.mockResolvedValue(result());
    await folders.list('gandalf', dir);
    const [method, params] = call.mock.calls[0];
    expect(method).toBe('machine.exec');
    expect(params).not.toHaveProperty('line');
    expect(params.argv[0]).toBe('find');
    expect(params.argv.filter((a: string) => a.includes('touch pwned'))).toEqual([dir]);
    expect(params).toMatchObject({ on: 'gandalf', timeout: 10 });
    await folders.isFolder('', dir);
    const check = call.mock.calls[1][1];
    expect(check.argv).toEqual(['test', '-d', dir]);
    expect(check).not.toHaveProperty('line');
  });

  it('refuses a path with a newline or NUL without calling core', async () => {
    await expect(folders.list('', '/a\nb')).rejects.toBeInstanceOf(FolderError);
    await expect(folders.list('', '/a\u0000b')).rejects.toBeInstanceOf(FolderError);
    expect(await folders.isFolder('', '/a\nb')).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });

  it('refuses -delete, relative and empty paths without any exec call', async () => {
    for (const bad of ['-delete', 'relative/dir', '']) {
      await expect(folders.list('', bad)).rejects.toBeInstanceOf(FolderError);
      expect(await folders.isFolder('', bad)).toBe(false);
    }
    expect(call).not.toHaveBeenCalled();
  });

  it('parses the listing', async () => {
    call.mockResolvedValue(result({ stdout: b64('G\0/p/b\0D\0/p/A\0') }));
    const { entries } = await folders.list('', '/p');
    expect(entries.map((e) => [e.name, e.git])).toEqual([['A', false], ['b', true]]);
  });

  it('says what went wrong in a sentence', async () => {
    call.mockResolvedValueOnce(result({ code: 1, stderr: b64("find: '/root': Permission denied") }));
    await expect(folders.list('', '/root')).rejects.toThrow('Permission denied.');
    call.mockResolvedValueOnce(result({ code: 1, stderr: b64("find: '/nope': No such file or directory") }));
    await expect(folders.list('', '/nope')).rejects.toThrow('That folder does not exist.');
    call.mockResolvedValueOnce(result({ timed_out: true }));
    await expect(folders.list('', '/slow')).rejects.toThrow('took too long');
    call.mockRejectedValueOnce(new HcError('x', 'machine_unknown', -32000));
    await expect(folders.list('rohan', '/')).rejects.toThrow('rohan is offline.');
    call.mockRejectedValueOnce(new HcError('x', 'unavailable', -32000));
    await expect(folders.list('rohan', '/')).rejects.toThrow('rohan is offline.');
  });

  it('retries the home lookup after a failure', async () => {
    call.mockRejectedValueOnce(new HcError('x', 'unavailable', -32000));
    await expect(folders.home('rohan')).rejects.toBeInstanceOf(FolderError);
    call.mockResolvedValueOnce(result({ stdout: b64('/home/me') }));
    expect(await folders.home('rohan')).toBe('/home/me');
  });

  it('checks that a typed path is a folder', async () => {
    call.mockResolvedValueOnce(result({ code: 0 })).mockResolvedValueOnce(result({ code: 1 }));
    expect(await folders.isFolder('', '/etc')).toBe(true);
    expect(await folders.isFolder('', '/etc/passwd')).toBe(false);
  });
});
