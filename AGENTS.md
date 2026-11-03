
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Never inline templates or styles: no `template:` or `styles:` in `@Component`. Markup lives in the component's `.html` (`templateUrl`), component styles in its `.css` (`styleUrl`), logic in its `.ts`.
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- Template and style paths are relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection

## Project context (read before any work)

**What this is.** `spacee-herdr` is a web client (installable PWA) to use herdr-core terminals from a phone. The Herdr TUI worked great on mobile over SSH; the new Herdr desktop app is a native GPU window (Rust) that cannot run on a phone, and there is no mobile app. The owner uses an iPhone and does not want a paid Apple developer account, so the answer is a PWA reached over Tailscale.
It is only a client for machines that already run herdr-core (`hc`), such as a Linux box. It does not replace the desktop app. Herdr mods and layouts are JavaScript inside the native window and are unrelated to this project.

**Architecture**
```
iPhone (Safari/PWA) --https/wss via tailscale serve--> spacee-herdr-bridge (Go) --Unix socket--> herdr-core (hc) --ssh--> other machines
```
- `spacee-herdr-frontend`: Angular PWA (Tailwind, Spartan UI, xterm.js). No SSR.
- `spacee-herdr-bridge`: Go. Copies bytes between a WebSocket and core's socket, checks the token, and serves the embedded frontend build. No business logic, no database.
- `hc` (herdr-core, repo https://github.com/herdrdev/herdr-core): keeps terminals alive and draws nothing. `hc machine add <ssh-host>` makes one core list the terminals of other machines, so the bridge talks to a single core and new devices need no app change.
- The bridge runs on the same machine as the core it talks to. Do not deploy it to Dokploy or any public host.

**Protocol facts** (check `hc schema`; the API is preview 0.x, additive only)
- Plain mode: JSON-RPC 2.0, one message per line. `hello {"framed":true}` switches to framed mode: `[channel u32 LE][kind u8][len u32 LE][payload]`, kinds DATA 0, CREDIT 1, CLOSE 2, RESIZE 3, FOCUS 4, FACTS 5.
- `terminal.attach` returns a channel carrying the first paint, then raw program output; keys go back as DATA. Flow control: 256 KiB initial credit; the viewer sends CREDIT. `events.subscribe` streams status events.
- Methods: `terminal.{list,get,run,attach,send,keys,read,kill,...}`, `machine.*`, `events.subscribe`, `server.status`, `doc.get/doc.set`, `rpc.discover`.
- The API has no spaces/tabs/splits methods; those may live behind `doc.get/doc.set` (unverified). Agent status (working, blocked, done, idle) comes from the program via OSC 7501.

**Security.** Core has no authentication: whoever reaches its socket has a shell. The bridge must listen only on loopback or the tailnet, require a token, and check the WebSocket `Origin`. Never log tokens or terminal data.

**Decisions already made.** No SSR. Go for the bridge, standard library first. No Spring or other backend. pnpm for the frontend. Frontend build is embedded into the bridge binary.

**MVP scope, in order**
1. List terminals grouped by machine, with agent status, live via `events.subscribe`.
2. Attach to a terminal with xterm.js: output, input, resize.
3. Mobile key bar (Esc, Ctrl, Tab, arrows).
4. Reconnect and re-attach when iOS suspends the tab.
Later: PWA install, push notifications when an agent is blocked, spaces/tabs via `doc.get`.
Out of scope: user accounts, multi-tenant, public hosting, desktop mods.

**Status.** MVP step 1 done: the bridge has token login (`/api/session`, HttpOnly cookie) and `/ws`, an authenticated raw byte pipe to core's socket; the frontend speaks the hc framed protocol itself (`src/app/hc/`) and shows the live terminal list. Step 2 done: `/t/:address` attaches with xterm.js 6 (WebGL, fit, unicode11): output with CREDIT after xterm writes, input (64 KiB DATA chunks), RESIZE, FOCUS, exit/reattach banners. Step 3 done: key bar under the terminal (Esc, Tab, one-shot Ctrl, arrows honoring DECCKM; buttons keep focus on xterm so the iOS keyboard stays open). Theme follows the system light/dark scheme (app and xterm palettes), `/settings` sets terminal text size and scroll speed (localStorage), touch drags scroll the terminal (xterm scrollSensitivity), bundled JetBrainsMono Nerd Font Mono (public/fonts) for p10k icons. Step 4 done: HcClient reconnects with backoff (pauses while hidden, probes on resume for dead-but-open sockets, 401 -> login); the list resubscribes and the terminal view re-attaches automatically. MVP complete. PWA done: installable (manifest, icons, iOS metas), Angular service worker caches only the app shell and fonts (never /api or /ws), update toast; bridge unreachable keeps the route and shows Reconnecting… (only 401 goes to login). Compose bar (default input: textarea with iOS autocorrect, per-terminal history chips, direct-typing toggle). Web Push: bridge watches core and pushes blocked/done/finished/lost. Spaces: list is Space > Tab > terminals from the herdr-app doc (doc.get, reloaded on doc events). Push enable/disable/test in Settings (installed app only on iOS). Compose drafts persist per terminal; Return key setting (send/newline); images attach or paste, downscaled client-side, uploaded to /api/upload, path inserted for agents. Chat view: agent terminals open as a chat (Spartan message/bubble/message-scroller/trace, markdown via marked+DOMPurify) fed by /api/chat SSE (bridge reads Claude Code, pi, Codex transcripts read-only); Terminal mode one tap away. Home is a conversations list (/api/chat/summaries: title, last message preview; Needs attention strip; search; grouped by herdr space in desktop tab order, agents as conversation rows and shells as compact rows; unplaced terminals per machine). opencode supported via read-only SQLite (modernc.org/sqlite); agy not supported (binary payload). Layout management from the phone: /api/layout (space, tab, split, rename, move with 0-based index, confirmed close) edits the herdr-app doc via doc.get/doc.set and starts labeled terminals, works with the desktop window closed. Next (later): terminal size when another viewer (desktop) is larger (nvim shows only the left part), push when an agent is blocked, spaces/tabs via doc.get.

**Repo layout.** Two sibling repos in one parent folder: `spacee-herdr-bridge/` and `spacee-herdr-frontend/`. Nothing lives in the parent folder. The orchestrator (in the bridge) can read both; each project keeps its own agent templates in `agents/`.

## Spartan UI (always use the spartan MCP)

The `spartan-ui` MCP server (`@spartan-ng/mcp`) is available to agents. Use it before writing or changing any UI with Spartan components; do not guess APIs from memory.
- Find components with `spartan_components_list`; read one with `spartan_components_get` (`extract: "api"` for inputs/outputs, `extract: "code"` for a working example). Page patterns: `spartan_blocks_list` / `spartan_blocks_get`.
- Before adding a component, check `spartan_components_dependencies` and whether it already exists in `libs/ui` (import alias `@spartan-ng/helm/...`, see `components.json`). Add missing ones with the spartan CLI (`pnpm ng g @spartan-ng/cli:ui`), not by hand.
- Run `spartan_accessibility_check` on the components you used.
- Compose Brain (behavior) + Helm (styles) as the docs show; style with Tailwind tokens from `src/styles.css`, not ad hoc colors.

## Plans and specs

Plans and task specs for this repo live in it, local only (`docs/superpowers/` is gitignored; never commit it, never write absolute home paths): `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` and `docs/superpowers/specs/YYYY-MM-DD-<task>.md`. Never in `tmp/` (`tmp/specs` is only a symlink kept for old pointers; Figma scripts and images stay in `tmp/figma`).

## Changelog

Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog 1.1.0: Added, Changed, Deprecated, Removed, Fixed, Security; plain English, no file lists) in the same commit.

