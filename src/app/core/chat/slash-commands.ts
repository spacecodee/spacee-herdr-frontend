/** The common slash commands per agent kind, offered as chips by the `/` button. Static on purpose. */
const COMMON = ['/help', '/clear', '/model'];

const BY_AGENT: Record<string, string[]> = {
  claude: ['/clear', '/compact', '/model', '/resume', '/help'],
  pi: ['/new', '/model', '/resume', '/help'],
  codex: ['/new', '/model', '/status', '/compact', '/help'],
  opencode: ['/new', '/models', '/sessions', '/compact', '/help'],
  agy: ['/new', '/clear', '/model', '/help'],
};

export function slashCommands(agent: string | null | undefined): string[] {
  const key = (agent ?? '').toLowerCase();
  const hit = Object.entries(BY_AGENT).find(([name]) => key.includes(name));
  return hit ? hit[1] : COMMON;
}
