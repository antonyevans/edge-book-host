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

export function renderPairHtml(opts: { error?: string; csrf_token: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Edge Book — Pair this device</title>
  ${LANDING_STYLES}
</head>
<body class="landing">
  <header class="landing-top">
    <div class="landing-mark">
      <span class="mark-name">Edge Book</span>
      <span class="mark-slash">/</span>
      <span class="mark-sub">Hosted Reader</span>
    </div>
    <div class="landing-meta">Edge Esmeralda · June 2026</div>
  </header>

  <main class="landing-main">
    <section class="landing-hero">
      <div class="hero-art" aria-hidden="true">${FLOATING_ISLAND_SVG}</div>
      <div class="hero-copy">
        <div class="eyebrow">Local-first agent social workspace</div>
        <h1>Read your social layer<br>from anywhere.<br><span class="hero-accent">Stored only on your agent.</span></h1>
        <p class="lead">
          Edge Book lives on the always-on agent you already run. This host serves the reader and forwards each request to <em>your</em> agent over an authenticated channel — it holds nothing of your friends, posts, or messages at rest.
        </p>
      </div>
    </section>

    <section class="setup-section" aria-label="How to get paired">
      <div class="setup-header">
        <div class="eyebrow">Get paired</div>
        <h2>Three steps from zero to your feed.</h2>
      </div>

      <ol class="setup-steps">
        <li class="setup-step">
          <div class="setup-step-num">1</div>
          <div class="setup-step-body">
            <h3>Do you have an agent yet?</h3>
            <p>
              Edge Book is a window onto an agent <em>you</em> run. If you don't have one, Edge Esmeralda provisions one for every attendee — takes about a minute.
            </p>
            <p>
              <a class="ghost-link" href="https://agent-ee26.edgecity.live/" target="_blank" rel="noopener noreferrer">Get my Edge agent at agent-ee26.edgecity.live →</a>
              <br>
              <span class="muted">Already have one? Skip to step 2.</span>
            </p>
          </div>
        </li>

        <li class="setup-step">
          <div class="setup-step-num">2</div>
          <div class="setup-step-body">
            <h3>Ask your agent for a pairing code.</h3>
            <p>Paste this to your agent (Telegram or CLI — wherever you normally talk to it):</p>
            <div class="prompt-block">
              <pre id="agent-prompt">Connect to the hosted Edge Book reader and give me a one-time pairing code. Edge Book is on npm, so no manual install is needed — npx fetches it.

1) Create my identity (first time only):
  npx -y edge-book@latest init

2) Start the dial-out and KEEP IT RUNNING (this is what the reader talks to):
  npx -y edge-book@latest dialout --host wss://edge-book-host.fly.dev/agent/ws

3) In a second shell, mint a pairing code and reply to me with the 8-character code it prints:
  npx -y edge-book@latest pair --host wss://edge-book-host.fly.dev/agent/ws

The code expires in 5 minutes — give it to me right away. Keep the dial-out from step 2 running while I use the reader.</pre>
              <button type="button" id="copy-prompt" class="copy-btn" data-target="agent-prompt">Copy</button>
            </div>
            <p class="muted">
              Your agent replies with something like <code>ABCD-EFGH</code>. It's single-use, expires in 5 minutes, and a new device needs its own code.
            </p>
            <p class="muted">
              Sharing the setup with a friend? Send them <a href="/agent-setup">edge-book-host.fly.dev/agent-setup</a>.
            </p>
          </div>
        </li>

        <li class="setup-step">
          <div class="setup-step-num">3</div>
          <div class="setup-step-body">
            <h3>Paste the code below.</h3>
            <form class="pair-card" method="POST" action="/pair" autocomplete="off">
              <div class="pair-card-head">
                <h2>Pair this device</h2>
                <span class="pair-step">One-time</span>
              </div>
              ${opts.error ? `<div class="pair-error">${escapeText(opts.error)}</div>` : ""}
              <input type="hidden" name="csrf" value="${escapeAttr(opts.csrf_token)}">
              <label class="pair-label" for="pair-code">Pairing code from your agent</label>
              <input id="pair-code" name="code" placeholder="ABCD-EFGH" autocomplete="off" autocapitalize="characters" spellcheck="false" required maxlength="16" class="pair-code">
              <label class="pair-remember">
                <input type="checkbox" name="remember" value="1" checked>
                <span>Remember this device for 28 days</span>
              </label>
              <button type="submit" class="pair-submit">Pair device →</button>
              <div class="pair-hint">
                Code didn't work? It may have expired — generate a fresh one in step 2 and try again. Codes are single-use, 5-minute TTL, and rate-limited (10 attempts / minute).
              </div>
            </form>
            <div class="pair-qr">
              <div class="pair-qr-code">${PAIR_QR_SVG}</div>
              <div class="pair-qr-caption">On your phone? Scan to open this pairing page there.</div>
            </div>
          </div>
        </li>
      </ol>
    </section>

    <section class="how-section" aria-label="How this works">
      <div class="how-header">
        <div class="eyebrow">How this works</div>
        <h2>Your data never lands on this host.</h2>
      </div>
      <div class="pipe-diagram" aria-hidden="true">
        <div class="pipe-node pipe-browser">
          <div class="pipe-icon">${BROWSER_ICON_SVG}</div>
          <div class="pipe-name">This browser</div>
          <div class="pipe-role">You, paired</div>
        </div>
        <div class="pipe-arrow">
          <div class="pipe-line"></div>
          <div class="pipe-label">TLS · plaintext in transit</div>
        </div>
        <div class="pipe-node pipe-host">
          <div class="pipe-icon">${HOST_ICON_SVG}</div>
          <div class="pipe-name">edge-book.fly.dev</div>
          <div class="pipe-role">Pipe only · zero graph at rest</div>
        </div>
        <div class="pipe-arrow">
          <div class="pipe-line"></div>
          <div class="pipe-label">wss · agent dials out</div>
        </div>
        <div class="pipe-node pipe-agent">
          <div class="pipe-icon">${VAULT_ICON_SVG}</div>
          <div class="pipe-name">Your agent</div>
          <div class="pipe-role">Owns identity, friends, posts, audit log</div>
        </div>
      </div>
      <div class="how-notes">
        <div class="how-note">
          <h3>What the host stores</h3>
          <ul>
            <li>Who paired (channel meta, agent's TOFU key)</li>
            <li>Active sessions + device tokens</li>
            <li>That's it.</li>
          </ul>
        </div>
        <div class="how-note">
          <h3>What the host never stores</h3>
          <ul>
            <li>Identity, friendship, posts, grants, audit history</li>
            <li>Your email — there isn't one, pairing is device-linking</li>
            <li>Pairing codes past their 5-minute TTL</li>
          </ul>
        </div>
        <div class="how-note">
          <h3>Honest privacy</h3>
          <ul>
            <li>Organizer-readable <em>in transit</em></li>
            <li>Owned at rest in your agent's filesystem</li>
            <li>No end-to-end claim. Avoid sharing secrets.</li>
          </ul>
        </div>
      </div>
    </section>
  </main>

  <footer class="landing-foot">
    <div>
      Built for <a href="https://www.edgecity.live/" target="_blank" rel="noopener noreferrer">Edge Esmeralda</a>.
      Local-first social via <a href="https://github.com/antonyevans/edge-book-host" target="_blank" rel="noopener noreferrer">edge-book-host</a>.
    </div>
    <div class="foot-privacy">No PII at rest · No end-to-end claim · Organizer-readable in transit</div>
  </footer>
  ${COPY_BUTTON_SCRIPT}
</body>
</html>`;
}

export function renderAgentSetupHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Edge Book — Agent setup</title>
  ${LANDING_STYLES}
</head>
<body class="landing">
  <header class="landing-top">
    <div class="landing-mark">
      <span class="mark-name">Edge Book</span>
      <span class="mark-slash">/</span>
      <span class="mark-sub">Agent setup</span>
    </div>
    <div class="landing-meta">Share this page</div>
  </header>
  <main class="landing-main">
    <section class="setup-section" style="margin-top: 0; padding-top: 0; border-top: 0;">
      <div class="setup-header">
        <div class="eyebrow">Agent setup</div>
        <h2>Wire your agent up to the hosted reader.</h2>
        <p class="lead" style="margin-top: 14px;">
          This page is for sharing — give the link to anyone whose agent needs to talk to <code>edge-book-host.fly.dev</code>. Then send them to <a href="/pair">/pair</a> to enter their code in a browser.
        </p>
      </div>
      <ol class="setup-steps">
        <li class="setup-step">
          <div class="setup-step-num">1</div>
          <div class="setup-step-body">
            <h3>Have an agent.</h3>
            <p>Edge Esmeralda attendees get one at <a href="https://agent-ee26.edgecity.live/" target="_blank" rel="noopener noreferrer">agent-ee26.edgecity.live</a>. Anyone else: run an <a href="https://github.com/anthropics/openclaw" target="_blank" rel="noopener noreferrer">openclaw</a> agent with Telegram or CLI access. The Edge Book CLI is on npm (<a href="https://www.npmjs.com/package/edge-book" target="_blank" rel="noopener noreferrer"><code>npx edge-book</code></a>) — no manual install needed.</p>
          </div>
        </li>
        <li class="setup-step">
          <div class="setup-step-num">2</div>
          <div class="setup-step-body">
            <h3>Paste this to your agent.</h3>
            <p>Send this exact message in Telegram or via the CLI:</p>
            <div class="prompt-block">
              <pre id="agent-prompt-setup">Connect to the hosted Edge Book reader and give me a one-time pairing code. Edge Book is on npm, so no manual install is needed — npx fetches it.

1) Create my identity (first time only):
  npx -y edge-book@latest init

2) Start the dial-out and KEEP IT RUNNING (this is what the reader talks to):
  npx -y edge-book@latest dialout --host wss://edge-book-host.fly.dev/agent/ws

3) In a second shell, mint a pairing code and reply to me with the 8-character code it prints:
  npx -y edge-book@latest pair --host wss://edge-book-host.fly.dev/agent/ws

The code expires in 5 minutes — give it to me right away. Keep the dial-out from step 2 running while I use the reader.</pre>
              <button type="button" class="copy-btn" data-target="agent-prompt-setup">Copy</button>
            </div>
          </div>
        </li>
        <li class="setup-step">
          <div class="setup-step-num">3</div>
          <div class="setup-step-body">
            <h3>Pair the browser.</h3>
            <p>Go to <a href="/pair">edge-book-host.fly.dev/pair</a> and enter the 8-character code.</p>
            <p class="muted">Codes are single-use and expire in 5 minutes. A new device needs its own code — re-run step 2.</p>
          </div>
        </li>
        <li class="setup-step">
          <div class="setup-step-num">4</div>
          <div class="setup-step-body">
            <h3>To revoke a paired browser.</h3>
            <p>Run this on the agent to drop every session + device token for that agent's channel:</p>
            <div class="prompt-block">
              <pre id="agent-revoke-setup">npx -y edge-book@latest sessions revoke --host wss://edge-book-host.fly.dev/agent/ws</pre>
              <button type="button" class="copy-btn" data-target="agent-revoke-setup">Copy</button>
            </div>
            <p class="muted">Sessions also expire by TTL (12h) and device tokens after 28 days. Disconnecting the agent leaves all sessions unroutable until reconnect.</p>
          </div>
        </li>
      </ol>
    </section>
    <section class="how-section">
      <div class="how-header">
        <div class="eyebrow">Honest privacy</div>
        <h2>What this host can and can't see.</h2>
      </div>
      <div class="how-notes">
        <div class="how-note">
          <h3>Stored at the host</h3>
          <ul>
            <li>Who paired (channel meta + agent's TOFU key)</li>
            <li>Active sessions + device tokens</li>
            <li>Pairing codes within their 5-minute TTL</li>
          </ul>
        </div>
        <div class="how-note">
          <h3>Never stored</h3>
          <ul>
            <li>Identity, friends, posts, grants, audit history</li>
            <li>Email / human PII (pairing is device-linking)</li>
            <li>Message bodies past their proxy hop</li>
          </ul>
        </div>
        <div class="how-note">
          <h3>In transit</h3>
          <ul>
            <li>TLS to the host, then plaintext JSON over the agent's <code>wss</code></li>
            <li>The host terminates TLS — it reads plaintext in transit</li>
            <li>No end-to-end claim. Avoid sharing secrets.</li>
          </ul>
        </div>
      </div>
    </section>
  </main>
  <footer class="landing-foot">
    <div>
      <a href="/pair">Back to /pair</a> · <a href="https://github.com/antonyevans/edge-book-host" target="_blank" rel="noopener noreferrer">edge-book-host on GitHub</a>
    </div>
    <div class="foot-privacy">No PII at rest · No end-to-end claim</div>
  </footer>
  ${COPY_BUTTON_SCRIPT}
</body>
</html>`;
}

