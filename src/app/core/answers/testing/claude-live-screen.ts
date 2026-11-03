/**
 * Claude Code 2.1.317's real permission screen, captured from a live terminal (trimmed to its
 * first rows, project path replaced by /tmp/x). The owner's statusline panel draws `│` borders and
 * its own text to the right of every line, and Claude has four rows: Yes, always allow access,
 * switch to auto mode, and a plain No.
 */
export const CLAUDE_LIVE_SCREEN = [
  "                                                                                                                                     │                                                                ✕",
  " ▐▛███▛█   Claude Code v2.1.317                                                                                                      │                   FLIGHTDECK · SONNET 5.5 WORKS",
  "▝▜██████▀  Sonnet 5.5 · Claude Max                                                                                                   │                     ■ main  ■ agents  ■ gate",
  " ▝▝   ▝▝   /tmp/x                                                                                            │╭────────────────────────────────────────────────────────────────╮",
  "                                                                                                                                     ││ Sonnet 5.5 · main                                    ● working │",
  "                                                                                                                                     ││ effort ▮▮▯▯ medium   mode default   3 req                      │",
  "❯ Run this exact shell command with the Bash tool: touch prueba.txt . Then reply done.                                               ││ ctx ▰▰▱▱▱▱▱▱▱▱ 20% 81k/400k                                    │",
  "                                                                                                                                     ││ $0.80   5h ▰▱▱▱▱ 29% ↻1h47m  7d ▰▱▱▱▱ 22% ↻4d3h                │",
  "  Ran 1 shell command                                                                                                                ││ last req  ttft 1.2s                                            │",
  "                                                                                                                                     │╰────────────────────────────────────────────────────────────────╯",
  "● Done.                                                                                                                              │────────────────•●─────────────────────•●───────────────•●────────",
  "                                                                                                                                     │╭────────────────────────────────────────────────────────────────╮",
  "✻ Sautéed for 13s · done 2:41 PM                                                                                                     ││ GATE · permissions                                    2 checks │",
  "                                                                                                                                     ││ ■■                                                             │",
  "❯ <hc from=\"t13\">Now run with the Bash tool: touch segundo.txt</hc>                                                                  ││ ■ 0 allowed  ■ 1 you  ■ 1 pending  ✗ 0 denied                  │",
  "                                                                                                                                     ││ f: file 0  s: shell 2  o: other 0                              │",
  "  Creating empty file segundo.txt                                                                                                    │╰────────────────────────────────────────────────────────────────╯",
  "  ⎿  $ touch segundo.txt                                                                                                             │────────────────•●─────────────────────•●───────────────•●────────",
  "                                                                                                                                     │╭────────────────────────────────────────────────────────────────╮",
  "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────││ ◐ back to sonnet 5.5 · turn 0:15 · 0 edits · 0 errors          │",
  " Bash command                                                                                                                        │╰────────────────────────────────────────────────────────────────╯",
  " Tip: auto mode handles these prompts for you — choose \"switch to auto mode\" below                                                   │",
  " Create empty file segundo.txt                                                                                                       │╭────────────────────────────────────────────────────────────────╮",
  "╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌││ session log                                                    │",
  " touch segundo.txt                                                                                                                   ││ 14:40:10 you          Run this exact shell command with the B… │",
  "╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌││ 14:42:18 engine       hc from t13                              │",
  " Do you want to proceed?                                                                                                             │╰────────────────────────────────────────────────────────────────╯",
  " ❯ 1. Yes                                                                                                                            │",
  "   2. Yes, and always allow access to /tmp/x from this project                                               │",
  "   3. Yes, and switch to auto mode · auto mode handles these prompts for you                                                         │",
  "   4. No                                                                                                                             │",
  "                                                                                                                                     │",
  " Esc to cancel · Tab to amend                                                                                                        │",
  "                                                                                                                                     │",
  "                                                                                                                                     │",
  "                                                                                                                                     │"
].join('\n');
