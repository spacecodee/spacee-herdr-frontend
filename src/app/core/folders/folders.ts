import { Service, inject } from '@angular/core';
import { HcClient, HcError } from '../hc/hc-client';
import { FolderError, HOME_ARGV, LIST_TIMEOUT_S, decodeOutput, isDirArgv, listArgv, parseListing, type Listing } from './folder-listing';
import { isSafePath } from './folder-path';

/** `machine.exec` result, the part the picker reads (stdout and stderr are base64). */
interface ExecResult {
  code?: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timed_out: boolean;
}

export { FolderError };

const OFFLINE_KINDS = new Set(['machine_unknown', 'unavailable', 'needs_update', 'spawn_failed']);

/** Reads folders on this machine or an added one through core's `machine.exec`, read-only. */
@Service()
export class Folders {
  private readonly client = inject(HcClient);
  private readonly homes = new Map<string, Promise<string>>();

  /** `machine` is `''` for the core this app talks to, else the added machine's name. */
  home(machine: string): Promise<string> {
    let home = this.homes.get(machine);
    if (!home) {
      home = this.exec(machine, [...HOME_ARGV], 5).then((r) => {
        const path = decodeOutput(r.stdout).trim();
        if (r.code !== 0 || !path.startsWith('/')) throw new FolderError('Could not find the home folder.');
        return path;
      });
      // A failed lookup is retried next time; a good one is kept.
      home.catch(() => this.homes.delete(machine));
      this.homes.set(machine, home);
    }
    return home;
  }

  async list(machine: string, dir: string): Promise<Listing> {
    const r = await this.exec(machine, listArgv(dir), LIST_TIMEOUT_S);
    if (r.timed_out) throw new FolderError('Reading this folder took too long.');
    if (r.code !== 0 && r.stdout === '') throw new FolderError(problemFrom(decodeOutput(r.stderr)));
    return parseListing(decodeOutput(r.stdout), dir);
  }

  /** True when `path` is a folder there. */
  async isFolder(machine: string, path: string): Promise<boolean> {
    if (!path.startsWith('/') || !isSafePath(path)) return false;
    const r = await this.exec(machine, isDirArgv(path), 5);
    return r.code === 0;
  }

  private async exec(machine: string, argv: string[], timeout: number): Promise<ExecResult> {
    try {
      return await this.client.call<ExecResult>('machine.exec', {
        argv,
        timeout,
        ...(machine ? { on: machine } : {}),
      });
    } catch (error) {
      const kind = error instanceof HcError ? error.kind : '';
      if (OFFLINE_KINDS.has(kind)) throw new FolderError(machine ? `${machine} is offline.` : 'Could not run on this machine.');
      throw new FolderError('Could not read the folder.');
    }
  }
}

function problemFrom(stderr: string): string {
  if (/permission denied/i.test(stderr)) return 'Permission denied.';
  if (/no such file|not a directory/i.test(stderr)) return 'That folder does not exist.';
  return 'Could not read this folder.';
}
