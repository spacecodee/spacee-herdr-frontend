# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The client ships embedded in `spacee-herdr-bridge`; its deployment is documented there.

## [Unreleased]

### Added

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

- The app follows the system light or dark theme, including the terminal colors, and switches live.
- Default terminal text size is 12 px (was 13 px).

### Fixed

- The input-mode button in the key bar keeps a fixed name, "Direct typing", so screen readers no longer announce a contradiction.
- Opening the app while the bridge is unreachable (offline, Tailscale off) no longer sends you to the login screen: the app opens the page you asked for, shows "Reconnecting…" and keeps retrying. Only a real "not signed in" answer goes to login.
- Tapping the terminal no longer zooms the page on iOS.
- Swiping on the terminal no longer drags or bounces the page.
- Back from settings returns to the page you came from instead of the terminal list.

[unreleased]: https://github.com/spacecodee/spacee-herdr-frontend/commits/main
