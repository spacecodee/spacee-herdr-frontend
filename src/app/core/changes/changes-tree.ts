import type { ChangeFile } from './changes';
import { splitPath } from './changes-view';

export interface FolderNode {
  kind: 'folder';
  /** One row's label: a chain of single-child folders joins as `src/app/core`. */
  name: string;
  /** Full path from the repository top, the key for collapsing. */
  path: string;
  depth: number;
  /** Lines added and deleted by the non-binary files below. */
  added: number;
  deleted: number;
  children: TreeNode[];
}

export interface FileNode {
  kind: 'file';
  name: string;
  depth: number;
  file: ChangeFile;
}

export type TreeNode = FolderNode | FileNode;

interface Dir {
  folders: Map<string, Dir>;
  files: ChangeFile[];
}

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** The changed files as a folder tree: single-child folder chains compacted, folders before files, both alphabetical. */
export function buildTree(files: ChangeFile[]): TreeNode[] {
  const root: Dir = { folders: new Map(), files: [] };
  for (const file of files) {
    let dir = root;
    for (const part of splitPath(file.path).dir.split('/').filter(Boolean)) {
      let next = dir.folders.get(part);
      if (!next) dir.folders.set(part, (next = { folders: new Map(), files: [] }));
      dir = next;
    }
    dir.files.push(file);
  }
  return nodesOf(root, '', 0);
}

/** The files in the order the tree lists them, whatever the order they came in. */
export function treeOrder(files: ChangeFile[]): ChangeFile[] {
  const out: ChangeFile[] = [];
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'file') out.push(node.file);
      else walk(node.children);
    }
  };
  walk(buildTree(files));
  return out;
}

function nodesOf(dir: Dir, parent: string, depth: number): TreeNode[] {
  const folders = [...dir.folders.keys()].sort(byName).map((key): FolderNode => {
    let name = key;
    let child = dir.folders.get(key)!;
    while (child.files.length === 0 && child.folders.size === 1) {
      const [only] = child.folders;
      name += `/${only[0]}`;
      child = only[1];
    }
    const children = nodesOf(child, `${parent}${name}/`, depth + 1);
    const sums = { added: 0, deleted: 0 };
    for (const c of children) {
      const own = c.kind === 'folder' ? c : c.file.binary ? { added: 0, deleted: 0 } : c.file;
      sums.added += own.added;
      sums.deleted += own.deleted;
    }
    return { kind: 'folder', name, path: `${parent}${name}`, depth, ...sums, children };
  });
  const files = [...dir.files]
    .map((file): FileNode => ({ kind: 'file', name: splitPath(file.path).name, depth, file }))
    .sort((a, b) => byName(a.name, b.name));
  return [...folders, ...files];
}
