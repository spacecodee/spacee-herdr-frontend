const COMMAND_NAME = /^\/[a-z][\w:-]*$/;

/**
 * The text of a user message that is a slash command line, trimmed, else null: one line only, and
 * the first token is `/name` (lowercase, no further slash, so file paths are not commands).
 */
export function slashCommandLine(text: string): string | null {
  const line = text.trim();
  if (line === '' || line.includes('\n')) return null;
  return COMMAND_NAME.test(line.split(/\s+/)[0]) ? line : null;
}