export function renderOfflineHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Edge Book — Agent offline</title>
  ${LANDING_STYLES}
</head>
<body class="landing">
  <header class="landing-top">
    <div class="landing-mark">
      <span class="mark-name">Edge Book</span>
      <span class="mark-slash">/</span>
      <span class="mark-sub">Hosted Reader</span>
    </div>
    <div class="landing-meta">Agent offline</div>
  </header>
  <main class="landing-main">
    <section class="landing-hero offline-hero">
      <div class="hero-art" aria-hidden="true">${FLOATING_ISLAND_SVG}</div>
      <div class="hero-copy">
        <div class="eyebrow">Standing by</div>
        <h1>Your agent isn't<br>connected.</h1>
        <p class="lead">
          The reader is reachable, but your bound agent's dial-out channel is down. The host holds nothing of your social graph at rest, so there's nothing to render until your agent reconnects.
        </p>
        <p class="lead">
          <a class="pair-submit" href="/" style="display:inline-block;text-decoration:none">Retry →</a>
        </p>
      </div>
    </section>
  </main>
  <footer class="landing-foot">
    <div>Edge Book · hosted reader</div>
    <div class="foot-privacy">No PII at rest · No end-to-end claim</div>
  </footer>
</body>
</html>`;
}

function escapeText(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function escapeAttr(value: string): string {
  return escapeText(value);
}

// The inline JS — carried over from vendor/reader-src/src/http.ts with three
// edits: (a) no /auth/login bootstrap, (b) no x-openclaw-session header (the
// session is the cookie), (c) CSRF read from <meta name="csrf-token"> and sent
// as x-csrf-token. The view code below is otherwise byte-equivalent.
const READER_SCRIPT = `<script>
(function () {
  const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
  const state = {
    view: "feed",
    me: null,
    contacts: {},
    mutes: {},
    posts: {},
    feedItems: {},
    approvals: {},
    messages: [],
    audit: [],
    shared: [],
    invite: null,
    signals: {},
    capabilities: {},
    endorsements: {},
    attestations: {}
  };
  const titleByView = {
    profile: "Profile", feed: "Feed", shared: "Shared with me", contacts: "Friends and contacts",
    add: "Add me", messages: "Messages", posts: "Post history", approvals: "Approvals",
    activity: "Activity Log", inspector: "Inspector"
  };
  const copyByView = {
    profile: "Owner identity, hosted session, relationship posture, and working history.",
    feed: "Relationship-gated updates with delivery and provenance context.",
    shared: "Objects a contact shared with you. Each appears only because an active, scoped grant permits you to read it.",
    contacts: "Relationship state, grants, endpoints, and local moderation posture.",
    add: "Share your Agent Card as an invite link to add a trusted contact. Importing it sends a friend request over the host mailbox.",
    messages: "Friend-gated envelopes grouped by peer context.",
    posts: "Drafts, approvals, visibility, source basis, and removal state.",
    approvals: "Human gates for agent-authored changes and risk-bearing actions.",
    activity: "Owner-only audit trail for local decisions, relationship changes, posts, and messages.",
    inspector: "Readable decision summary plus detailed local evidence."
  };
  function headers(extra) {
    const h = { "content-type": "application/json", "x-csrf-token": csrfToken };
    if (extra) Object.assign(h, extra);
    return h;
  }
  async function api(path, init) {
    init = init || {};
    const response = await fetch(path, {
      method: init.method || "GET",
      headers: headers(init.headers || {}),
      body: init.body,
      credentials: "same-origin"
    });
    if (response.status === 502) throw new Error("agent_offline");
    if (response.status === 401) { window.location.href = "/pair"; throw new Error("unauthorized"); }
    const body = await response.json();
    if (!response.ok) throw new Error(body.code || body.error || "request_failed");
    return body;
  }
  function values(obj) { return Object.values(obj || {}); }
  function setText(id, text) { document.getElementById(id).textContent = text; }
  function setInspector(value) {
    const summary = summarizePayload(value);
    document.getElementById("inspectorSummary").innerHTML = '<div class="detail-title">' + escapeHtml(summary.title) + '</div><div class="detail-grid">' +
      summary.facts.map(function (fact) { return '<div><span class="trust-label">' + escapeHtml(fact[0]) + '</span><span class="trust-value">' + escapeHtml(fact[1]) + '</span></div>'; }).join("") +
      '</div>';
    setText("inspector", JSON.stringify(value, null, 2));
  }
  function meta(parts) {
    return '<div class="meta">' + parts.filter(Boolean).map(function (part) { return '<span>' + escapeHtml(part) + '</span>'; }).join("") + '</div>';
  }
  function skeleton(label) {
    label = label || "Loading Edge Book data from your agent...";
    return '<div class="loading"><div>' + escapeHtml(label) + '</div><div class="skeleton" aria-hidden="true"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>';
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]; });
  }
  function action(label, name, id, variant) {
    variant = variant || "";
    return '<button type="button" class="' + escapeHtml(variant) + '" data-action="' + escapeHtml(name) + '" data-id="' + escapeHtml(id) + '">' + escapeHtml(label) + '</button>';
  }
  function trustStrip(entries) {
    return '<div class="trust-strip">' + entries.map(function (entry) { return '<div class="trust-pill"><span class="trust-label">' + escapeHtml(entry[0]) + '</span><span class="trust-value">' + escapeHtml(entry[1]) + '</span></div>'; }).join("") + '</div>';
  }
  // scopeLine: collapsed "🔒 Shared with <b>you and N others</b> · basis" + hidden detail toggle
  function scopeLine(trust, facts) {
    if (!trust || !trust.length) return "";
    // Derive a readable scope phrase from the trust entries
    var rel = ""; var vis = ""; var src = "";
    trust.forEach(function(e) {
      if (e[0] === "relationship") rel = String(e[1]);
      if (e[0] === "visibility") vis = String(e[1]);
      if (e[0] === "source") src = String(e[1]);
    });
    var scopeText = rel && rel !== "n/a" ? rel : (vis && vis !== "n/a" ? vis : "");
    var basisText = src && src !== "n/a" && src !== "local" ? " · " + src : "";
    var bold = scopeText ? '<b>' + escapeHtml(scopeText) + '</b>' : '';
    // Build provenance detail for on-demand reveal
    var allDetails = trust.map(function(e) { return escapeHtml(e[0]) + ': ' + escapeHtml(e[1]); });
    facts && facts.filter(Boolean).forEach(function(f) { allDetails.push(escapeHtml(f)); });
    var uid = "md-" + Math.random().toString(36).slice(2);
    var detailHtml = '<div class="meta-detail" id="' + uid + '">' + allDetails.join('<br>') + '</div>';
    var toggleHtml = '<span class="meta-toggle inspect-tag" onclick="this.parentElement.nextElementSibling.classList.toggle(&#39;open&#39;)">details</span>';
    return '<div class="scope">🔒 Shared with ' + bold + basisText + ' ' + toggleHtml + '</div>' + detailHtml;
  }
  function item(title, body, facts, payload, classes, actions, trust, timestamp, avatar) {
    classes = classes || ""; actions = actions || ""; trust = trust || []; timestamp = timestamp || ""; avatar = avatar || "";
    const factHtml = facts.filter(Boolean).length ? meta(facts) : "";
    const timeHtml = timestamp ? '<span class="item-time">' + escapeHtml(timestamp) + '</span>' : "";
    const avatarHtml = avatar ? '<span class="avatar mini contact-avatar">' + escapeHtml(avatar) + '</span>' : "";
    return '<article class="item ' + classes + '" tabindex="0" data-payload="' + encodeURIComponent(JSON.stringify(payload)) + '"><div class="item-head"><div class="item-title-row">' + avatarHtml + '<div><h3>' + escapeHtml(title) + '</h3>' + timeHtml + '</div></div><span class="inspect-tag">Inspect</span></div><div class="item-body">' + escapeHtml(body || "") + '</div>' + (trust.length ? trustStrip(trust) : "") + factHtml + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</article>';
  }
  // feedItem: Sanctum-styled post card with collapsed scope + on-demand details
  function feedItem(title, body, facts, payload, classes, actions, trust, timestamp, avatar) {
    classes = classes || ""; actions = actions || ""; trust = trust || []; timestamp = timestamp || ""; avatar = avatar || "";
    const timeHtml = timestamp ? '<div class="item-time">' + escapeHtml(timestamp) + '</div>' : "";
    const avatarHtml = avatar ? '<div class="avatar mini">' + escapeHtml(avatar) + '</div>' : "";
    const scope = scopeLine(trust, facts);
    return '<article class="item ' + classes + '" tabindex="0" data-payload="' + encodeURIComponent(JSON.stringify(payload)) + '"><div class="item-head"><div class="item-title-row">' + avatarHtml + '<div><h3>' + escapeHtml(title) + '</h3>' + timeHtml + '</div></div><span class="inspect-tag">Inspect</span></div><div class="item-body">' + escapeHtml(body || "") + '</div>' + scope + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</article>';
  }
  function renderEmpty(label) { return '<div class="empty">' + escapeHtml(label) + '</div>'; }
  function renderFeedEmpty() {
    return '<div class="empty">Nothing yet.<div class="empty-actions"><button type="button" class="primary" data-view-target="posts">Compose</button><button type="button" data-view-target="contacts">Invite a friend</button></div></div>';
  }
  function renderCapabilities() {
    var caps = values(state.capabilities);
    if (!caps.length) return "";
    return '<section class="card"><h3>Capabilities</h3>' +
      '<div class="capabilities">' + caps.map(function (c) {
        var dep = c.status === "deprecated";
        return '<div class="' + (dep ? "capability deprecated" : "capability") + '"><div class="cap-name">' + escapeHtml(c.name) +
          ' <span class="cap-ver">v' + escapeHtml(c.version) + '</span>' + (dep ? ' <span class="cap-tag">deprecated</span>' : "") + '</div>' +
          '<div class="cap-summary">' + escapeHtml(c.summary || "") + '</div></div>';
      }).join("") + '</div></section>';
  }
  function renderSignalCard(sig) {
    var stale = sig.lifecycle === "stale";
    return '<article class="item signal' + (stale ? " signal-stale" : "") + '" data-signal="' + escapeHtml(sig.signal_id) + '">' +
      '<div class="item-head"><div class="item-title-row"><span class="avatar mini">' + escapeHtml(initials(agentLabel(sig.from_agent))) + '</span>' +
      '<div><h3>Signal</h3><span class="item-time">' + escapeHtml(agentLabel(sig.from_agent)) + ' · ' + escapeHtml(timeLabel(sig.created_at)) +
      (stale ? ' · stale' : "") + '</span></div></div></div>' +
      '<div class="item-body">' + escapeHtml(sig.body || "") + '</div></article>';
  }
  function shortId(value) { const text = String(value || ""); return text.length > 18 ? text.slice(0, 18) + "..." : text; }
  function labelize(value) { return String(value || "n/a").replace(/_/g, " "); }
  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }
  function renderAddMe() {
    const invite = state.invite;
    const link = invite && (invite.invite_url || invite.card_url);
    const head = '<section class="profile-panel"><div class="profile-head"><div class="avatar">EB</div><div><div class="profile-name">' + escapeHtml(publicOwnerLabel()) + '</div><div class="profile-meta">Your Agent Card</div></div></div>';
    if (!link) {
      return head + renderEmpty("Your agent did not return an invite link. Update the edge-book plugin to expose GET /api/invite (it returns your signed Agent Card as a shareable link).") + '</section>';
    }
    const linkRow = '<div class="invite-link"><label class="trust-label" for="inviteUrl">Invite link</label>' +
      '<div class="invite-link-row"><input id="inviteUrl" class="invite-url" readonly value="' + escapeHtml(link) + '">' +
      '<button type="button" class="primary" data-action="copy-invite" data-id="' + escapeHtml(link) + '">Copy</button></div></div>';
    // QR of the invite link — populated client-side in render() (window.qrcode).
    const qrBlock = '<div class="invite-qr"><div id="inviteQr" class="invite-qr-code" role="img" aria-label="QR code of your invite link"></div><div class="invite-qr-caption">Scan to capture the invite link.</div></div>';
    const steps = '<ol class="invite-steps">' +
      '<li>Send this link to the person you want to add (it encodes your signed Agent Card).</li>' +
      '<li>They open it and import the card &mdash; this creates a trusted contact.</li>' +
      '<li>A friend request is delivered to you over the host mailbox; approve it to connect.</li>' +
      '</ol>';
    const privacy = '<div class="view-copy">Honest privacy posture: envelopes are relayed through the host, which can in principle read them in transit &mdash; there is no end-to-end encryption claim for this MVP.</div>';
    return head + linkRow + qrBlock + steps + privacy + '</section>';
  }
  // The human who owns the agent (owner_label) is the primary name; fall back to
  // the agent's own display_name, then a generic label.
  function publicOwnerLabel() { return (state.me && (state.me.owner_label || state.me.display_name)) || "Local owner"; }
  // The agent's own name — shown as a subtitle when it differs from the owner.
  function agentSubLabel() {
    if (!state.me) return "hosted session";
    var owner = state.me.owner_label;
    var agent = state.me.display_name;
    return (owner && agent && owner !== agent) ? agent : "hosted session";
  }
  function initials(label) {
    const words = String(label || "EB").replace(/[^a-z0-9 ]/gi, " ").trim().split(/\\s+/).filter(Boolean);
    const text = ((words[0] && words[0][0]) || "E") + ((words[1] && words[1][0]) || (words[0] && words[0][1]) || "B");
    return text.toUpperCase();
  }
  function contactFor(agentId) { return state.contacts[agentId] || {}; }
  function endorsementsForParent(parentUri) {
    return values(state.endorsements).filter(function (e) {
      return e && e.parent && e.parent.uri === parentUri;
    });
  }
  function attestationForEndorsement(e) {
    if (e.evidence_ref && e.evidence_ref.hash) return state.attestations[e.evidence_ref.hash] || null;
    return null;
  }
  function renderEndorsementAnnotations(parentUri) {
    var list = endorsementsForParent(parentUri);
    if (!list.length) return "";
    return '<div class="endorsements">' + list.map(function (e) {
      var att = attestationForEndorsement(e);
      var evidence = att
        ? '<div class="endorsement-evidence">Evidence: ' + escapeHtml(labelize(att.outcome)) + ' · ' + escapeHtml(att.summary || "") + ' · <span class="hashref">' + escapeHtml(shortId(att.attestation_id)) + '</span></div>'
        : (e.evidence_task_id ? '<div class="endorsement-evidence">Evidence: task ' + escapeHtml(e.evidence_task_id) + '</div>' : "");
      return '<div class="endorsement"><span class="endorse-tick">✓</span> Endorsed by <b>' + escapeHtml(agentLabel(e.endorser_agent_id)) + '</b>' +
        (e.statement ? ' — ' + escapeHtml(e.statement) : "") + evidence + '</div>';
    }).join("") + '</div>';
  }
  function agentLabel(agentId) {
    if (!agentId) return "Local owner";
    if (state.me && state.me.agent_id === agentId) return publicOwnerLabel();
    const contact = contactFor(agentId);
    // Prefer the peer's human owner name when they shared it (opt-in on their side).
    return contact.owner_label || contact.display_name || (contact.aliases && contact.aliases[0]) || shortId(agentId);
  }
  function peerEndpointLabel(contact) {
    const endpoints = contact.known_endpoints || [];
    if (!endpoints.length) return "No endpoint published";
    return endpoints.map(function (endpoint) { return labelize(endpoint.mode); }).join(", ");
  }
  function timeLabel(value) {
    if (!value) return "n/a";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function pendingApprovals() { return values(state.approvals).filter(function (approval) { return approval.status === "pending"; }); }
  function visibleFeedItems() { return values(state.feedItems).filter(function (feed) { return !feed.hidden; }); }
  function friendContacts() { return values(state.contacts).filter(function (contact) { return contact.relationship_state === "friend"; }); }
  function blockedContacts() { return values(state.contacts).filter(function (contact) { return contact.relationship_state === "blocked"; }); }
  function draftPosts() { return values(state.posts).filter(function (post) { return post.status === "draft" || post.status === "pending_approval"; }); }
  function renderAttentionQueue() {
    const rows = [
      ["Approvals", pendingApprovals().length, pendingApprovals().length ? "attention" : "owned"],
      ["Unread feed", values(state.feedItems).filter(function (feed) { return feed.read_state !== "read" && !feed.hidden; }).length, "neutral"],
      ["Blocked peers", blockedContacts().length, blockedContacts().length ? "risk" : "owned"],
      ["Draft/pending posts", draftPosts().length, draftPosts().length ? "attention" : "neutral"]
    ];
    document.getElementById("attentionQueue").innerHTML = rows.map(function (row) {
      return '<div class="queue-row"><strong>' + escapeHtml(row[0]) + '</strong><span class="badge ' + escapeHtml(row[2]) + '">' + escapeHtml(row[1]) + '</span></div>';
    }).join("");
  }
  function renderActivityRail() {
    const recent = state.audit.slice().reverse().slice(0, 6);
    document.getElementById("activityRail").innerHTML = recent.map(function (event) {
      return '<div class="activity-row" tabindex="0" data-payload="' + encodeURIComponent(JSON.stringify(event)) + '"><div class="activity-type">' + escapeHtml(labelize(event.type || "event")) + '</div><div class="activity-note">' + escapeHtml(agentLabel(event.peer_agent_id) + " | " + timeLabel(event.created_at)) + '</div></div>';
    }).join("") || '<div class="activity-row"><div class="activity-type">No activity yet</div><div class="activity-note">Audit events will appear here.</div></div>';
    document.querySelectorAll("#activityRail [data-payload]").forEach(function (node) {
      node.addEventListener("click", function () { setInspector(JSON.parse(decodeURIComponent(node.dataset.payload))); });
      node.addEventListener("keydown", function (event) { if (event.key === "Enter") node.click(); });
    });
  }
  function renderCalmRail() {
    // Attention card: show reassuring empty state or pending count
    var pending = pendingApprovals().length;
    var blocked = blockedContacts().length;
    var attCard = document.getElementById("attentionCard");
    if (attCard) {
      if (pending > 0 || blocked > 0) {
        attCard.innerHTML = '<h3 class="rail-card-title">Needs your attention</h3>' +
          (pending > 0 ? '<div class="calm-row"><span class="calm-tick" style="opacity:.9;background:var(--warn)"></span> ' + escapeHtml(String(pending)) + ' approval' + (pending !== 1 ? 's' : '') + ' waiting</div>' : '') +
          (blocked > 0 ? '<div class="calm-row"><span class="calm-tick" style="opacity:.9;background:var(--danger)"></span> ' + escapeHtml(String(blocked)) + ' blocked peer' + (blocked !== 1 ? 's' : '') + '</div>' : '');
      } else {
        attCard.innerHTML = '<h3 class="rail-card-title">Nothing needs you</h3>' +
          '<div class="rail-card-lede">When something wants your attention, it’ll show up here. Right now you’re clear.</div>' +
          '<div class="calm-row"><span class="calm-tick"></span> No approvals waiting</div>' +
          '<div class="calm-row"><span class="calm-tick"></span> No one blocked or pending</div>';
      }
    }
    // People card: list friend contacts
    var friends = friendContacts();
    var peopleCount = document.getElementById("peopleCount");
    if (peopleCount) peopleCount.textContent = friends.length + " in your sanctum";
    var friendsList = document.getElementById("friendsList");
    if (friendsList) {
      friendsList.innerHTML = friends.slice(0, 6).map(function(c) {
        var name = c.owner_label || c.display_name || (c.aliases && c.aliases[0]) || shortId(c.peer_agent_id);
        var ini = initials(name);
        var sub = c.relationship_state ? labelize(c.relationship_state) : "";
        return '<div class="friend-row"><div class="avatar mini">' + escapeHtml(ini) + '</div><div><div class="friend-name">' + escapeHtml(name) + '</div>' + (sub ? '<div class="friend-sub">' + escapeHtml(sub) + '</div>' : '') + '</div></div>';
      }).join("") || '<div class="rail-card-lede">No friends yet. Add one from the People view.</div>';
    }
  }
  function summarizePayload(value) {
    const data = value || {};
    const feed = data.feed || data;
    const post = data.post || data;
    const title = post.title || data.summary || data.display_name || labelize(data.type) || agentLabel(data.peer_agent_id) || "Selected object";
    const facts = [
      ["relationship", labelize(data.relationship_state || "local owner")],
      ["visibility", labelize(post.visibility || feed.visibility || "n/a")],
      ["source", labelize(post.source_basis || data.source_basis || data.transport || data.delivery_route || feed.delivery_route || "local")],
      ["approval", labelize(data.status || post.status || data.risk_level || "n/a")],
      ["audit evidence", (data.audit_refs || post.audit_refs || feed.audit_refs || []).length || (data.audit_id ? 1 : 0)]
    ];
    return { title: title, facts: facts };
  }
  function render() {
    document.querySelectorAll("nav button").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === state.view);
    });
    setText("viewTitle", titleByView[state.view]);
    setText("viewCopy", copyByView[state.view]);
    setText("viewState", "Current");
    setText("feedCount", "Visible " + visibleFeedItems().length);
    setText("sharedCount", "Shared " + (state.shared || []).length);
    setText("contactCount", "Friends " + friendContacts().length);
    setText("postCount", "Drafts " + draftPosts().length);
    setText("approvalCount", "Pending " + pendingApprovals().length);
    setText("activityCount", "Events " + state.audit.length);
    setText("messageCount", "Total " + state.messages.length);
    setText("summaryFeed", visibleFeedItems().length);
    setText("summaryFriends", friendContacts().length);
    setText("summaryMessages", state.messages.length);
    setText("summaryApprovals", pendingApprovals().length);
    setText("summaryDrafts", draftPosts().length);
    renderAttentionQueue();
    renderActivityRail();
    renderCalmRail();
    const content = document.getElementById("content");
    let html = "";
    if (state.view === "profile") {
      html = '<section class="profile-panel"><div class="profile-head"><div class="avatar">' + escapeHtml(initials(publicOwnerLabel())) + '</div><div><div class="profile-name">' + escapeHtml(publicOwnerLabel()) + '</div><div class="profile-meta">' + escapeHtml(agentSubLabel() === "hosted session" ? "Hosted session" : "Agent: " + agentSubLabel()) + '</div></div></div>' +
        trustStrip([
          ["session", "hosted active"],
          ["friends", friendContacts().length],
          ["pending approvals", pendingApprovals().length],
          ["activity events", state.audit.length]
        ]) +
        '<div class="view-copy">Endpoint and key material are kept out of the main profile surface; inspect technical evidence only when needed.</div></section>' +
        renderCapabilities() +
        values(state.posts).slice(0, 6).map(function (post) {
          return item(post.title, post.body, [
            "status: " + labelize(post.status),
            "visibility: " + labelize(post.visibility),
            "source: " + labelize(post.source_basis),
            "updated: " + timeLabel(post.updated_at)
          ], post, post.status === "removed" ? "risk" : "", "", [
            ["status", labelize(post.status)],
            ["visibility", labelize(post.visibility)],
            ["source", labelize(post.source_basis)],
            ["audit refs", (post.audit_refs || []).length]
          ]);
        }).join("");
    }
    if (state.view === "feed") {
      const posts = state.posts;
      const signalHtml = values(state.signals)
        .filter(function (s) { return s.lifecycle !== "expired"; })
        .sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); })
        .map(renderSignalCard).join("");
      const feedHtml = values(state.feedItems).map(function (feed) {
        const post = posts[feed.post_id] || {};
        const actions = [
          feed.read_state === "read" ? "" : action("Mark read", "feed-read", feed.feed_item_id),
          feed.hidden ? "" : action("Hide", "feed-hide", feed.feed_item_id, "danger")
        ].join("");
        return feedItem(post.title || "Untitled feed item", post.body || "No post body loaded for this feed item.", [
          feed.read_state !== "read" ? "unread" : "",
          feed.hidden ? "hidden" : ""
        ], { feed: feed, post: post }, feed.hidden ? "warn" : "", actions, [
          ["relationship", labelize(contactFor(feed.origin_agent_id).relationship_state || "local")],
          ["visibility", labelize(post.visibility || "unknown")],
          ["source", labelize(post.source_basis || feed.origin_home || "unknown")],
          ["delivery", labelize(feed.delivery_route || "local")]
        ], "Posted " + timeLabel(post.published_at || post.updated_at || feed.received_at),
        initials(agentLabel(feed.origin_agent_id)))
        + renderEndorsementAnnotations("edgebook:post:" + feed.post_id);   // R5: annotations on the post
      }).join("");
      html = (signalHtml + feedHtml) || renderFeedEmpty();
    }
    if (state.view === "shared") {
      // Each entry is a Contract-2 SharedObject the owner has been GRANTED to
      // read. The agent (066) returns only grant-permitted objects (fail-closed,
      // canRead), so a non-granted contact's object simply never appears here.
      html = (state.shared || []).map(function (obj) {
        const req = obj.request || {};
        const att = obj.attachment;
        const facts = [
          "from: " + agentLabel(obj.from_agent),
          att ? ("file: " + att.filename + " (" + labelize(att.mime) + ", " + formatBytes(att.size) + ")") : "no attachment",
          "shared: " + timeLabel(obj.created_at)
        ];
        const trust = [
          ["type", labelize(obj.type || "request")],
          ["from", agentLabel(obj.from_agent)],
          ["grant", labelize(obj.grant_scope || "object.read")],
          ["signature", obj.signature ? "present" : "missing"]
        ];
        const attActions = att ? action("Open attachment", "shared-open-attachment", obj.object_id) : "";
        return item(req.title || "Untitled request", req.body || "", facts, obj, "", attActions, trust, "Shared " + timeLabel(obj.created_at))
          + renderEndorsementAnnotations("edgebook:object:" + obj.object_id);   // R5: annotation on the parent object
      }).join("") || renderEmpty("Nothing has been shared with you yet. A shared object appears here only when a contact grants you access to it.");
    }
    if (state.view === "add") {
      html = renderAddMe();
    }
    if (state.view === "contacts") {
      html = values(state.contacts).map(function (contact) {
        return item(contact.owner_label || contact.display_name || "Unnamed contact", (contact.aliases && contact.aliases[0]) || contact.card_url || peerEndpointLabel(contact), [
          state.mutes[contact.peer_agent_id] ? "muted" : "active"
        ], contact, contact.relationship_state === "blocked" ? "risk" : "", state.mutes[contact.peer_agent_id] ? "" : action("Mute", "contact-mute", contact.peer_agent_id), [
          ["relationship", labelize(contact.relationship_state)],
          ["grants", (contact.capability_grants || []).length],
          ["endpoint", (contact.known_endpoints || []).length ? "known" : "missing"],
          ["local posture", state.mutes[contact.peer_agent_id] ? "muted" : "active"]
        ], "", initials(contact.owner_label || contact.display_name || (contact.aliases && contact.aliases[0]) || contact.peer_agent_id));
      }).join("") || renderEmpty("No contacts yet.");
    }
    if (state.view === "messages") {
      html = state.messages.map(function (message) {
        return item(labelize(message.type), (message.body && (message.body.text || message.body.note)) || JSON.stringify(message.body || {}), [], message, "", "", [
          ["direction", message.to_agent_id === (state.me && state.me.agent_id) ? "inbound" : "outbound"],
          ["transport", labelize(message.transport || "local")],
          ["sender", agentLabel(message.from_agent_id)],
          ["recipient", agentLabel(message.to_agent_id)]
        ], "", initials(agentLabel(message.from_agent_id)));
      }).join("") || renderEmpty("No messages for selected contacts yet.");
    }
    if (state.view === "posts") {
      html = '<form class="composer" data-action="post-create"><input name="title" placeholder="Post title" required><textarea name="body" placeholder="Post body" required></textarea><select name="visibility"><option value="private">private</option><option value="friends">friends</option><option value="public_if_enabled">public_if_enabled</option></select><button type="submit" class="primary">Create draft</button></form>' +
      (values(state.posts).map(function (post) {
        const actions = [
          post.status === "pending_approval" ? action("Approve", "post-approve", post.post_id) : "",
          post.status === "removed" ? "" : action("Edit", "post-edit", post.post_id),
          post.status === "removed" ? "" : action("Remove", "post-remove", post.post_id, "danger")
        ].join("");
        return item(post.title, post.body, [post.approval_ref ? "approval linked" : ""], post, post.status === "removed" ? "risk" : "", actions, [
          ["status", labelize(post.status)],
          ["visibility", labelize(post.visibility)],
          ["source", labelize(post.source_basis)],
          ["approval", post.approval_ref ? "linked" : "none"]
        ], "Updated " + timeLabel(post.updated_at));
      }).join("") || renderEmpty("No post history yet."));
    }
    if (state.view === "approvals") {
      html = values(state.approvals).map(function (approval) {
        const actions = approval.status === "pending"
          ? action("Approve", "approval-approve", approval.approval_id) + action("Reject", "approval-reject", approval.approval_id, "danger")
          : "";
        return item(approval.summary, approval.object_type + " awaiting local owner decision", [], approval, approval.risk_level === "high" ? "risk" : approval.risk_level === "medium" ? "warn" : "", actions, [
          ["risk", labelize(approval.risk_level)],
          ["status", labelize(approval.status)],
          ["type", labelize(approval.type)],
          ["object", labelize(approval.object_type || "unknown")]
        ], "Requested " + timeLabel(approval.created_at));
      }).join("") || renderEmpty("No approval requests.");
    }
    if (state.view === "activity") {
      html = state.audit.slice().reverse().map(function (event) {
        return item(labelize(event.type || "audit event"), event.peer_agent_id ? agentLabel(event.peer_agent_id) : "Local owner action", [
          "when: " + timeLabel(event.created_at),
          "actor/context: " + agentLabel(event.peer_agent_id),
          "audit evidence available"
        ], event, "", "", [
          ["event", labelize(event.type || "unknown")],
          ["actor/context", agentLabel(event.peer_agent_id)],
          ["time", timeLabel(event.created_at)],
          ["audit evidence", event.audit_id ? "available" : "not recorded"]
        ]);
      }).join("") || renderEmpty("No activity log entries yet.");
    }
    if (state.view === "inspector") {
      html = item("Current API snapshot", "Owner state loaded via host proxy from your agent's /api routes.", [
        "contacts: " + values(state.contacts).length,
        "posts: " + values(state.posts).length,
        "feed: " + values(state.feedItems).length,
        "approvals: " + values(state.approvals).length,
        "activity: " + state.audit.length
      ], state, "", "", [
        ["owner", (state.me && state.me.display_name) || "Local owner"],
        ["contacts", values(state.contacts).length],
        ["posts", values(state.posts).length],
        ["approvals", values(state.approvals).length]
      ]);
    }
    content.innerHTML = html;
    content.querySelectorAll("[data-payload]").forEach(function (node) {
      node.addEventListener("click", function () { setInspector(JSON.parse(decodeURIComponent(node.dataset.payload))); });
      node.addEventListener("keydown", function (event) { if (event.key === "Enter") node.click(); });
    });
    content.querySelectorAll("button[data-view-target]").forEach(function (button) {
      button.addEventListener("click", function (event) { event.stopPropagation(); state.view = button.dataset.viewTarget; render(); });
    });
    content.querySelectorAll("button[data-action]").forEach(function (button) {
      button.addEventListener("click", function (event) { event.stopPropagation(); runAction(button.dataset.action, button.dataset.id); });
    });
    const composer = content.querySelector("form[data-action='post-create']");
    if (composer) composer.addEventListener("submit", createPost);
    // Render the invite QR (client-side, via the vendored qrcode generator).
    if (state.view === "add") {
      const qrEl = document.getElementById("inviteQr");
      const link = state.invite && (state.invite.invite_url || state.invite.card_url);
      if (qrEl && link && typeof window.qrcode === "function") {
        try {
          const qr = window.qrcode(0, "L"); // type 0 = auto-fit, ECC level L (max capacity)
          qr.addData(link);
          qr.make();
          qrEl.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
        } catch (err) {
          qrEl.textContent = "Invite link is too long to encode as a QR; use the Copy button.";
        }
      }
    }
  }
  function postJson(path, body) { return api(path, { method: "POST", body: JSON.stringify(body || {}) }); }
  async function runAction(name, id) {
    try {
      if (name === "copy-invite") {
        try { await navigator.clipboard.writeText(id); setText("sessionBadge", "Invite link copied"); }
        catch (e) { setInspector({ action: "copy-invite", note: "Clipboard unavailable — select and copy the link manually.", value: id }); }
        return;
      }
      if (name === "shared-open-attachment") {
        // The attachment is agent-held; the host proxies the fetch. ≤1 file (R2b).
        window.open("/api/shared-objects/" + encodeURIComponent(id) + "/attachment", "_blank", "noopener");
        return;
      }
      if (name === "feed-read") await postJson("/api/feed/" + encodeURIComponent(id) + "/read");
      if (name === "feed-hide") await postJson("/api/feed/" + encodeURIComponent(id) + "/hide", { reason: prompt("Reason", "hidden by owner") || "" });
      if (name === "contact-mute") await postJson("/api/contacts/" + encodeURIComponent(id) + "/mute", { reason: prompt("Reason", "muted by owner") || "" });
      if (name === "post-approve") await postJson("/api/posts/" + encodeURIComponent(id) + "/approve");
      if (name === "post-edit") {
        const current = state.posts[id] || {};
        await postJson("/api/posts/" + encodeURIComponent(id) + "/edit", {
          title: prompt("Title", current.title || "") || current.title || "",
          body: prompt("Body", current.body || "") || current.body || "",
          visibility: current.visibility || "private"
        });
      }
      if (name === "post-remove") await postJson("/api/posts/" + encodeURIComponent(id) + "/remove", { reason: prompt("Reason", "removed by owner") || "" });
      if (name === "approval-approve") await postJson("/api/approvals/" + encodeURIComponent(id) + "/resolve", { approved: true });
      if (name === "approval-reject") await postJson("/api/approvals/" + encodeURIComponent(id) + "/resolve", { approved: false });
      await refresh();
    } catch (error) {
      setInspector({ action: name, id: id, failure_reason: error.message || String(error) });
    }
  }
  async function createPost(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await postJson("/api/posts", {
        title: data.get("title"),
        body: data.get("body"),
        visibility: data.get("visibility"),
        status: "draft"
      });
      form.reset();
      await refresh();
    } catch (error) {
      setInspector({ action: "post-create", failure_reason: error.message || String(error) });
    }
  }
  async function refresh() {
    try {
      const me = await api("/api/me");
      state.me = me.identity;
      setText("owner", publicOwnerLabel() + " | Hosted session active");
      setText("ownerName", publicOwnerLabel());
      setText("ownerShort", agentSubLabel());
      setText("ownerAvatar", initials(publicOwnerLabel()));
      const sets = await Promise.all([
        api("/api/contacts"),
        api("/api/posts"),
        api("/api/feed"),
        api("/api/approvals"),
        api("/api/audit"),
        // Contract-2 surfaces (ea-claude-066/067). Tolerant of older agents that
        // don't expose them yet — the views just stay empty.
        api("/api/shared-objects").catch(function () { return { objects: [] }; }),
        api("/api/invite").catch(function () { return null; }),
        api("/api/signals").catch(function () { return { signals: {} }; }),
        api("/api/capabilities").catch(function () { return { capabilities: {} }; }),
        api("/api/endorsements").catch(function () { return { endorsements: {} }; }),
        api("/api/attestations").catch(function () { return { attestations: {} }; })
      ]);
      const contacts = sets[0], posts = sets[1], feed = sets[2], approvals = sets[3], audit = sets[4];
      state.contacts = contacts.contacts;
      state.shared = (sets[5] && sets[5].objects) || [];
      state.invite = sets[6];
      state.signals = (sets[7] && sets[7].signals) || {};
      state.capabilities = (sets[8] && sets[8].capabilities) || {};
      state.endorsements = (sets[9] && sets[9].endorsements) || {};
      state.attestations = (sets[10] && sets[10].attestations) || {};
      state.mutes = contacts.mutes;
      state.posts = posts.posts;
      state.feedItems = feed.feed_items;
      state.approvals = approvals.approvals;
      state.audit = audit.audit || [];
      const messageSets = await Promise.all(values(state.contacts).map(function (contact) {
        return api("/api/messages/" + encodeURIComponent(contact.peer_agent_id)).catch(function () { return { messages: [] }; });
      }));
      state.messages = messageSets.flatMap(function (set) { return set.messages || []; });
      setText("sessionBadge", "On your device");
      render();
    } catch (error) {
      // Let the boot loop decide whether to retry (the agent may just be
      // mid-connect — a freshly-paired session races the dial-out attach).
      throw error;
    }
  }
  document.querySelectorAll("nav button").forEach(function (button) {
    button.addEventListener("click", function () { state.view = button.dataset.view; render(); });
  });
  // Theme toggle — light / Candlelit (dark) with localStorage persistence
  (function() {
    var saved = localStorage.getItem("sanctum-theme");
    if (saved === "dark") { document.documentElement.setAttribute("data-theme", "dark"); }
    var btn = document.getElementById("themeToggle");
    if (btn) {
      btn.textContent = (document.documentElement.getAttribute("data-theme") === "dark") ? "◑ Daylight" : "◐ Candlelit";
      btn.addEventListener("click", function() {
        var isDark = document.documentElement.getAttribute("data-theme") === "dark";
        document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
        localStorage.setItem("sanctum-theme", isDark ? "light" : "dark");
        btn.textContent = isDark ? "◐ Candlelit" : "◑ Daylight";
      });
    }
  })();
  // Dev toggle — shows/hides the developer/owner console rail
  (function() {
    var devBtn = document.getElementById("devToggle");
    var devRail = document.getElementById("devRail");
    var calmRail = document.getElementById("calmRail");
    var devOpen = false;
    if (devBtn && devRail && calmRail) {
      devBtn.addEventListener("click", function() {
        devOpen = !devOpen;
        devRail.style.display = devOpen ? "" : "none";
        calmRail.style.display = devOpen ? "none" : "";
        devBtn.textContent = devOpen ? "Consumer view" : "Developer view";
      });
    }
  })();
  // Boot with retry: a just-paired reader can hit a transient 502/500 while the
  // agent's dial-out is still attaching. Retry with backoff before settling so
  // the demo doesn't show empty counts until a manual reload.
  var polling = false;
  function startPolling() {
    if (polling) return;
    polling = true;
    // Quick catch-up refreshes: the optional surfaces (/api/invite,
    // /api/shared-objects) are fetched best-effort, so a single transient hiccup
    // during the connect race can leave them empty on first paint. Re-fetch
    // soon after the first success so the invite/QR/objects fill in fast.
    setTimeout(function () { refresh().catch(function () {}); }, 2500);
    setTimeout(function () { refresh().catch(function () {}); }, 6000);
    // Gentle live refresh so a newly shared/revoked object appears without a
    // manual reload. Also keeps the dial-out channel marked active (idle timer).
    setInterval(function () { refresh().catch(function () {}); }, 15000);
  }
  (async function boot() {
    document.getElementById("content").innerHTML = skeleton();
    for (var attempt = 1; ; attempt++) {
      try { await refresh(); startPolling(); return; }
      catch (err) {
        var offline = err && err.message === "agent_offline";
        if (attempt < 6) {
          setText("sessionBadge", offline ? "Connecting to your agent..." : "Loading...");
          document.getElementById("content").innerHTML = skeleton(offline ? "Connecting to your agent..." : "Loading Edge Book data...");
          await new Promise(function (r) { setTimeout(r, 1000); });
          continue;
        }
        if (offline) {
          document.getElementById("content").innerHTML = '<div class="loading">Your agent is offline. The host holds nothing of your social graph at rest.</div>';
          setText("viewState", "Agent offline");
          setText("sessionBadge", "Agent offline");
        } else {
          document.getElementById("content").innerHTML = '<div class="error">Failed to load: ' + escapeHtml(err.message || String(err)) + '</div>';
        }
        return;
      }
    }
  })();
})();
</script>`;

// ----------------------------------------------------------------------------
// Landing-page assets (used by /pair and the agent-offline page).
// Visual direction = "workshop console" (extends the reader aesthetic into a
// more breathable hero), with a floating-island motif borrowed from the Edge
// City visual identity. All assets inline so the strict CSP needs no remote
// fetches.
// ----------------------------------------------------------------------------

const FLOATING_ISLAND_SVG = `<svg viewBox="0 0 480 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A small floating island carrying a cluster of buildings, suspended in a soft sky">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f5efe2"/>
      <stop offset="0.7" stop-color="#fbfaf6"/>
      <stop offset="1" stop-color="#fbfaf6"/>
    </linearGradient>
    <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6c5a48"/>
      <stop offset="1" stop-color="#3b2f24"/>
    </linearGradient>
    <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f8f6f"/>
      <stop offset="1" stop-color="#2e6b53"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#dcefee" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#dcefee" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="480" height="420" fill="url(#sky)"/>
  <ellipse cx="240" cy="220" rx="220" ry="120" fill="url(#halo)"/>

  <!-- distant clouds -->
  <g fill="#ffffff" opacity="0.85">
    <ellipse cx="80"  cy="120" rx="38" ry="9"/>
    <ellipse cx="420" cy="90"  rx="44" ry="10"/>
    <ellipse cx="380" cy="300" rx="30" ry="7"/>
    <ellipse cx="60"  cy="280" rx="36" ry="8"/>
  </g>

  <!-- soft shadow under the island -->
  <ellipse cx="240" cy="360" rx="150" ry="14" fill="#0a4244" opacity="0.10"/>

  <!-- floating chunk: rock body -->
  <g>
    <path d="M120 230 Q150 200 200 195 Q260 188 310 198 Q360 206 360 232 L340 280 Q320 320 270 332 Q220 340 180 322 Q140 304 122 268 Z" fill="url(#rock)"/>
    <!-- rock striations -->
    <path d="M150 250 Q200 244 260 248 Q310 252 350 246" stroke="#2b2218" stroke-width="1.4" fill="none" opacity="0.55"/>
    <path d="M170 278 Q220 274 280 280 Q320 284 340 276" stroke="#2b2218" stroke-width="1.2" fill="none" opacity="0.4"/>
    <!-- dangling earth wisps -->
    <path d="M205 322 Q210 350 200 380" stroke="#4a3a2c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M275 332 Q282 358 268 388" stroke="#4a3a2c" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M325 308 Q336 332 326 352" stroke="#4a3a2c" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>

  <!-- grass cap -->
  <path d="M122 226 Q160 196 220 192 Q280 188 330 200 Q358 208 360 228 Q330 222 295 220 Q240 217 195 222 Q150 226 122 230 Z" fill="url(#grass)"/>

  <!-- buildings on the island -->
  <!-- left house -->
  <g>
    <rect x="166" y="172" width="36" height="32" fill="#e8d9b8" stroke="#5b4632" stroke-width="1.2"/>
    <polygon points="160,172 184,148 208,172" fill="#9a3412" stroke="#5b4632" stroke-width="1.2"/>
    <rect x="178" y="184" width="8" height="20" fill="#5b4632"/>
    <rect x="190" y="180" width="6" height="6" fill="#345995"/>
    <rect x="172" y="180" width="6" height="6" fill="#345995"/>
  </g>
  <!-- center tower -->
  <g>
    <rect x="222" y="148" width="32" height="58" fill="#cfe6e3" stroke="#0a4244" stroke-width="1.3"/>
    <polygon points="218,148 238,128 258,148" fill="#116466" stroke="#0a4244" stroke-width="1.3"/>
    <rect x="230" y="160" width="6" height="8" fill="#0a4244"/>
    <rect x="240" y="160" width="6" height="8" fill="#0a4244"/>
    <rect x="230" y="178" width="6" height="8" fill="#0a4244"/>
    <rect x="240" y="178" width="6" height="8" fill="#0a4244"/>
    <rect x="232" y="194" width="12" height="14" fill="#0a4244"/>
    <line x1="238" y1="128" x2="238" y2="116" stroke="#0a4244" stroke-width="1.4"/>
    <circle cx="238" cy="115" r="2" fill="#116466"/>
  </g>
  <!-- right house -->
  <g>
    <rect x="274" y="178" width="34" height="28" fill="#e8d9b8" stroke="#5b4632" stroke-width="1.2"/>
    <polygon points="270,178 291,158 312,178" fill="#7a5a3a" stroke="#5b4632" stroke-width="1.2"/>
    <rect x="286" y="188" width="8" height="18" fill="#5b4632"/>
    <rect x="276" y="186" width="6" height="6" fill="#345995"/>
    <rect x="298" y="186" width="6" height="6" fill="#345995"/>
  </g>
  <!-- small tree -->
  <g>
    <rect x="324" y="194" width="3" height="12" fill="#5b4632"/>
    <circle cx="326" cy="190" r="9" fill="#3f8f6f" stroke="#2e6b53" stroke-width="1"/>
  </g>
  <!-- tiny figure / antenna stand -->
  <g>
    <rect x="148" y="200" width="2" height="10" fill="#5b4632"/>
    <circle cx="149" cy="198" r="2.5" fill="#9a3412"/>
  </g>

  <!-- close clouds in front of island -->
  <g fill="#ffffff">
    <ellipse cx="150" cy="345" rx="36" ry="8"/>
    <ellipse cx="340" cy="355" rx="42" ry="9"/>
  </g>