## Files and structure (always `ng generate`)

Create every Angular artifact with the Angular CLI, never by hand: `pnpm ng generate <schematic> <path>`.
- Component: `pnpm ng g component features/<name>` creates its own folder with `<name>.ts`, `<name>.html`, `<name>.css` and `<name>.spec.ts`.
- Service: `pnpm ng g service core/<area>/<name>`. Guard: `pnpm ng g guard core/<area>/<name> --functional`. Also `interceptor`, `pipe`, `directive`, `interface`, `enum` as needed.
- Spartan helm components: the spartan CLI (see below), into `libs/ui`.
- Plain TypeScript with no Angular artifact (pure functions, protocol codecs, types) goes in its own file in the area folder, with a `.spec.ts` beside it.

One responsibility per file, each file used for its own job:
- `.ts`: class, signals, logic. No markup, no CSS.
- `.html`: all markup, Angular control flow, Tailwind classes.
- `.css`: only styles Tailwind cannot express cleanly (host layout, xterm overrides, keyframes). Leave it empty rather than moving markup or logic into it; never put inline `style` strings in the `.ts`.
- `.spec.ts`: tests for that file, beside it.

Layout:
```
src/app/
  app.ts|html|css|spec.ts, app.config.ts, app.routes.ts
  core/<area>/     services, guards, protocol code shared by features (core/hc, core/session)
  features/<name>/ one folder per routed screen or feature component (login, terminal-list, terminal-view)
libs/ui/           spartan helm components (generated)
```

## Frontend rules

- Browser only: no SSR, no Node APIs.
- Mobile first (iPhone Safari/PWA): safe-area insets, 44px touch targets, key bar, reconnect on resume.
- Terminal bytes go to xterm.js untouched; do not parse or store them. Use the WebGL renderer when available.
- The bridge is same-origin (`/api/session`, `/ws`); the token is entered once at login and kept only as the bridge's HttpOnly cookie. No build-time URLs or secrets.
- Protocol types follow `hc schema`; notes: https://github.com/herdrdev/herdr-core/blob/main/schema/README.md
- Production build: `pnpm build` (output `dist/spacee-herdr-frontend/browser`), copied into `../spacee-herdr-bridge/internal/webui/dist`.

## Agents

Claude Code reads this file through `CLAUDE.md`.
The implementer for this repo is a Claude Code pane the owner already runs in herdr ("Implementer - F"). The orchestrator (pi, in the bridge pane) delegates to it with `hc send`; do not start new agents.
An implementer does one scoped change per task, edits only the files named, writes tests first, runs `pnpm build` and `pnpm test`, and reports with `hc send <orchestrator address>`: what changed, proof, open risks.
`agents/frontend-implementer.md` is the equivalent hc template, kept for `hc run` use.
