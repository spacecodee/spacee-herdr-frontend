import type { Space } from '../hc/spaces';
import type { Terminal } from '../hc/types';
import { recentFolders } from './recent-folders';

const space = (id: string, ...addresses: string[]): Space => ({
  id,
  name: id,
  tabs: [{ id: `${id}-t`, name: 't', addresses, panes: [] }],
});
const term = (address: string, cwd: string) => ({ address, cwd }) as Terminal;

describe('recentFolders', () => {
  const terminals = [term('t1', '/home/me/a'), term('t2', '/home/me/b'), term('t3', '/home/me/a'), term('gandalf/t1', '/srv/x'), term('t4', '/home/me/d'), term('t5', '/home/me/e'), term('t6', '/home/me/f')];

  it('lists the folders of the projects, newest project first, without repeats', () => {
    const spaces = [space('s1', 't1'), space('s2', 't2'), space('s3', 't3')];
    expect(recentFolders(spaces, terminals)).toEqual(['/home/me/a', '/home/me/b']);
  });

  it('leaves out projects on other machines and caps the list', () => {
    const spaces = [space('s1', 'gandalf/t1'), space('s2', 't1'), space('s3', 't2'), space('s4', 't4'), space('s5', 't5'), space('s6', 't6')];
    expect(recentFolders(spaces, terminals)).toEqual(['/home/me/f', '/home/me/e', '/home/me/d', '/home/me/b']);
    expect(recentFolders(spaces, terminals, 2)).toHaveLength(2);
  });

  it('is empty without projects', () => {
    expect(recentFolders([], terminals)).toEqual([]);
  });
});