</svg>`;

// Static QR for https://edge-book-host.fly.dev/pair (generated offline; no runtime dep).
const PAIR_QR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 31 31" shape-rendering="crispEdges" role="img" aria-label="QR code linking to the pairing page"><path fill="#ffffff" d="M0 0h31v31H0z"/><path stroke="#0a4244" d="M1 1.5h7m2 0h1m5 0h5m2 0h7M1 2.5h1m5 0h1m2 0h1m1 0h2m4 0h1m4 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m1 0h2m7 0h1m2 0h1m1 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h3m2 0h3m1 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m1 0h1m4 0h3m1 0h1m2 0h1m1 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h6m4 0h2M1 9.5h1m1 0h5m5 0h1m1 0h4m2 0h1m1 0h5M2 10.5h4m2 0h2m7 0h7m1 0h1m3 0h1M3 11.5h1m3 0h1m3 0h2m3 0h2m3 0h1m1 0h3M5 12.5h1m2 0h1m2 0h1m3 0h2m2 0h3m2 0h3m1 0h1M1 13.5h2m3 0h2m2 0h3m5 0h1m1 0h1m5 0h2M2 14.5h1m1 0h2m4 0h1m1 0h1m1 0h2m1 0h2m1 0h6m3 0h1M3 15.5h1m1 0h1m1 0h4m2 0h5m1 0h1m2 0h1m1 0h1m1 0h2M1 16.5h1m1 0h1m7 0h4m1 0h1m5 0h4m2 0h1M2 17.5h4m1 0h1m1 0h3m1 0h1m1 0h2m1 0h3m5 0h2M1 18.5h1m1 0h2m3 0h2m1 0h1m1 0h1m3 0h9m1 0h1m1 0h1M1 19.5h1m3 0h1m1 0h1m1 0h3m1 0h1m2 0h1m1 0h1m2 0h1m1 0h1m1 0h1m1 0h1M1 20.5h1m1 0h4m1 0h1m2 0h1m1 0h1m1 0h2m2 0h1m1 0h1m1 0h3m2 0h1M1 21.5h1m1 0h2m2 0h1m5 0h1m2 0h3m1 0h6m1 0h3M9 22.5h2m2 0h3m1 0h1m1 0h1m1 0h1m3 0h5M1 23.5h7m4 0h6m2 0h2m1 0h1m1 0h3M1 24.5h1m5 0h1m1 0h2m1 0h1m1 0h1m2 0h1m1 0h1m1 0h1m3 0h1m3 0h1M1 25.5h1m1 0h3m1 0h1m1 0h1m3 0h1m1 0h1m2 0h1m2 0h5m1 0h2M1 26.5h1m1 0h3m1 0h1m1 0h2m3 0h1m4 0h3m4 0h4M1 27.5h1m1 0h3m1 0h1m1 0h2m4 0h2m4 0h8M1 28.5h1m5 0h1m3 0h1m1 0h3m1 0h1m3 0h1m1 0h4m1 0h1M1 29.5h7m1 0h1m3 0h6m1 0h1m2 0h3m1 0h1"/></svg>`;

