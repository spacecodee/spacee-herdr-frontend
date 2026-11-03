# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The client ships embedded in `spacee-herdr-bridge`; its deployment is documented there.

## [Unreleased]

### Added

- Home screen as a conversations list, like a chat app: each agent terminal shows its agent mark with a status dot, the conversation title, the time of the last message, a two-line preview ("Working…" while the agent works) and its tab and address, grouped by space and ordered by last activity. A search field filters by space, tab, terminal name, title and last message, and a "Needs attention" strip at the top lists every blocked terminal. Plain shells and terminals without a transcript move to a "Terminals" section that starts collapsed.
- Chat view for agent terminals: terminals running a coding agent open as a conversation with message bubbles, formatted text (code blocks with a copy button, tables, links), collapsible "Thought" lines and tool calls with their input and output, and live updates. A Chat / Terminal switch in the header is remembered per terminal, and the real terminal stays connected underneath.
- In chat, the message field is the input, with a `/` button for common slash commands per agent, plus Esc and Ctrl+C (interrupt) keys. A card appears when the agent needs your answer in the terminal, and a button jumps back to the newest message after scrolling up.
- Spaces and tabs on the terminal list collapse and expand. Each header shows the terminal count and, when something needs attention, a status summary such as "1 blocked". Your choice is remembered, and a collapsed space opens by itself when one of its terminals becomes blocked.
- A New line button next to Send in the message field: it adds a line break at the cursor without closing the keyboard, in both Return key modes.

- Diagnostics and Force update in Settings: a copyable block with the build, service worker, screen and safe-area measurements, and a button that fetches the latest version or clears the app cache and reloads.
- Message drafts are kept per terminal: leave a terminal, switch apps or reload and the unsent text is still there.
- Return key setting: Return can send the message (default) or add a new line; in New line mode the Send button sends, and Cmd+Return or Ctrl+Return sends from a hardware keyboard.
- Attach or paste images in the message field: they are shrunk, uploaded to the host and their file path is inserted, with a thumbnail to remove each one.
- Terminal list grouped as Space > Tab > terminals, in the same order as the desktop app; terminals outside any tab go under Other. It updates when the layout changes.
- Notifications in Settings: enable or disable them on this phone, and send a test. On iPhone this needs the app added to the Home Screen first.
- Login screen that exchanges the bridge access token for a session.
- Live terminal list grouped by machine, with each agent's status (working, blocked, done, idle).
- Terminal view: attach to a terminal with its recent history, type, resize, focus reporting, and banners when the program exits or the connection ends.
- Mobile key bar under the terminal: Esc, Tab, one-shot Ctrl (applies to the next key from the bar or the phone keyboard) and arrows, which work in shells and full-screen programs.
- Settings page: terminal text size and touch scroll speed, saved in the browser.
- Touch scrolling in the terminal: scrollback in shells, scrolling inside full-screen programs.
- Bundled JetBrainsMono Nerd Font Mono, so prompt icons (powerlevel10k) render on phones.
- Installable app: add it to the iPhone home screen and it opens full screen as "Herdr", with its own icon and light/dark status bar colors.
- The app shell loads instantly from a cache; terminals and the session always come live from the bridge, never from the cache.
- A "New version available" notice with a Reload button when an update is ready; updates are also checked each time you return to the app.
- Message field under the terminal, now the default way to type: a normal text box with iPhone autocorrect, predictions and dictation, that grows up to 5 lines. Send pastes the text and presses Enter; Shift+Enter adds a line. Pending Ctrl applies to the next character typed in it.
- Suggestions while typing (the last 50 messages per terminal, tap to fill) and Up/Down to walk that history with a hardware keyboard.
- A key bar button switches between the message field and direct typing (for vim, less); the choice is remembered and can be set under Settings → Default input. The key bar also has an Enter key.
- Automatic reconnect after the connection drops or the phone suspends the tab, with the terminal list and the open terminal restored without a tap; an expired session goes to the login screen.

### Changed

- The chat and terminal header is named after the terminal's tab (for example "Implementer - B"), like its row on the home screen, instead of the bare address.
- Settings diagnostics wrap long lines instead of scrolling sideways.
- Agent avatars show each agent's own icon (Claude Code, Codex, opencode, Antigravity, Gemini CLI, and the Gentle AI rose for pi) instead of letters; shells and unknown agents keep their glyph. The icons are cached for offline use.
- Rows on the home screen and the "Needs attention" cards now lead with who the terminal is (its tab name, else its name), with the last message below and "Claude Code · t16" style agent and address underneath. The conversation title (the first prompt) moved to the chat header, and search still matches it.

- The home screen follows your herdr projects: each space lists all its terminals in the desktop's tab order, agent conversations and plain shells together (shells as compact rows with their working directory), and the separate Terminals section is gone. Terminals outside any space are grouped by machine at the end.
- The home screen is titled "Herdr" and no longer groups terminals by tab.
- The terminal has a small margin so text no longer touches the screen edges.
- New look across login, terminal list, terminal and settings: grouped rounded lists with thin separators, a compact sticky top bar, one type and spacing scale, line icons instead of text symbols, and agent status as a colored dot plus its name (blocked stands out). Light and dark both meet AA contrast.
- The Enter button in the key bar is now named "Enter key" for screen readers, so it is not confused with New line.
- The app follows the system light or dark theme, including the terminal colors, and switches live.
- Default terminal text size is 12 px (was 13 px).

### Fixed

- Return in the message field now adds a line on the iPhone keyboard in New line mode, and sends in Send mode even when iOS reports the key as part of text composition. Typing in the middle of a message no longer moves the cursor to the end.
- Installed iPhone app: the page no longer extends under the status bar and home indicator (it is not edge-to-edge any more), which removes the blurred strip over the header. Diagnostics now also lists where the terminal screen's parts sit.
- Installed iPhone app: the header is no longer washed out under the status bar; the status bar now has its own colour instead of the page drawing beneath it.
- Installed iPhone app: the empty band under the key bar is gone; the key bar sits right above the home indicator, with the keyboard closed or open.

- The input-mode button in the key bar keeps a fixed name, "Direct typing", so screen readers no longer announce a contradiction.
- Opening the app while the bridge is unreachable (offline, Tailscale off) no longer sends you to the login screen: the app opens the page you asked for, shows "Reconnecting…" and keeps retrying. Only a real "not signed in" answer goes to login.
- Tapping the terminal no longer zooms the page on iOS.
- Swiping on the terminal no longer drags or bounces the page.
- Back from settings returns to the page you came from instead of the terminal list.

[unreleased]: https://github.com/spacecodee/spacee-herdr-frontend/commits/main
