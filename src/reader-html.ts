// Server-rendered reader app shell (renderReaderHtml; script:
// reader-script.ts, styles: reader-styles.ts). The other pages live in
// reader-pair.ts (pairing form) and reader-landing.ts (agent setup, "Add
// me" deep link, offline). Assets in reader-assets.ts; escaping in
// reader-escape.ts. Everything is inline — strict CSP.
// Invariant: ALL interpolated dynamic values pass escapeText/escapeAttr.
//
// Reader UX, ported from openclaw edge-book plugin `vendor/reader-src/src/http.ts`
// (commit f36775a). Differences from source:
//   * No POST /auth/login bootstrap — the host already authenticated via the
//     pairing flow before serving this page.
//   * No x-openclaw-session header — the host identifies the session via
//     HttpOnly cookie.
//   * CSRF is double-submit: a meta tag carries the token; the client sends it
//     as `x-csrf-token` on every mutating request.
//   * No "Local session" copy — relabeled to reflect hosted topology.
// Output of agent-supplied data is escapeHtml'd in-place (carried over from
// the source). The host sets a strict CSP header to bound XSS blast radius.

import { QRCODE_GENERATOR_JS } from "./qrcode-lib.js";
import { READER_SCRIPT } from "./reader-script.js";
import { escapeAttr, escapeText } from "./reader-escape.js";
import { READER_STYLES } from "./reader-styles.js";

export interface ReaderContext {
  csrf_token: string;
  agent_online: boolean;
}