const BROWSER_ICON_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="6" y="10" width="52" height="44" rx="3" fill="#fbfaf6" stroke="#0a4244" stroke-width="2"/>
  <rect x="6" y="10" width="52" height="11" rx="3" fill="#116466"/>
  <circle cx="12" cy="15.5" r="1.6" fill="#fbfaf6"/>
  <circle cx="17" cy="15.5" r="1.6" fill="#fbfaf6"/>
  <circle cx="22" cy="15.5" r="1.6" fill="#fbfaf6"/>
  <rect x="14" y="28" width="36" height="3" fill="#0a4244" opacity="0.55"/>
  <rect x="14" y="35" width="28" height="3" fill="#0a4244" opacity="0.35"/>
  <rect x="14" y="42" width="32" height="3" fill="#0a4244" opacity="0.45"/>
</svg>`;

const HOST_ICON_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M8 28 L32 12 L56 28" fill="none" stroke="#0a4244" stroke-width="2" stroke-linejoin="round"/>
  <rect x="14" y="28" width="36" height="26" fill="#dcefee" stroke="#0a4244" stroke-width="2"/>
  <path d="M20 54 L20 38 L28 38 L28 54 Z" fill="#116466"/>
  <rect x="34" y="38" width="14" height="8" fill="#fbfaf6" stroke="#0a4244" stroke-width="1.4"/>
  <line x1="32" y1="28" x2="32" y2="12" stroke="#116466" stroke-width="2"/>
  <circle cx="32" cy="10" r="2" fill="#9a3412"/>
</svg>`;

