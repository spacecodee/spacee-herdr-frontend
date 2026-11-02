# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The client ships embedded in `spacee-herdr-bridge`; its deployment is documented there.

## [Unreleased]

### Added

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
- Automatic reconnect after the connection drops or the phone suspends the tab, with the terminal list and the open terminal restored without a tap; an expired session goes to the login screen.

### Changed

- The app follows the system light or dark theme, including the terminal colors, and switches live.
- Default terminal text size is 12 px (was 13 px).

### Fixed

- Opening the app while the bridge is unreachable (offline, Tailscale off) no longer sends you to the login screen: the app opens the page you asked for, shows "Reconnecting…" and keeps retrying. Only a real "not signed in" answer goes to login.
- Tapping the terminal no longer zooms the page on iOS.
- Swiping on the terminal no longer drags or bounces the page.
- Back from settings returns to the page you came from instead of the terminal list.

[unreleased]: https://github.com/spacecodee/spacee-herdr-frontend/commits/main
