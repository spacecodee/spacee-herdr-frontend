import type { ChangeFile } from './changes';
import { buildTree, treeOrder, type TreeNode } from './changes-tree';

const f = (path: string, added = 1, deleted = 0, over: Partial<ChangeFile> = {}): ChangeFile => ({
  path, added, deleted, status: 'M', binary: false, untracked: false, ...over,
});

const shape = (nodes: TreeNode[]): unknown[] =>
  nodes.map((n) => (n.kind === 'folder' ? { folder: n.name, depth: n.depth, children: shape(n.children) } : { file: n.name, depth: n.depth }));

describe('buildTree', () => {
  it('compacts a chain of single-child folders into one row', () => {
    expect(shape(buildTree([f('src/app/core/a.ts')]))).toEqual([
      { folder: 'src/app/core', depth: 0, children: [{ file: 'a.ts', depth: 1 }] },
    ]);
  });

  it('does not compact a folder that has files or two folders', () => {
    const tree = buildTree([f('src/x.ts'), f('src/app/a.ts'), f('lib/one/two/b.ts'), f('lib/one/c.ts')]);
    expect(shape(tree)).toEqual([
      { folder: 'lib/one', depth: 0, children: [{ folder: 'two', depth: 1, children: [{ file: 'b.ts', depth: 2 }] }, { file: 'c.ts', depth: 1 }] },
      { folder: 'src', depth: 0, children: [{ folder: 'app', depth: 1, children: [{ file: 'a.ts', depth: 2 }] }, { file: 'x.ts', depth: 1 }] },
    ]);
    const two = buildTree([f('a/b/c.ts'), f('a/d/e.ts')]);
    expect(shape(two)).toEqual([
      { folder: 'a', depth: 0, children: [
        { folder: 'b', depth: 1, children: [{ file: 'c.ts', depth: 2 }] },
        { folder: 'd', depth: 1, children: [{ file: 'e.ts', depth: 2 }] },
      ] },
    ]);
  });

  it('puts root files at depth 0, after the folders', () => {
    expect(shape(buildTree([f('z.md'), f('a/b.ts'), f('A.md')]))).toEqual([
      { folder: 'a', depth: 0, children: [{ file: 'b.ts', depth: 1 }] },
      { file: 'A.md', depth: 0 },
      { file: 'z.md', depth: 0 },
    ]);
  });

  it('orders folders first then files, alphabetical ignoring case', () => {
    const tree = buildTree([f('d/y.ts'), f('d/B.ts'), f('d/a.ts'), f('d/Zed/q.ts'), f('d/alpha/q.ts')]);
    const children = (tree[0] as Extract<TreeNode, { kind: 'folder' }>).children.map((n) => n.name);
    expect(children).toEqual(['alpha', 'Zed', 'a.ts', 'B.ts', 'y.ts']);
  });

  it('sums added and deleted per folder, skipping binary files', () => {
    const tree = buildTree([f('a/x.ts', 5, 2), f('a/b/y.ts', 3, 1), f('a/b/logo.png', 0, 0, { binary: true, added: 99, deleted: 99 })]);
    const a = tree[0] as Extract<TreeNode, { kind: 'folder' }>;
    expect([a.added, a.deleted]).toEqual([8, 3]);
    const b = a.children[0] as Extract<TreeNode, { kind: 'folder' }>;
    expect([b.added, b.deleted]).toEqual([3, 1]);
  });

  it('gives a folder a path that is unique for toggling', () => {
    const tree = buildTree([f('src/app/a.ts')]);
    expect((tree[0] as Extract<TreeNode, { kind: 'folder' }>).path).toBe('src/app');
  });
});

describe('treeOrder', () => {
  it('lists the files in the order the tree shows them', () => {
    const files = [f('z.md'), f('src/b.ts'), f('src/app/a.ts'), f('a.md')];
    expect(treeOrder(files).map((x) => x.path)).toEqual(['src/app/a.ts', 'src/b.ts', 'a.md', 'z.md']);
  });
});
