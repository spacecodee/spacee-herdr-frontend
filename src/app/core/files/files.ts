import { Service, inject } from '@angular/core';
import { isSafePath } from '../folders/folder-path';
import { HcClient } from '../hc/hc-client';
import { execOn, textOf } from './remote-exec';

/** Largest file the viewer shows. */
export const MAX_FILE_BYTES = 1_048_576;
/** A NUL in this many first bytes means the file is not text. */
const SNIFF_BYTES = 8192;
const TIMEOUT_S = 10;

export type FileResult =
  | { kind: 'text'; text: string; /** Core cut the output short. */ truncated: boolean }
  | { kind: 'binary' }
  | { kind: 'too-large' }
  | { kind: 'not-found' };

/** Constant script: the path arrives as `$1`, never inside the script text. */
const SIZE_SCRIPT = 'wc -c < "$1"';

export const isBinary = (data: Uint8Array): boolean => data.subarray(0, SNIFF_BYTES).includes(0);

/** Reads files on a machine through core's `machine.exec`, read-only. */
@Service()
export class Files {
  private readonly client = inject(HcClient);

  /** `machine` is `''` for the core this app talks to; `path` is absolute. Throws `RemoteError` when the machine is out of reach. */
  async read(machine: string, path: string): Promise<FileResult> {
    if (!path.startsWith('/') || !isSafePath(path)) return { kind: 'not-found' };
    const size = await execOn(this.client, machine, ['sh', '-c', SIZE_SCRIPT, 'sh', path], TIMEOUT_S);
    const bytes = Number.parseInt(textOf(size.stdout).trim(), 10);
    if (size.code !== 0 || !Number.isFinite(bytes)) return { kind: 'not-found' };
    if (bytes > MAX_FILE_BYTES) return { kind: 'too-large' };
    const read = await execOn(this.client, machine, ['head', '-c', String(MAX_FILE_BYTES), '--', path], TIMEOUT_S);
    if (read.code !== 0 && read.stdout.length === 0) return { kind: 'not-found' };
    if (isBinary(read.stdout)) return { kind: 'binary' };
    return { kind: 'text', text: textOf(read.stdout), truncated: read.truncated };
  }
}
