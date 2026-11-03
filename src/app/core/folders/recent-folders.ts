import type { Space } from '../hc/spaces';
import type { Terminal } from '../hc/types';

/**
 * Folders the projects already use on this machine, newest project first (the desktop app appends
 * new projects), at most `limit`. A project's folder is the working directory of its first
 * terminal; terminals on added machines (`machine/t1`) are left out.
 */
export function recentFolders(spaces: readonly Space[], terminals: readonly Terminal[], limit = 4): string[] {
  const cwd = new Map(terminals.filter((t) => !t.address.includes('/')).map((t) => [t.address, t.cwd]));
  const out: string[] = [];
  for (const space of [...spaces].reverse()) {
    const address = space.tabs.flatMap((t) => t.addresses).find((a) => cwd.get(a));
    const folder = address ? cwd.get(address) : undefined;
    if (folder && folder.startsWith('/') && !out.includes(folder)) out.push(folder);
    if (out.length === limit) break;
  }
  return out;
}
