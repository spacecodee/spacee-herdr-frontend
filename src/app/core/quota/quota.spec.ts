import { TestBed } from '@angular/core/testing';
import { HcClient, HcError } from '../hc/hc-client';
import fixture from './quota-fixture.json';
import { Quota, QUOTA_ARGV, REFRESH_MS } from './quota';

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const result = (over: Partial<{ code: number; stdout: string; stderr: string; timed_out: boolean }> = {}) => ({
  code: 0,
  stdout: b64(JSON.stringify(fixture)),
  stderr: b64(''),
  truncated: false,
  timed_out: false,
  ...over,
});

describe('Quota', () => {
  let call: ReturnType<typeof vi.fn>;
  let quota: Quota;

  beforeEach(() => {
    vi.useFakeTimers();
    call = vi.fn().mockResolvedValue(result());
    TestBed.configureTestingModule({ providers: [{ provide: HcClient, useValue: { call } }] });
    quota = TestBed.inject(Quota);
  });
  afterEach(() => vi.useRealTimers());

  it('runs one constant argv with a 30 s timeout, on the machine asked for', async () => {
    await quota.load('');
    await quota.load('gandalf');
    const [method, params] = call.mock.calls[0];
    expect(method).toBe('machine.exec');
    expect(params).toEqual({ argv: [...QUOTA_ARGV], timeout: 30 });
    expect(call.mock.calls[1][1]).toMatchObject({ on: 'gandalf' });
    expect(QUOTA_ARGV.join(' ')).toContain('quota-axi --json');
  });

  it('is loading first, then ready with the parsed report and the time', async () => {
    expect(quota.view('')().status).toBe('idle');
    const pending = quota.load('');
    expect(quota.view('')().status).toBe('loading');
    await pending;
    const v = quota.view('')();
    expect(v.status).toBe('ready');
    expect(v.report?.providers[0].provider).toBe('claude');
    expect(v.at).toBe(Date.now());
  });

  it('exit 127 is not installed', async () => {
    call.mockResolvedValue(result({ code: 127, stdout: b64(''), stderr: b64('sh: quota-axi: not found') }));
    await quota.load('');
    expect(quota.view('')().status).toBe('not-installed');
  });

  it('timeouts, odd output and an offline machine are errors with a sentence', async () => {
    call.mockResolvedValueOnce(result({ timed_out: true, code: undefined }));
    await quota.load('');
    expect(quota.view('')()).toMatchObject({ status: 'error', message: expect.stringContaining('too long') });
    call.mockResolvedValueOnce(result({ stdout: b64('garbage') }));
    await quota.load('');
    expect(quota.view('')().status).toBe('error');
    call.mockRejectedValueOnce(new HcError('x', 'machine_unknown', -32000));
    await quota.load('rohan');
    expect(quota.view('rohan')()).toMatchObject({ status: 'error', message: 'rohan is offline.' });
  });

  it('a failed refresh keeps the last numbers', async () => {
    await quota.load('');
    call.mockRejectedValueOnce(new HcError('x', 'unavailable', -32000));
    await quota.load('');
    const v = quota.view('')();
    expect(v.status).toBe('ready');
    expect(v.report).not.toBeNull();
    expect(v.failed).toBe(true);
  });

  it('does not start a second read while one runs', async () => {
    await Promise.all([quota.load(''), quota.load('')]);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('tracking loads now and every 2 min while the page is visible, and stops when released', async () => {
    const stop = quota.track('');
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(call).toHaveBeenCalledTimes(2);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(call).toHaveBeenCalledTimes(2);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    stop();
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 2);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('tracking a fresh machine does not re-run it', async () => {
    await quota.load('');
    const stop = quota.track('');
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toHaveBeenCalledTimes(1);
    stop();
  });
});
