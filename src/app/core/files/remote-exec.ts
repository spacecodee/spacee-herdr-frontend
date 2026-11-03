import { HcClient, HcError } from '../hc/hc-client';
import { OFFLINE_KINDS, type ExecResult } from '../folders/folders';

/** A failure with a sentence for the person; screens show it as is. */
export class RemoteError extends Error {
  constructor(
    message: string,
    /** The machine could not be reached at all (as opposed to a command failing). */
    readonly offline = false,
  ) {
    super(message);
  }
}

export interface Ran {
  code: number | null;
  stdout: Uint8Array;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
}

const bytes = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const utf8 = new TextDecoder();

export const textOf = (data: Uint8Array): string => utf8.decode(data);

/** Runs one argv on `machine` (`''` is the core this app talks to) with core's `machine.exec`. */
export async function execOn(client: HcClient, machine: string, argv: string[], timeout: number): Promise<Ran> {
  let r: ExecResult;
  try {
    r = await client.call<ExecResult>('machine.exec', { argv, timeout, ...(machine ? { on: machine } : {}) });
  } catch (error) {
    const kind = error instanceof HcError ? error.kind : '';
    if (OFFLINE_KINDS.has(kind)) throw new RemoteError(machine ? `${machine} is offline.` : 'Could not run on this machine.', true);
    throw new RemoteError('Could not read from this machine.');
  }
  return {
    code: r.code ?? null,
    stdout: bytes(r.stdout),
    stderr: textOf(bytes(r.stderr)),
    truncated: r.truncated,
    timedOut: r.timed_out,
  };
}
