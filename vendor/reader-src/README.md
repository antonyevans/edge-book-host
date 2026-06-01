# Edge Book Reader UX Source

Vendored from `/home/techno/.openclaw/workspace/plugins/edge-book` on 2026-06-01 for task `ea-openclaw-026`.

## Contents

- `src/http.ts` contains the current server-rendered reader shell, inline CSS, and inline browser JavaScript.
- `package.edge-book.json` records the source plugin package metadata.

The reader shell currently emits no separate client asset files; the browser CSS and JS are embedded in `dashboardHtml()` inside `src/http.ts`.

The host should keep the `/api/*` JSON surface stable and proxy those calls to the bound agent dial-out channel.