export function renderReaderHtml(ctx: ReaderContext): string {
  const csrfMeta = `<meta name="csrf-token" content="${escapeAttr(ctx.csrf_token)}">`;
  const initialBadge = ctx.agent_online ? "On your device" : "Agent offline";
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${csrfMeta}
  <title>Sanctum</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;450;500;600&display=swap" rel="stylesheet">
  ${READER_STYLES}
</head>
<body>
  <div class="app">
    <header>
      <div class="top-inner">
        <div class="wordmark">
          <svg class="glyph" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect x="5" y="3" width="16" height="20" rx="2.5" stroke="#F2C079" stroke-width="1.8"/>
            <path d="M13 3 V23" stroke="#F2C079" stroke-width="1.8"/>
            <circle cx="13" cy="13" r="2.7" fill="#FFD98A"/>
          </svg>
          Sanctum
        </div>
        <div class="search-wrap">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3 3" stroke="currentColor" stroke-width="1.6"/></svg>
          <input class="search" aria-label="Search your people, posts, messages" placeholder="Search your people, posts, messages">
        </div>
        <div class="bar-right">
          <div class="session-status">
            <span class="status-dot"></span>
            <span id="sessionBadge">${escapeText(initialBadge)}</span>
          </div>
          <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">&#9680; Candlelit</button>
        </div>
      </div>
    </header>
    <div class="page">
    <nav aria-label="Sanctum views">
      <div class="owner-card">
        <div id="ownerAvatar" class="avatar">EB</div>
        <div>
          <div id="ownerName" class="owner-name">Connecting...</div>
          <div id="ownerShort" class="owner-id">your sanctum</div>
        </div>
      </div>
      <button data-view="profile">&#9782; Profile <span id="profileCount">Owner</span></button>
      <button data-view="feed" class="active">&#8962; Feed <span id="feedCount">Visible 0</span></button>
      <button data-view="shared">Shared with me <span id="sharedCount">Shared 0</span></button>
      <button data-view="contacts">&#9728; People <span id="contactCount">Friends 0</span></button>
      <button data-view="add">+ Add me <span>Invite</span></button>
      <button data-view="messages">&#9993; Messages <span id="messageCount">Total 0</span></button>
      <button data-view="posts">&#9998; Posts <span id="postCount">Drafts 0</span></button>
      <button data-view="approvals">Approvals <span id="approvalCount">Pending 0</span></button>
      <button data-view="activity">History <span id="activityCount">Events 0</span></button>
      <button data-view="inspector">Inspector <span>Details</span></button>
      <form method="POST" action="/auth/logout" style="margin-top:12px">
        <input type="hidden" name="csrf" value="${escapeAttr(ctx.csrf_token)}">
        <button type="submit" class="signout-btn">Sign out</button>
      </form>
      <div class="nav-foot">Everything here lives on your device, under your keys. Nothing is shared unless you choose to.</div>
    </nav>
    <main>
      <!-- summary-grid is hidden by CSS (display:none) but kept so JS setText calls don't error -->
      <section id="summaryGrid" class="summary-grid" aria-hidden="true" style="display:none">
        <div class="summary-card active"><div class="summary-label">Visible feed</div><div id="summaryFeed" class="summary-value">0</div></div>
        <div class="summary-card"><div class="summary-label">Friends</div><div id="summaryFriends" class="summary-value">0</div></div>
        <div class="summary-card"><div class="summary-label">Messages</div><div id="summaryMessages" class="summary-value">0</div></div>
        <div class="summary-card warn"><div class="summary-label">Pending approvals</div><div id="summaryApprovals" class="summary-value">0</div></div>
        <div class="summary-card"><div class="summary-label">Drafts and pending posts</div><div id="summaryDrafts" class="summary-value">0</div></div>
      </section>
      <div class="toolbar">
        <div>
          <h2 id="viewTitle">Feed</h2>
          <div id="viewCopy" class="view-copy">Relationship-gated updates with delivery and provenance context.</div>
        </div>
        <span id="viewState" class="badge">Loading</span>
      </div>
      <section id="content" class="list">
        <div class="loading">Loading your sanctum...</div>
      </section>
    </main>
    <aside class="rail">
      <!-- Consumer rail: calm attention + people cards -->
      <div id="calmRail">
        <div class="rail-card" id="attentionCard">
          <h3 class="rail-card-title">Nothing needs you</h3>
          <div class="rail-card-lede">When something wants your attention, it&rsquo;ll show up here. Right now you&rsquo;re clear.</div>
          <div class="calm-row"><span class="calm-tick"></span> No approvals waiting</div>
          <div class="calm-row"><span class="calm-tick"></span> No one blocked or pending</div>
        </div>
        <div class="rail-card" id="peopleCard">
          <h3 class="rail-card-title">Your people</h3>
          <div class="rail-card-lede" id="peopleCount">0 in your sanctum</div>
          <div class="friends-list" id="friendsList"></div>
        </div>
        <div class="rail-note">No ads. No feed algorithm.<br>Your graph isn&rsquo;t for sale. <b>It&rsquo;s yours.</b></div>
      </div>
      <!-- Developer / owner view — hidden by default, toggled via devToggle button -->
      <div id="devRail" style="display:none">
        <div class="module">
          <h2>Owner Console</h2>
          <div id="owner" class="owner-id">Connecting to your agent...</div>
        </div>
        <div class="module">
          <h2>Attention Queue</h2>
          <div id="attentionQueue" class="queue">
            <div class="queue-row"><strong>Loading</strong><span class="badge">Hosted</span></div>
          </div>
        </div>
        <div class="module">
          <h2>Recent Activity</h2>
          <div id="activityRail" class="activity-list">
            <div class="activity-row"><div class="activity-type">Loading</div><div class="activity-note">Local audit trail</div></div>
          </div>
        </div>
        <div class="toolbar">
          <h2>Inspector</h2>
          <span class="badge">Inspect</span>
        </div>
        <div id="inspectorSummary" class="detail-panel">
          <div class="detail-title">No object selected</div>
          <div class="view-copy">Click a feed item, contact, message, post, or approval to inspect decision context.</div>
        </div>
        <pre id="inspector">Select an item to inspect source basis, visibility, grants, approvals, and audit refs.</pre>
        <div class="module" style="margin-top:10px">
          <h2>Privacy</h2>
          <div class="view-copy">Data is <strong>owned at rest</strong> in your agent&rsquo;s filesystem. Traffic <strong>transits this host</strong>, which terminates TLS &mdash; organizer-readable in transit. No end-to-end claim. Avoid sharing secrets.</div>
        </div>
      </div>
      <!-- Dev toggle (small, tucked at bottom of rail) -->
      <button class="dev-toggle" id="devToggle">Developer view</button>
    </aside>
    </div>
  </div>
  <script>${QRCODE_GENERATOR_JS}</script>
  ${READER_SCRIPT}
</body>
</html>`;
}