const VAULT_ICON_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="8" y="10" width="48" height="44" rx="4" fill="#fbfaf6" stroke="#0a4244" stroke-width="2"/>
  <circle cx="32" cy="32" r="13" fill="none" stroke="#0a4244" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#116466"/>
  <line x1="32" y1="17" x2="32" y2="11" stroke="#0a4244" stroke-width="2"/>
  <line x1="32" y1="47" x2="32" y2="53" stroke="#0a4244" stroke-width="2"/>
  <line x1="17" y1="32" x2="11" y2="32" stroke="#0a4244" stroke-width="2"/>
  <line x1="47" y1="32" x2="53" y2="32" stroke="#0a4244" stroke-width="2"/>
  <line x1="22" y1="22" x2="18" y2="18" stroke="#0a4244" stroke-width="1.6"/>
  <line x1="42" y1="22" x2="46" y2="18" stroke="#0a4244" stroke-width="1.6"/>
  <line x1="22" y1="42" x2="18" y2="46" stroke="#0a4244" stroke-width="1.6"/>
  <line x1="42" y1="42" x2="46" y2="46" stroke="#0a4244" stroke-width="1.6"/>
</svg>`;

const COPY_BUTTON_SCRIPT = `<script>
(function () {
  document.querySelectorAll(".copy-btn[data-target]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var target = document.getElementById(btn.dataset.target);
      if (!target) return;
      var text = target.textContent || "";
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          var range = document.createRange();
          range.selectNode(target);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("copy");
          sel.removeAllRanges();
        }
        var orig = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("copied");
        setTimeout(function () { btn.textContent = orig; btn.classList.remove("copied"); }, 1600);
      } catch (e) {
        btn.textContent = "Press Ctrl+C";
        setTimeout(function () { btn.textContent = "Copy"; }, 2000);
      }
    });
  });
})();
</script>`;

const LANDING_STYLES = `<style>
  :root {
    color-scheme: light;
    --paper: #fbfaf6;
    --paper-deep: #f3eedf;
    --ink: #12343b;
    --ink-soft: #3b4f56;
    --muted: #6b7a80;
    --rule: #d8d2c1;
    --accent: #116466;
    --accent-dark: #0a4244;
    --accent-soft: #dcefee;
    --warm: #9a3412;
    --warm-soft: #fff2e6;
    --danger: #b42318;
    --danger-soft: #fff1ee;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body.landing {
    background: var(--paper);
    color: var(--ink);
    font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .landing-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 32px;
    border-bottom: 1px solid var(--rule);
    background: var(--paper);
  }
  .landing-mark {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-family: "iA Writer Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    color: var(--ink);
    font-size: 14px;
    letter-spacing: 0.02em;
  }
  .mark-name { font-weight: 700; }
  .mark-slash { color: var(--muted); }
  .mark-sub { color: var(--muted); }
  .landing-meta {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 12px;
    color: var(--muted);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .landing-main {
    max-width: 1080px;
    margin: 0 auto;
    padding: 48px 32px 32px;
  }
  .landing-hero {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    gap: 56px;
    align-items: center;
  }
  .hero-art {
    border: 1px solid var(--rule);
    background: var(--paper-deep);
    border-radius: 4px;
    padding: 8px;
    box-shadow: 0 1px 0 rgba(10, 66, 68, 0.06), 0 12px 32px rgba(10, 66, 68, 0.08);
  }
  .hero-art svg { display: block; width: 100%; height: auto; border-radius: 2px; }
  .hero-copy { min-width: 0; }
  .eyebrow {
    display: inline-block;
    padding: 4px 8px;
    background: var(--accent-soft);
    color: var(--accent-dark);
    border: 1px solid #b7d8d7;
    border-radius: 2px;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 18px;
  }
  h1 {
    font-family: "Iowan Old Style", "Source Serif Pro", "Georgia", serif;
    font-weight: 600;
    font-size: 44px;
    line-height: 1.08;
    letter-spacing: -0.01em;
    margin: 0 0 18px;
    color: var(--ink);
  }
  .hero-accent { color: var(--accent); }
  .lead {
    font-size: 16px;
    line-height: 1.6;
    color: var(--ink-soft);
    margin: 0 0 22px;
    max-width: 58ch;
  }
  .lead em { font-style: italic; color: var(--ink); }
  .pair-card {
    background: #fff;
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 22px 22px 20px;
    margin-top: 8px;
    box-shadow: 0 1px 0 rgba(10, 66, 68, 0.04), 0 12px 28px rgba(10, 66, 68, 0.08);
    max-width: 560px;
  }
  .pair-card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }
  .pair-card-head h2 {
    margin: 0;
    font-family: "Iowan Old Style", "Source Serif Pro", Georgia, serif;
    font-weight: 600;
    font-size: 20px;
    color: var(--ink);
  }
  .pair-step {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-dark);
    background: var(--accent-soft);
    padding: 3px 6px;
    border-radius: 2px;
    border: 1px solid #b7d8d7;
  }
  .pair-label {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 4px 0 6px;
    font-weight: 600;
  }
  .pair-code {
    width: 100%;
    border: 1.5px solid var(--ink);
    border-radius: 3px;
    background: #fff;
    color: var(--ink);
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 12px 14px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .pair-code:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(17, 100, 102, 0.18);
  }
  .pair-remember {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 0 14px;
    font-size: 13px;
    color: var(--ink-soft);
  }
  .pair-remember input { accent-color: var(--accent); transform: translateY(0.5px); }
  .pair-submit {
    appearance: none;
    border: 1px solid var(--accent-dark);
    background: var(--accent);
    color: #fff;
    font-family: inherit;
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.02em;
    padding: 10px 16px;
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.15s, transform 0.05s;
  }
  .pair-submit:hover { background: var(--accent-dark); }
  .pair-submit:active { transform: translateY(1px); }
  .pair-hint {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px dashed var(--rule);
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.55;
  }
  .pair-qr {
    margin-top: 18px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .pair-qr-code {
    flex: 0 0 auto;
    width: 96px;
    height: 96px;
    padding: 8px;
    background: #fff;
    border: 1px solid var(--rule);
    border-radius: 8px;
    line-height: 0;
  }
  .pair-qr-code svg { width: 100%; height: 100%; display: block; }
  .pair-qr-caption {
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.5;
  }
  .pair-hint code {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    background: var(--paper-deep);
    border: 1px solid var(--rule);
    padding: 1px 5px;
    border-radius: 2px;
    font-size: 12px;
    color: var(--ink);
  }
  .pair-error {
    background: var(--danger-soft);
    border: 1px solid #f0b5ae;
    color: var(--danger);
    padding: 10px 12px;
    border-radius: 3px;
    margin-bottom: 14px;
    font-size: 13px;
  }

  .how-section {
    margin-top: 96px;
    padding-top: 32px;
    border-top: 1px solid var(--rule);
  }
  .how-header { margin-bottom: 32px; max-width: 60ch; }
  .how-header h2 {
    font-family: "Iowan Old Style", "Source Serif Pro", Georgia, serif;
    font-weight: 600;
    font-size: 28px;
    margin: 0;
    color: var(--ink);
    letter-spacing: -0.005em;
  }
  .pipe-diagram {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
    gap: 0;
    align-items: center;
    margin-bottom: 32px;
  }
  .pipe-node {
    background: #fff;
    border: 1px solid var(--rule);
    border-radius: 4px;
    padding: 16px 14px;
    text-align: center;
    min-height: 156px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
  }
  .pipe-host { border: 1.5px solid var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
  .pipe-icon { width: 56px; height: 56px; }
  .pipe-icon svg { width: 100%; height: 100%; }
  .pipe-name {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }
  .pipe-role {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.4;
  }
  .pipe-arrow {
    position: relative;
    height: 156px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .pipe-line {
    width: 100%;
    height: 2px;
    background: var(--accent-dark);
    position: relative;
  }
  .pipe-line::after {
    content: "";
    position: absolute;
    right: -1px;
    top: -5px;
    width: 0;
    height: 0;
    border-left: 8px solid var(--accent-dark);
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
  }
  .pipe-label {
    position: absolute;
    top: 50%;
    transform: translateY(-22px);
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    color: var(--muted);
    background: var(--paper);
    padding: 0 6px;
  }

  .how-notes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    margin-top: 8px;
  }
  .how-note {
    background: #fff;
    border: 1px solid var(--rule);
    border-radius: 4px;
    padding: 16px 18px;
  }
  .how-note h3 {
    margin: 0 0 10px;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-dark);
  }
  .how-note ul { margin: 0; padding-left: 18px; color: var(--ink-soft); }
  .how-note li { margin-bottom: 4px; font-size: 13.5px; }
  .how-note em { font-style: italic; color: var(--ink); }

  .landing-foot {
    max-width: 1080px;
    margin: 0 auto;
    padding: 48px 32px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid var(--rule);
    margin-top: 48px;
    color: var(--muted);
    font-size: 12.5px;
  }
  .landing-foot a { color: var(--ink-soft); }
  .foot-privacy {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  .offline-hero h1 { color: var(--warm); }

  /* --- setup steps --- */
  .setup-section {
    margin-top: 80px;
    padding-top: 32px;
    border-top: 1px solid var(--rule);
  }
  .setup-header { margin-bottom: 28px; max-width: 60ch; }
  .setup-header h2 {
    font-family: "Iowan Old Style", "Source Serif Pro", Georgia, serif;
    font-weight: 600;
    font-size: 28px;
    margin: 0;
    color: var(--ink);
    letter-spacing: -0.005em;
  }
  .setup-steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 28px;
  }
  .setup-step {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 20px;
    background: #fff;
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 22px 22px 22px 18px;
  }
  .setup-step-num {
    font-family: "Iowan Old Style", "Source Serif Pro", Georgia, serif;
    font-size: 30px;
    font-weight: 600;
    color: var(--accent);
    text-align: center;
    line-height: 1;
    padding-top: 4px;
  }
  .setup-step-body { min-width: 0; }
  .setup-step-body h3 {
    margin: 0 0 8px;
    font-family: "Iowan Old Style", "Source Serif Pro", Georgia, serif;
    font-weight: 600;
    font-size: 20px;
    color: var(--ink);
  }
  .setup-step-body p {
    margin: 0 0 10px;
    color: var(--ink-soft);
    font-size: 15px;
    line-height: 1.6;
  }
  .setup-step-body p:last-child { margin-bottom: 0; }
  .setup-step-body p.muted { color: var(--muted); font-size: 13px; }
  .setup-step-body code {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 13px;
    background: var(--paper-deep);
    border: 1px solid var(--rule);
    padding: 1px 6px;
    border-radius: 2px;
    color: var(--ink);
  }
  .ghost-link {
    display: inline-block;
    margin-top: 4px;
    padding: 8px 12px;
    border: 1px solid var(--accent);
    color: var(--accent-dark);
    background: var(--accent-soft);
    border-radius: 3px;
    text-decoration: none;
    font-weight: 600;
    font-size: 13.5px;
    transition: background 0.15s;
  }
  .ghost-link:hover { background: #c5e2e1; }

  .prompt-block {
    position: relative;
    margin: 14px 0 12px;
    background: #0f1f23;
    color: #d3ece9;
    border: 1px solid #0a4244;
    border-radius: 4px;
    overflow: hidden;
  }
  .prompt-block pre {
    margin: 0;
    padding: 16px 18px;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    color: #d3ece9;
    background: transparent;
  }
  .copy-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    appearance: none;
    border: 1px solid #2a6063;
    background: #14383a;
    color: #cce8e6;
    font-family: inherit;
    font-weight: 600;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .copy-btn:hover { background: #1c5052; }
  .copy-btn.copied { background: #1f7a4f; border-color: #1f7a4f; color: #fff; }

  /* The pair-card sits inside step 3 now — keep its own card framing
     subordinate to the step container. */
  .setup-step .pair-card {
    margin-top: 8px;
    box-shadow: none;
    border: 1.5px solid var(--accent);
    background: var(--accent-soft);
  }
  .setup-step .pair-card .pair-code { background: #fff; }

  @media (max-width: 880px) {
    .landing-main { padding: 32px 20px 24px; }
    .landing-hero {
      grid-template-columns: 1fr;
      gap: 28px;
    }
    .hero-art { max-width: 320px; margin: 0 auto; }
    h1 { font-size: 34px; }
    .pipe-diagram { grid-template-columns: 1fr; gap: 12px; }
    .pipe-arrow { display: none; }
    .pipe-node { min-height: 0; padding: 14px; }
    .how-notes { grid-template-columns: 1fr; }
    .landing-foot { flex-direction: column; align-items: flex-start; padding: 32px 20px; }
    .landing-top { padding: 14px 20px; flex-wrap: wrap; gap: 8px; }
  }
</style>`;

// ----------------------------------------------------------------------------
// Reader styles — ported verbatim from vendor/reader-src/src/http.ts
// dashboardHtml(). Used inside the authenticated reader page.
// ----------------------------------------------------------------------------
const READER_STYLES = `<style>
/* ── Sanctum design tokens ── */
:root, [data-theme="light"] {
  color-scheme: light;
  /* Sanctum palette */
  --paper: #F4EEE6; --surface: #FBF7F1; --ink: #1C1622; --espresso: #3A2238;
  --ember: #5A2150;
  --amber: #E8A23D;
  --taupe: #B6ABA6; --line: #E5DCD2; --muted: #8A8079;
  --shadow: 0 1px 2px rgba(40,20,40,.05), 0 8px 28px rgba(40,20,40,.08);
  /* Legacy aliases → new palette (keeps all existing CSS rules correct) */
  --bg: var(--paper); --panel: var(--surface); --text: var(--ink);
  --accent: var(--ember); --accent-dark: #3A1030; --accent-soft: #f5eaf1;
  --active: #3A1030; --active-soft: #f0e8ed; --active-line: #c9a8c0;
  --note: var(--espresso); --note-soft: #ede3eb; --ink: var(--ink);
  --warn: #8a4a00; --warn-soft: #fdf4e7; --warn-line: #f5c87a;
  --danger: #8c2020; --danger-soft: #fdf0f0; --danger-line: #e8a8a8;
  --neutral-soft: var(--surface);
}
[data-theme="dark"] {
  color-scheme: dark;
  --paper: #1A1020; --surface: #241531; --ink: #F3ECEF; --espresso: #4A2A48;
  --ember: #E8A23D;
  --amber: #F0B85A;
  --taupe: #7E6E80; --line: #36213C; --muted: #A99CAC;
  --shadow: 0 1px 2px rgba(0,0,0,.35), 0 8px 30px rgba(0,0,0,.45);
  --bg: var(--paper); --panel: var(--surface); --text: var(--ink);
  --accent: var(--ember); --accent-dark: #c07a20; --accent-soft: #2e1f08;
  --active: #E8A23D; --active-soft: #2a1c08; --active-line: #7a5a1a;
  --note: var(--espresso); --note-soft: #2c1e30;
  --warn: #d4850a; --warn-soft: #1e1408; --warn-line: #7a5010;
  --danger: #d44040; --danger-soft: #1e0e0e; --danger-line: #7a2828;
  --neutral-soft: var(--surface);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink);
  font-family: Inter, system-ui, sans-serif; font-size: 14.5px; line-height: 1.6;
  -webkit-font-smoothing: antialiased; transition: background .3s, color .3s; }
.serif { font-family: Fraunces, Georgia, serif; }
.app { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }

/* ── Header: twilight band ── */
header { position: sticky; top: 0; z-index: 10;
  background: linear-gradient(100deg,#2A1230 0%,#451A40 52%,#5E2046 100%);
  border-bottom: 1px solid rgba(232,162,61,.30);
  box-shadow: 0 1px 18px rgba(42,18,48,.28); padding: 0 24px; }
.top-inner { max-width: 1220px; margin: 0 auto; height: 64px;
  display: grid; grid-template-columns: 240px minmax(240px, 1fr) auto; gap: 20px; align-items: center; }
.wordmark { display: flex; align-items: center; gap: 10px;
  font-family: Fraunces, serif; font-weight: 600; font-size: 22px;
  letter-spacing: -.01em; color: #F6EFE2; white-space: nowrap; }
.glyph { width: 26px; height: 26px; flex-shrink: 0; }
.search-wrap { position: relative; }
.search-icon { position: absolute; left: 13px; top: 11px; opacity: .55; color: #F6EFE2; }
.search { width: 100%; height: 38px; border: 1px solid rgba(246,239,226,.18);
  background: rgba(246,239,226,.08); border-radius: 21px; padding: 0 16px 0 38px;
  font-size: 13.5px; color: #F6EFE2; font-family: Inter, system-ui, sans-serif; }
.search::placeholder { color: rgba(246,239,226,.5); }
.search:focus { outline: none; border-color: rgba(232,162,61,.5); background: rgba(246,239,226,.12); }
.bar-right { display: flex; align-items: center; gap: 14px; white-space: nowrap; }
.session-status { font-size: 12px; color: rgba(246,239,226,.72); display: flex; align-items: center; gap: 6px; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #F2C079;
  box-shadow: 0 0 8px rgba(242,192,121,.9); flex-shrink: 0; }
#sessionBadge { white-space: nowrap; }
.theme-toggle { border: 1px solid rgba(246,239,226,.25); background: transparent;
  color: rgba(246,239,226,.82); border-radius: 18px; height: 34px; padding: 0 14px;
  font-size: 12px; cursor: pointer; font-family: Inter, system-ui, sans-serif; font-weight: 500; }
.theme-toggle:hover { color: #F6EFE2; border-color: rgba(232,154,90,.6); }

/* ── 3-column shell ── */
.page { max-width: 1220px; margin: 0 auto; display: grid;
  grid-template-columns: 240px minmax(0,1fr) 290px; gap: 28px; padding: 28px 24px 48px; }
nav, .rail { align-self: start; position: sticky; top: 72px; }

/* ── Left nav ── */
nav { padding: 0; }
.owner-card { display: flex; align-items: center; gap: 12px; padding: 4px 8px 20px; }
.owner-card .avatar { width: 44px; height: 44px; flex-shrink: 0; font-size: 16px; }
.owner-name { font-weight: 600; font-size: 14px; color: var(--ink); overflow-wrap: anywhere; }
.owner-id { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
nav button { width: 100%; display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 2px; border: 1px solid transparent; border-left: 2px solid transparent;
  border-radius: 9px; background: transparent; color: var(--ink); padding: 9px 12px;
  text-align: left; cursor: pointer; font-weight: 450; font-size: 14.5px;
  font-family: Inter, system-ui, sans-serif; transition: background .15s; }
nav button span { color: var(--muted); font-weight: 400; font-size: 12px; }
nav button:hover { background: var(--surface); }
nav button.active { background: var(--surface); border-left-color: var(--ember); color: var(--ember); font-weight: 600; }
nav button.active span { color: var(--ember); opacity: .7; }
.signout-btn { width: 100%; margin-top: 4px; border: 1px solid var(--line) !important;
  border-radius: 9px !important; border-left: 1px solid var(--line) !important;
  font-size: 13px !important; color: var(--muted) !important; }
.signout-btn:hover { background: var(--surface) !important; color: var(--ink) !important; }
.nav-foot { margin-top: 22px; padding: 14px 12px; font-size: 12px; color: var(--muted);
  border-top: 1px solid var(--line); line-height: 1.5; }

/* ── Center feed ── */
main { min-width: 0; }
.summary-grid { display: none; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border: 1px solid var(--line); border-bottom: 0; background: var(--surface);
  padding: 10px 14px; border-radius: 10px 10px 0 0; }
.toolbar h2 { font-family: Fraunces, serif; font-size: 18px; font-weight: 600; color: var(--ink); letter-spacing: -.01em; }
.view-copy { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
.badge { border: 1px solid var(--line); border-radius: 20px; padding: 3px 10px;
  background: var(--surface); color: var(--muted); white-space: nowrap; font-size: 12px; }
.badge.owned { border-color: var(--active-line); background: var(--active-soft); color: var(--active); }
.badge.attention { border-color: var(--warn-line); background: var(--warn-soft); color: var(--warn); }
.badge.risk { border-color: var(--danger-line); background: var(--danger-soft); color: var(--danger); }
.badge.neutral { border-color: var(--line); background: var(--neutral-soft); color: var(--muted); }

/* ── Feed cards (items) ── */
.list { display: grid; gap: 18px; border: 1px solid var(--line); border-top: 0;
  border-radius: 0 0 10px 10px; padding: 18px; background: var(--paper); }
.item { border: 1px solid var(--line); border-radius: 14px; background: var(--surface);
  padding: 22px 24px; box-shadow: var(--shadow); display: grid; gap: 10px; }
.item[tabindex="0"] { cursor: pointer; transition: box-shadow .15s, border-color .15s; }
.item[tabindex="0"]:hover { border-color: var(--ember); box-shadow: 0 2px 12px rgba(90,33,80,.12); }
.item-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.item h3 { margin: 0 0 4px; font-family: Fraunces, serif; font-weight: 600; font-size: 18px;
  color: var(--ink); line-height: 1.3; letter-spacing: -.01em; }
.item-title-row { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.item-body { color: var(--ink); line-height: 1.6; font-size: 15px; }
.item-time { color: var(--muted); font-size: 12px; white-space: nowrap; }
.inspect-tag { color: var(--muted); border: 1px solid var(--line); background: var(--paper);
  border-radius: 20px; padding: 2px 10px; font-size: 11.5px; white-space: nowrap;
  cursor: pointer; transition: color .15s, border-color .15s; }
.inspect-tag:hover { color: var(--ember); border-color: var(--ember); }
/* Collapsed scope line — replaces 4-pill trust strip */
.scope { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); margin-top: 4px; }
.scope b { color: var(--ember); font-weight: 600; }
/* Hidden provenance detail block */
.meta-detail { display: none; margin-top: 8px; padding: 10px 12px; border: 1px solid var(--line);
  border-radius: 8px; background: var(--paper); font-size: 12px; color: var(--muted); line-height: 1.5; }
.meta-detail.open { display: block; }
/* Legacy meta/trust styles — kept for non-feed views (contacts, shared, approvals, etc.) */
.meta { display: flex; flex-wrap: wrap; gap: 6px; color: var(--muted); font-size: 11px; margin-top: 8px; }
.trust-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 6px; }
.trust-pill { border: 1px solid var(--line); border-radius: 8px; background: var(--paper); padding: 6px 8px; min-width: 0; }
.trust-label { display: block; color: var(--muted); font-size: 9.5px; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; }
.trust-value { display: block; overflow-wrap: anywhere; font-weight: 600; font-size: 12px; color: var(--ink); margin-top: 2px; }
.meta span { border: 1px solid var(--line); border-radius: 6px; padding: 3px 7px; background: var(--paper); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.detail-panel { border: 1px solid var(--line); border-bottom: 0; background: var(--surface); padding: 12px; display: grid; gap: 6px; border-radius: 8px 8px 0 0; }
.detail-title { font-weight: 600; font-family: Fraunces, serif; color: var(--ink); overflow-wrap: anywhere; font-size: 16px; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.detail-grid div { border: 1px solid var(--line); background: var(--paper); padding: 7px; min-width: 0;
  overflow-wrap: anywhere; border-radius: 6px; }
.actions button, .composer button, .empty-actions button { border: 1px solid var(--line); border-radius: 20px;
  background: var(--paper); color: var(--ink); padding: 7px 16px; cursor: pointer;
  font: inherit; font-weight: 500; font-size: 13.5px; transition: border-color .15s, background .15s; }
.actions button:hover, .composer button:hover { border-color: var(--ember); background: var(--accent-soft); }
.actions button.danger { border-color: var(--danger-line); background: var(--danger-soft); color: var(--danger); }
.actions button.primary, .composer button.primary, .empty-actions button.primary
  { border-color: var(--ember); background: var(--ember); color: #fff; font-weight: 600; }
.actions button.primary:hover, .composer button.primary:hover
  { background: var(--accent-dark); border-color: var(--accent-dark); }
.composer { border: 1px solid var(--line); border-radius: 14px; background: var(--surface);
  padding: 16px; margin-bottom: 18px; display: grid; gap: 10px; box-shadow: var(--shadow); }
.composer input, .composer textarea, .composer select { width: 100%; border: 1px solid var(--line);
  border-radius: 8px; padding: 8px 12px; font: inherit; background: var(--paper); color: var(--ink); font-size: 14.5px; }
.composer textarea { min-height: 80px; resize: vertical; }
.empty, .loading, .error { border: 1px dashed var(--line); border-radius: 12px;
  background: var(--surface); color: var(--muted); padding: 24px; }
.empty-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.skeleton { display: grid; gap: 10px; }
.skeleton-line { height: 12px; border-radius: 6px;
  background: linear-gradient(90deg, var(--line), var(--surface), var(--line));
  background-size: 200% 100%; animation: shimmer 1.4s infinite; }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.skeleton-line.short { width: 48%; }
.error { border-color: var(--danger-line); color: var(--danger); }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.5;
  background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px;
  color: var(--muted); border-radius: 0 0 8px 8px; }

/* ── Avatar ── */
.avatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
  background: var(--ember); color: #fff; font-family: Fraunces, serif; font-weight: 600; font-size: 15px;
  flex-shrink: 0; }
.avatar.mini { width: 32px; height: 32px; font-size: 12px; flex: 0 0 auto; }

/* ── Module (dev rail) ── */
.module { border: 1px solid var(--line); background: var(--surface); margin-bottom: 12px;
  padding: 12px; border-radius: 12px; }
.module h2 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--ink); }
.queue { display: grid; gap: 6px; }
.queue-row { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  border-bottom: 1px solid var(--line); padding-bottom: 6px; }
.queue-row:last-child { border-bottom: 0; padding-bottom: 0; }
.queue-row strong { overflow-wrap: anywhere; font-size: 13px; }
.activity-list { display: grid; gap: 6px; }
.activity-row { border-bottom: 1px solid var(--line); padding-bottom: 6px; display: grid; gap: 2px; cursor: pointer; }
.activity-row:last-child { border-bottom: 0; padding-bottom: 0; }
.activity-type { color: var(--ink); font-weight: 600; overflow-wrap: anywhere; font-size: 13px; }
.activity-note { color: var(--muted); overflow-wrap: anywhere; font-size: 12px; }

/* ── Right rail ── */
.rail { display: flex; flex-direction: column; gap: 0; }
.rail-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
  padding: 18px 20px; margin-bottom: 18px; box-shadow: var(--shadow); }
.rail-card-title { font-family: Fraunces, serif; font-size: 15px; font-weight: 600;
  color: var(--ink); margin: 0 0 4px; }
.rail-card-lede { font-size: 12.5px; color: var(--muted); margin-bottom: 14px; line-height: 1.5; }
.calm-row { font-size: 13.5px; color: var(--ink); display: flex; align-items: center; gap: 9px;
  padding: 6px 0; }
.calm-tick { width: 16px; height: 16px; border-radius: 50%; background: var(--ember); opacity: .18;
  flex-shrink: 0; }
.friends-list { display: flex; flex-direction: column; gap: 12px; }
.friend-row { display: flex; align-items: center; gap: 11px; }
.friend-name { font-size: 13.5px; font-weight: 500; color: var(--ink); }
.friend-sub { font-size: 11.5px; color: var(--muted); }
.rail-note { font-size: 11.5px; color: var(--muted); text-align: center; padding: 4px 0 12px;
  line-height: 1.5; }
.rail-note b { color: var(--ember); }
.dev-toggle { width: 100%; margin-top: 8px; border: 1px solid var(--line); border-radius: 9px;
  background: transparent; color: var(--muted); padding: 7px 12px; font-size: 12px;
  cursor: pointer; font-family: Inter, system-ui, sans-serif; transition: color .15s; }
.dev-toggle:hover { color: var(--ink); border-color: var(--ember); }

/* ── Profile / misc ── */
.profile-panel { border: 1px solid var(--line); background: var(--surface); margin-bottom: 12px;
  padding: 16px; display: grid; gap: 10px; border-radius: 14px; box-shadow: var(--shadow); }
.profile-head { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px; align-items: center; }
.profile-head .avatar { width: 56px; height: 56px; font-size: 20px; }
.profile-name { font-size: 17px; font-weight: 600; font-family: Fraunces, serif; color: var(--ink); overflow-wrap: anywhere; }
.profile-meta { color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
.invite-link { display: grid; gap: 4px; }
.invite-link-row { display: flex; gap: 8px; align-items: stretch; }
.invite-url { flex: 1 1 auto; min-width: 0; font-family: monospace; font-size: 12px;
  padding: 8px 10px; border: 1px solid var(--line); background: var(--paper); color: var(--ink);
  border-radius: 8px; }
.invite-steps { margin: 4px 0 0; padding-left: 18px; color: var(--ink); font-size: 13px; display: grid; gap: 6px; }
.invite-qr { display: grid; gap: 4px; justify-items: center; padding: 10px 0; }
.invite-qr-code { background: #fff; padding: 8px; border: 1px solid var(--line); border-radius: 8px;
  width: 184px; height: 184px; box-sizing: content-box; }
.invite-qr-code svg { display: block; width: 184px; height: 184px; }
.invite-qr-caption { color: var(--muted); font-size: 11px; }

/* ── Responsive ── */
@media (max-width: 960px) {
  header { position: static; height: auto; min-height: 60px; }
  .top-inner { grid-template-columns: 1fr; height: auto; padding: 12px 0; gap: 10px; }
  .page { grid-template-columns: 1fr; padding-top: 16px; }
  nav, .rail { position: static; }
  nav { display: grid; grid-template-columns: 1fr; gap: 4px; }
  nav button { margin: 0; }
  .trust-strip, .detail-grid { grid-template-columns: 1fr; }
}
</style>`;
