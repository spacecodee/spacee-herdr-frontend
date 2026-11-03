import { TestBed } from '@angular/core/testing';
import { HcClient, HcError } from '../hc/hc-client';
import { Files, MAX_FILE_BYTES } from './files';

const b64 = (data: string | Uint8Array) =>
  btoa(String.fromCharCode(...(typeof data === 'string' ? new TextEncoder().encode(data) : data)));
const out = (stdout: string | Uint8Array = '', over: Record<string, unknown> = {}) => ({
  code: 0,
  stdout: b64(stdout),
  stderr: b64(''),
  truncated: false,
  timed_out: false,
  ...over,
});

describe('Files', () => {
  let call: ReturnType<typeof vi.fn>;
  let files: Files;
  const path = '/home/me/my proj/a "b" $(x); y.ts';

  function core(size: string, content: string | Uint8Array, read: Record<string, unknown> = {}) {
    call.mockImplementation((_m: string, p: { argv: string[] }) =>
      Promise.resolve(p.argv[0] === 'sh' ? out(size) : out(content, read)),
    );
  }

  beforeEach(() => {
    call = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: HcClient, useValue: { call } }] });
    files = TestBed.inject(Files);
  });

  it('asks the size with a constant script and reads with head, the path as its own element', async () => {
    core('12\n', 'hello\nworld\n');
    const r = await files.read('rohan', path);
    expect(r).toEqual({ kind: 'text', text: 'hello\nworld\n', truncated: false });
    const [size, read] = call.mock.calls.map((c) => c[1]);
    expect(size.on).toBe('rohan');
    expect(size.argv).toEqual(['sh', '-c', 'wc -c < "$1"', 'sh', path]);
    expect(read.argv).toEqual(['head', '-c', String(MAX_FILE_BYTES), '--', path]);
    expect(read.timeout).toBe(10);
  });

  it('uses the local core when the machine is empty', async () => {
    core('3', 'abc');
    await files.read('', path);
    expect('on' in call.mock.calls[0][1]).toBe(false);
  });

  it('does not read a file over 1 MB', async () => {
    core(String(MAX_FILE_BYTES + 1), 'x');
    expect(await files.read('', path)).toEqual({ kind: 'too-large' });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('calls a file binary when a NUL shows up in its first 8 KB', async () => {
    core('10', new Uint8Array([104, 105, 0, 1, 2]));
    expect(await files.read('', path)).toEqual({ kind: 'binary' });
    const late = new Uint8Array(9000).fill(65);
    late[8500] = 0;
    core('9000', late);
    expect((await files.read('', path)).kind).toBe('text');
  });

  it('says not found when the size cannot be read', async () => {
    call.mockResolvedValue(out('', { code: 1, stderr: b64('wc: No such file or directory') }));
    expect(await files.read('', path)).toEqual({ kind: 'not-found' });
  });

  it('keeps what it got and says so when core cut the output', async () => {
    core('50', 'part', { truncated: true });
    expect(await files.read('', path)).toEqual({ kind: 'text', text: 'part', truncated: true });
  });

  it('refuses a relative or unsafe path before asking anything', async () => {
    expect(await files.read('', 'src/a.ts')).toEqual({ kind: 'not-found' });
    expect(await files.read('', '/a\nb')).toEqual({ kind: 'not-found' });
    expect(call).not.toHaveBeenCalled();
  });

  it('reports an offline machine as an error', async () => {
    call.mockRejectedValue(new HcError('x', 'unavailable'));
    await expect(files.read('rohan', path)).rejects.toThrow('rohan is offline.');
  });
});
