export type ToolKind = 'shell' | 'read' | 'edit' | 'search' | 'web' | 'other';

const KINDS: [ToolKind, RegExp][] = [
  ['shell', /^(bash|shell|sh|zsh|exec|run|command|terminal|execute)/i],
  ['read', /^(read|view|cat|open|ls|list|glob_?read|notebookread)/i],
  ['edit', /^(edit|write|patch|apply|multiedit|create|replace|notebookedit|str_replace)/i],
  ['search', /^(grep|glob|find|search|codesearch|rg|lsp)/i],
  ['web', /^(web|fetch|http|browse|url|curl)/i],
];

/** Groups an agent's tool names into the few kinds the chat shows an icon for. */
export function toolKind(name: string): ToolKind {
  const n = name.trim();
  for (const [kind, re] of KINDS) if (re.test(n)) return kind;
  return 'other';
}
