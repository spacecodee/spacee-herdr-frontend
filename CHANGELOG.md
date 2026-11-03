# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The client ships embedded in `spacee-herdr-bridge`; its deployment is documented there.

## [Unreleased]

## [1.3.0] - 2026-11-03

### Added

- Change your mind from the chat: tap a queued message (Claude Code) to edit or cancel it, with an Undo, and long-press a sent message (or tap its … button) to edit and resend it or rewind the conversation to it, with an optional "Also restore files" on Claude Code. Works for Claude Code, Codex and opencode, only while the agent is idle.

## [1.2.1] - 2026-11-03

### Added

- MIT license, and a README with screenshots for the public repository.

## [1.2.0] - 2026-11-03

### Added

- When another screen (the desktop app) has made a terminal bigger than your phone, the terminal shows "Sized for another screen (210×50)" under the header with a Fit to this phone button. It resizes the terminal to your phone and shows "Fitted to this phone · Undo" for four seconds. Settings has an "Always fit to this phone" switch (off by default) that does it each time you open a terminal, but never in answer to the other screen's resize.
- When an agent waits on a permission prompt (Claude Code, Codex, opencode or pi), the chat card in Needs attention shows the request and the agent's own choices as buttons: approve, approve and remember, deny, and "No, and tell …", which puts the cursor in the message field ("Tell Claude Code what to do instead") and sends your reason once the agent is free. With one blocked agent, Home shows the approve and deny buttons right on its Needs attention row, with More opening the chat. The app reads the agent's screen twice before showing buttons and checks it before every key; when the screen is unclear, too short or anything else, it offers Open terminal and never approves. After you answer, the card shrinks to "You answered: …".
- Changes: a chat whose project folder has uncommitted git changes shows a small "+124 −18 · 6 files" chip under the Chat/Terminal switch (it refreshes when you open the chat and when the agent finishes a turn, never more than once every 15 seconds) and a Changes item in the … menu with the file count. It opens a screen with the branch, the totals and Unstaged, Staged and Last commit tabs, one row per file with its status and +/− counts, and a unified diff per file with line numbers, tinted added and removed lines, a Previous/Next file bar, and Open file and Copy path in its … menu. Untracked files show as added, binary files and diffs over 2,000 lines get their own notice, and a folder that is not a git repository says so. It only reads, with git on the machine the terminal runs on.
- File viewer: Open file from a diff, or a file path in an agent's reply (absolute, or relative to the project folder), opens the file read-only with line numbers, light syntax colors, search in the file with the match count and previous/next, and Copy path. Files over 1 MB, binary files and missing files each say so.
- Saved prompts: a zap button in the message field opens a sheet with your saved prompts and command chips (`/clear`, `/compact`, `/init`, `/review`). Tap one to put it in the field at the cursor, or mark it "Send right away" to send it as if you had typed it. Long-press (or the … button) to edit or delete, and add your own with New prompt. Settings has a Saved prompts row with the same list. They are kept on this device only, not shared between your phone and other browsers.
- When an agent asks you questions (Claude Code, Codex, opencode or pi), the chat shows them as a card you can answer from the phone: tap an option (or several), type your own answer or a free-text one, hide a secret behind a mask, go through several questions with a review step, and send. The app types your answer into the agent's own screen and checks the screen before every key; if anything does not match it stops and offers Open terminal, and once the agent records the answer the card collapses to a summary. Home shows "Asked you N questions" on the conversation and an Answer card in Needs attention.
- Stats shows your own delivery numbers, counted with `gh` on the machine you pick: PRs merged today and this week, PRs merged per week over 12 weeks, median time to merge, open PRs, reviews given, merge rate, how much of your merged work was made with Claude, Codex or both, and PRs and commits per repository. It opens from a new Stats row in Settings, remembers the numbers for 30 minutes per machine, refreshes on tap, and asks you to run `gh auth login` when `gh` is not logged in. The counting is ported from the Herdr "stats" mod by Lakris2407 (MIT).
- Usage shows how much of your agent plans you have used: a small indicator in the home header (Claude's 5-hour and weekly limits, a dot for the connection instead of the word "Live") opens a Usage screen with a card per agent, a bar per limit that turns amber from 60% used and red from 92% ("Running low", "Almost out"), when it resets, and whether you are ahead of or under pace. Switch machines with the chips, refresh by hand, show what is left instead of what is used, and see a clear message when quota-axi is not installed or an agent is signed out. Settings has a Usage row with the current Claude figure.

## [1.1.0] - 2026-11-03

### Added

- New project lets you pick the folder instead of typing it: the Folder field opens a "Choose folder" sheet that browses the folders on this machine or any connected added machine (switch with the chips at the top), with a breadcrumb from `~`, recently used project folders, a `git` badge on repositories, and a filter that highlights matching letters as you type. Type a path starting with `/` or `~` and press Go to jump straight to it. "Use this folder" fills the field and creates the project on that machine.
- Settings lists the machines this one reaches over ssh, with this machine first and each added machine showing its host and state: connected with its terminal count, offline, needs login (with the command to run, one tap to copy) or needs update. "Add machine" takes an ssh host and an optional name and explains in plain words why a machine cannot be added; tapping a machine offers Rename, Reconnect, Update hc and Remove (its terminals keep running there).
- Sign in with a pairing code: the login asks for a six-character code (type it, paste it, or open the link from a QR) and keeps the access token one tap away.
- Settings lists the devices signed in to the bridge, each with its icon, "This device" badge, last activity and sign-in date. Tap one to rename it or sign it out (its notifications stop too), and "Add a device" shows a one-time code and QR with a countdown for signing in a new phone.
- Agents show their icon and open as a chat before the first message is sent.
- The chat shows messages you send while Claude Code is working: they wait at the bottom, faded and labelled "Queued", and move into the conversation once Claude takes them.

### Changed

- Folder picker loads on demand, smaller initial download: the layout sheets, the folder picker and the toast area now load when first needed, taking the initial download from about 710 kB to about 480 kB.
- Settings, login, the new project sheet and the close confirmations follow the Ledger design: the login shows the app mark, "Herdr" and your pocket tagline above one token field; the new project sheet closes with its X only and offers the agents as chips (the chosen one filled); a close confirmation has a solid red action with a plain Cancel below it; Settings help texts are one line.
- A new version no longer shows a toast over the header. An "Update ready" card appears at the bottom, above the message bar in chat and terminal, with Reload (it shows "Reloading…" while it works) and Later. After Later the card stays away for the session, the settings gear gets a dot and Settings starts with an "Update ready" row; Settings ends with an About row showing the version and whether the app is up to date.
- The chat and terminal screens are redesigned: the header shows the agent's icon, the project name and one status line (Working, Done, Blocked or Shell) with a Chat/Terminal switch under it, and no terminal address. Messages go through one rounded input bar with the attach button inside and a round send button (the separate new-line button is gone; Return still sends or adds a line as set in Settings).
- The key row (Esc, Ctrl, arrows and the rest) appears only while you are typing, and slash commands you send show as small chips. A blocked agent shows its last message in a "Needs attention" card at the end of the chat with an "Open terminal" button, and a closed or lost terminal shows a centered card with Reattach and Back over the dimmed screen.
- The home list is redesigned: a large "Herdr" title that shrinks into the bar as you scroll, flat two-line rows (name and time, then "Working…", the wait for your answer or the last message) with the agent's own icon on a neutral tile, and section headers that count what is working and what needs you. Neovim and Vim sessions show their own icons.
- Rows lose their "…" button: swipe left for Rename and Close, or press and hold for the full menu (open terminal, split, rename, close) with the rest of the list dimmed. Keyboard and screen reader users reach the same menu with each row's "Actions" button.
- A blocked agent is shown by a "Needs attention" card at the top and a red status dot on its row, instead of a red tint and bar; with nothing to show, the home screen is a centred "No projects yet" with a New project button.
- The app now uses the Ledger design: a neutral black-and-white palette (colour only for agent status and destructive actions), Geist as the interface font, rounder cards and fields, and thin borders instead of shadows on sheets, dialogs and menus.

### Fixed

- Typing a space straight into the terminal on iPhone did nothing; the space key now reaches the terminal (Ctrl+Space and Alt+Space are unchanged).
- Error toasts (for example when a layout action fails) were hidden behind the open sheet or dialog; they now show on top of it, and the sheet stays open so you can retry.

## [1.0.0] - 2026-11-02

### Added

- Manage the layout from the phone: a + button on the home screen creates a project (name, folder, machine, and what to start: shell, Claude Code, pi, Codex, opencode or Antigravity), and a "…" menu on every project header and terminal row adds tabs, splits panes right or down, renames, moves projects up or down and closes a pane, tab or project after a confirmation that says how many terminals end. The terminal screen's More menu has the same tab, split and close actions. Errors show as a toast with the reason.
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

- The chat and terminal header shows one state: the agent's status (blocked, working, done) while connected, replaced by "Connecting…" or "Reconnecting…" while not. Settings moved into a "…" menu in that header.
- Shell rows are one line: the last folder of the working directory, or, when a known program runs in the foreground (nvim, vim, htop, less, docker, ssh…), its name with a small glyph in the avatar.
- The notifications line in Settings shows a status dot at the same 13px size as the other statuses.
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

- On a phone, tapping the terminal clears a lingering text selection, and a double or triple tap no longer selects a word or a line.
- Return in the message field now adds a line on the iPhone keyboard in New line mode, and sends in Send mode even when iOS reports the key as part of text composition. Typing in the middle of a message no longer moves the cursor to the end.
- Installed iPhone app: the page no longer extends under the status bar and home indicator (it is not edge-to-edge any more), which removes the blurred strip over the header. Diagnostics now also lists where the terminal screen's parts sit.
- Installed iPhone app: the header is no longer washed out under the status bar; the status bar now has its own colour instead of the page drawing beneath it.
- Installed iPhone app: the empty band under the key bar is gone; the key bar sits right above the home indicator, with the keyboard closed or open.

- The input-mode button in the key bar keeps a fixed name, "Direct typing", so screen readers no longer announce a contradiction.
- Opening the app while the bridge is unreachable (offline, Tailscale off) no longer sends you to the login screen: the app opens the page you asked for, shows "Reconnecting…" and keeps retrying. Only a real "not signed in" answer goes to login.
- Tapping the terminal no longer zooms the page on iOS.
- Swiping on the terminal no longer drags or bounces the page.
- Back from settings returns to the page you came from instead of the terminal list.

[unreleased]: https://github.com/spacecodee/spacee-herdr-frontend/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/spacecodee/spacee-herdr-frontend/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/spacecodee/spacee-herdr-frontend/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/spacecodee/spacee-herdr-frontend/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/spacecodee/spacee-herdr-frontend/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/spacecodee/spacee-herdr-frontend/releases/tag/v1.0.0
