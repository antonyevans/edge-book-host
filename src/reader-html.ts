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

export interface ReaderContext {
  csrf_token: string;
  agent_online: boolean;
}

export function renderReaderHtml(ctx: ReaderContext): string {
  const csrfMeta = `<meta name="csrf-token" content="${escapeAttr(ctx.csrf_token)}">`;
  const initialBadge = ctx.agent_online ? "Hosted session active" : "Agent offline";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${csrfMeta}
  <title>Edge Book</title>
  ${READER_STYLES}
</head>
<body>
  <div class="app">
    <header>
      <div class="top-inner">
      <div class="product-mark">
        <h1>Edge Book</h1>
        <div class="product-subtitle">Local-first agent social workspace</div>
      </div>
      <input class="search" aria-label="Search local Edge Book data" placeholder="Search local friends, posts, messages">
      <div class="status">
        <span id="sessionBadge" class="badge">${escapeText(initialBadge)}</span>
      </div>
      </div>
    </header>
    <div class="page">
    <nav aria-label="Edge Book views">
      <div class="owner-card">
        <div class="avatar">EB</div>
        <div>
          <div id="ownerName" class="owner-name">Connecting...</div>
        <div id="ownerShort" class="owner-id">hosted session</div>
        </div>
      </div>
      <button data-view="profile">Profile <span id="profileCount">Owner</span></button>
      <button data-view="feed" class="active">Feed <span id="feedCount">Visible 0</span></button>
      <button data-view="contacts">Friends <span id="contactCount">Friends 0</span></button>
      <button data-view="messages">Messages <span id="messageCount">Total 0</span></button>
      <button data-view="posts">Post history <span id="postCount">Drafts 0</span></button>
      <button data-view="approvals">Approvals <span id="approvalCount">Pending 0</span></button>
      <button data-view="activity">Activity Log <span id="activityCount">Events 0</span></button>
      <button data-view="inspector">Inspector <span>Details</span></button>
      <form method="POST" action="/auth/logout" style="margin-top:12px">
        <input type="hidden" name="csrf" value="${escapeAttr(ctx.csrf_token)}">
        <button type="submit" style="width:100%">Sign out (forget this device)</button>
      </form>
    </nav>
    <main>
      <section id="summaryGrid" class="summary-grid" aria-label="Edge Book operational summary">
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
        <div class="loading">Loading Edge Book data from your agent...</div>
      </section>
    </main>
    <aside>
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
        <div class="view-copy">Data is <strong>owned at rest</strong> in your agent's filesystem. Traffic <strong>transits this host</strong>, which terminates TLS — organizer-readable in transit. No end-to-end claim. Avoid sharing secrets.</div>
      </div>
    </aside>
    </div>
  </div>
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
    audit: []
  };
  const titleByView = {
    profile: "Profile", feed: "Feed", contacts: "Friends and contacts",
    messages: "Messages", posts: "Post history", approvals: "Approvals",
    activity: "Activity Log", inspector: "Inspector"
  };
  const copyByView = {
    profile: "Owner identity, hosted session, relationship posture, and working history.",
    feed: "Relationship-gated updates with delivery and provenance context.",
    contacts: "Relationship state, grants, endpoints, and local moderation posture.",
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
  function item(title, body, facts, payload, classes, actions, trust, timestamp, avatar) {
    classes = classes || ""; actions = actions || ""; trust = trust || []; timestamp = timestamp || ""; avatar = avatar || "";
    const factHtml = facts.filter(Boolean).length ? meta(facts) : "";
    const timeHtml = timestamp ? '<span class="item-time">' + escapeHtml(timestamp) + '</span>' : "";
    const avatarHtml = avatar ? '<span class="avatar mini contact-avatar">' + escapeHtml(avatar) + '</span>' : "";
    return '<article class="item ' + classes + '" tabindex="0" data-payload="' + encodeURIComponent(JSON.stringify(payload)) + '"><div class="item-head"><div class="item-title-row">' + avatarHtml + '<div><h3>' + escapeHtml(title) + '</h3>' + timeHtml + '</div></div><span class="inspect-tag">Inspect</span></div><div class="item-body">' + escapeHtml(body || "") + '</div>' + (trust.length ? trustStrip(trust) : "") + factHtml + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</article>';
  }
  function renderEmpty(label) { return '<div class="empty">' + escapeHtml(label) + '</div>'; }
  function renderFeedEmpty() {
    return '<div class="empty">Nothing yet.<div class="empty-actions"><button type="button" class="primary" data-view-target="posts">Compose</button><button type="button" data-view-target="contacts">Invite a friend</button></div></div>';
  }
  function shortId(value) { const text = String(value || ""); return text.length > 18 ? text.slice(0, 18) + "..." : text; }
  function labelize(value) { return String(value || "n/a").replace(/_/g, " "); }
  function publicOwnerLabel() { return (state.me && state.me.display_name) || "Local owner"; }
  function initials(label) {
    const words = String(label || "EB").replace(/[^a-z0-9 ]/gi, " ").trim().split(/\\s+/).filter(Boolean);
    const text = ((words[0] && words[0][0]) || "E") + ((words[1] && words[1][0]) || (words[0] && words[0][1]) || "B");
    return text.toUpperCase();
  }
  function contactFor(agentId) { return state.contacts[agentId] || {}; }
  function agentLabel(agentId) {
    if (!agentId) return "Local owner";
    if (state.me && state.me.agent_id === agentId) return publicOwnerLabel();
    const contact = contactFor(agentId);
    return contact.display_name || (contact.aliases && contact.aliases[0]) || shortId(agentId);
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
    const content = document.getElementById("content");
    let html = "";
    if (state.view === "profile") {
      html = '<section class="profile-panel"><div class="profile-head"><div class="avatar">EB</div><div><div class="profile-name">' + escapeHtml(publicOwnerLabel()) + '</div><div class="profile-meta">Hosted session</div></div></div>' +
        trustStrip([
          ["session", "hosted active"],
          ["friends", friendContacts().length],
          ["pending approvals", pendingApprovals().length],
          ["activity events", state.audit.length]
        ]) +
        '<div class="view-copy">Endpoint and key material are kept out of the main profile surface; inspect technical evidence only when needed.</div></section>' +
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
      html = values(state.feedItems).map(function (feed) {
        const post = posts[feed.post_id] || {};
        const actions = [
          feed.read_state === "read" ? "" : action("Mark read", "feed-read", feed.feed_item_id),
          feed.hidden ? "" : action("Hide", "feed-hide", feed.feed_item_id, "danger")
        ].join("");
        return item(post.title || "Untitled feed item", post.body || "No post body loaded for this feed item.", [
          feed.read_state !== "read" ? "unread" : "",
          feed.hidden ? "hidden" : ""
        ], { feed: feed, post: post }, feed.hidden ? "warn" : "", actions, [
          ["relationship", labelize(contactFor(feed.origin_agent_id).relationship_state || "local")],
          ["visibility", labelize(post.visibility || "unknown")],
          ["source", labelize(post.source_basis || feed.origin_home || "unknown")],
          ["delivery", labelize(feed.delivery_route || "local")]
        ], "Posted " + timeLabel(post.published_at || post.updated_at || feed.received_at));
      }).join("") || renderFeedEmpty();
    }
    if (state.view === "contacts") {
      html = values(state.contacts).map(function (contact) {
        return item(contact.display_name || "Unnamed contact", (contact.aliases && contact.aliases[0]) || contact.card_url || peerEndpointLabel(contact), [
          state.mutes[contact.peer_agent_id] ? "muted" : "active"
        ], contact, contact.relationship_state === "blocked" ? "risk" : "", state.mutes[contact.peer_agent_id] ? "" : action("Mute", "contact-mute", contact.peer_agent_id), [
          ["relationship", labelize(contact.relationship_state)],
          ["grants", (contact.capability_grants || []).length],
          ["endpoint", (contact.known_endpoints || []).length ? "known" : "missing"],
          ["local posture", state.mutes[contact.peer_agent_id] ? "muted" : "active"]
        ], "", initials(contact.display_name || (contact.aliases && contact.aliases[0]) || contact.peer_agent_id));
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
  }
  function postJson(path, body) { return api(path, { method: "POST", body: JSON.stringify(body || {}) }); }
  async function runAction(name, id) {
    try {
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
      setText("ownerShort", "hosted session");
      const sets = await Promise.all([
        api("/api/contacts"),
        api("/api/posts"),
        api("/api/feed"),
        api("/api/approvals"),
        api("/api/audit")
      ]);
      const contacts = sets[0], posts = sets[1], feed = sets[2], approvals = sets[3], audit = sets[4];
      state.contacts = contacts.contacts;
      state.mutes = contacts.mutes;
      state.posts = posts.posts;
      state.feedItems = feed.feed_items;
      state.approvals = approvals.approvals;
      state.audit = audit.audit || [];
      const messageSets = await Promise.all(values(state.contacts).map(function (contact) {
        return api("/api/messages/" + encodeURIComponent(contact.peer_agent_id)).catch(function () { return { messages: [] }; });
      }));
      state.messages = messageSets.flatMap(function (set) { return set.messages || []; });
      setText("sessionBadge", "Hosted session active");
      render();
    } catch (error) {
      if (error.message === "agent_offline") {
        document.getElementById("content").innerHTML = '<div class="loading">Your agent is offline. The host holds nothing of your social graph at rest.</div>';
        setText("viewState", "Agent offline");
        setText("sessionBadge", "Agent offline");
        return;
      }
      throw error;
    }
  }
  document.querySelectorAll("nav button").forEach(function (button) {
    button.addEventListener("click", function () { state.view = button.dataset.view; render(); });
  });
  document.getElementById("content").innerHTML = skeleton();
  refresh().catch(function (err) {
    document.getElementById("content").innerHTML = '<div class="error">Failed to load: ' + escapeHtml(err.message || String(err)) + '</div>';
  });
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
:root {
  color-scheme: light;
  --bg: #eef2f4; --panel: #ffffff; --line: #c7d1d6; --text: #1d2a31; --muted: #5f7079;
  --accent: #116466; --accent-dark: #0a4244; --accent-soft: #dcefee;
  --active: #1f7a4f; --active-soft: #e5f5ec; --active-line: #a8d5bd;
  --note: #345995; --note-soft: #e8eef9; --ink: #12343b;
  --warn: #9a3412; --warn-soft: #fff7ed; --warn-line: #fed7aa;
  --danger: #b42318; --danger-soft: #fff7f6; --danger-line: #f0b5ae;
  --neutral-soft: #f4f7f8;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: "Lucida Grande", Tahoma, Verdana, Arial, sans-serif; font-size: 12px; }
.app { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }
header { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 16px; border-bottom: 1px solid #07383a; background: linear-gradient(#14797b, #0d5557); color: #ffffff; box-shadow: 0 1px 2px rgb(0 0 0 / 18%); }
.top-inner { width: min(1220px, 100%); margin: 0 auto; display: grid; grid-template-columns: 220px minmax(240px, 1fr) auto; gap: 12px; align-items: center; }
h1 { margin: 0; font-size: 20px; font-weight: 700; text-shadow: 0 -1px 0 rgb(0 0 0 / 25%); }
.product-mark { display: grid; gap: 2px; min-width: 0; }
.product-subtitle { color: #d8f1ef; font-size: 11px; overflow-wrap: anywhere; }
h2 { margin: 0; font-size: 13px; font-weight: 700; }
h3 { font-size: 14px; }
.search { width: 100%; height: 25px; border: 1px solid #07383a; border-radius: 2px; padding: 4px 8px; font: inherit; background: #f7fbfb; color: var(--text); box-shadow: inset 0 1px 1px rgb(0 0 0 / 12%); }
.status { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; color: #eef8f8; min-width: 0; }
.badge { border: 1px solid var(--line); border-radius: 3px; padding: 4px 7px; background: #f9fafb; color: var(--muted); white-space: nowrap; }
.badge.owned { border-color: var(--active-line); background: var(--active-soft); color: var(--active); }
.badge.attention { border-color: var(--warn-line); background: var(--warn-soft); color: var(--warn); }
.badge.risk { border-color: var(--danger-line); background: var(--danger-soft); color: var(--danger); }
.badge.neutral { border-color: var(--line); background: var(--neutral-soft); color: var(--muted); }
header .badge { border-color: #0a4244; background: rgb(255 255 255 / 14%); color: #ffffff; }
.page { width: min(1220px, 100%); margin: 0 auto; display: grid; grid-template-columns: 170px minmax(520px, 1fr) 250px; gap: 12px; padding: 14px 12px 28px; }
nav, aside { align-self: start; position: sticky; top: 56px; }
nav { padding: 0; }
nav button { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; border: 1px solid transparent; border-radius: 2px; background: transparent; color: var(--text); padding: 5px 6px; text-align: left; cursor: pointer; font-weight: 700; }
nav button span { color: var(--muted); font-weight: 400; }
nav button:hover { background: #e2ebef; }
nav button.active { border-color: #b7c5cc; background: #dbe7eb; color: var(--accent-dark); }
main { min-width: 0; }
aside { background: #f8fafb; border: 1px solid var(--line); padding: 10px; min-width: 0; color: #40535c; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--line); border-bottom: 0; background: #f7f9fa; padding: 7px 9px; }
.summary-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
.summary-card { min-height: 62px; border: 1px solid var(--line); border-radius: 4px; background: var(--panel); padding: 8px; display: grid; align-content: space-between; gap: 5px; }
.summary-label { color: var(--muted); font-size: 11px; line-height: 1.25; overflow-wrap: anywhere; }
.summary-value { font-size: 19px; font-weight: 700; color: var(--ink); }
.summary-card.warn { background: var(--warn-soft) !important; }
.summary-card.risk { background: var(--danger-soft) !important; }
.summary-card.active { background: var(--active-soft); border-color: #b5ddc9; }
.list { display: grid; gap: 10px; }
.item { border: 1px solid var(--line); border-radius: 3px; background: var(--panel); padding: 10px 12px; box-shadow: 0 1px 1px rgb(0 0 0 / 4%); display: grid; gap: 8px; }
.item[tabindex="0"] { cursor: pointer; }
.item[tabindex="0"]:hover { border-color: #8fbec0; box-shadow: 0 1px 3px rgb(0 0 0 / 10%); }
.item-head { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
.item h3 { margin: 0 0 6px; color: var(--accent-dark); font-size: 14px; line-height: 1.25; }
.item-title-row { display: flex; align-items: start; gap: 8px; min-width: 0; }
.item-body { color: var(--text); line-height: 1.45; }
.item-time { color: var(--muted); font-size: 11px; white-space: nowrap; }
.inspect-tag { color: var(--accent-dark); border: 1px solid #bfd8d9; background: #f1f8f8; border-radius: 2px; padding: 2px 5px; font-size: 11px; white-space: nowrap; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; color: var(--muted); font-size: 11px; margin-top: 8px; }
.trust-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 2px; }
.trust-pill { border: 1px solid var(--line); border-radius: 3px; background: #fbfcfd; padding: 5px 6px; min-width: 0; }
.trust-label { display: block; color: var(--muted); font-size: 9px; font-weight: 400; text-transform: uppercase; }
.trust-value { display: block; overflow-wrap: anywhere; font-weight: 700; font-size: 12px; color: var(--ink); }
.meta span { border: 1px solid var(--line); border-radius: 2px; padding: 3px 5px; background: #fbfcfd; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.view-copy { color: var(--muted); font-size: 11px; }
.detail-panel { border: 1px solid var(--line); border-bottom: 0; background: #f7f9fa; padding: 9px; display: grid; gap: 6px; }
.detail-title { font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.detail-grid div { border: 1px solid var(--line); background: #fff; padding: 5px; min-width: 0; overflow-wrap: anywhere; }
.actions button, .composer button, .empty-actions button { border: 1px solid var(--line); border-radius: 2px; background: #f3f6f7; color: var(--text); padding: 5px 8px; cursor: pointer; font: inherit; font-weight: 700; }
.actions button:hover, .composer button:hover { border-color: #9cc9ca; background: #eef7f7; }
.actions button.danger { border-color: var(--danger-line); background: var(--danger-soft); color: var(--danger); }
.actions button.primary, .composer button.primary, .empty-actions button.primary { border-color: var(--active-line); background: var(--active-soft); color: var(--active); }
.composer { border: 1px solid var(--line); border-radius: 3px; background: var(--panel); padding: 10px; margin-bottom: 10px; display: grid; gap: 8px; }
.composer input, .composer textarea, .composer select { width: 100%; border: 1px solid var(--line); border-radius: 2px; padding: 6px; font: inherit; background: #ffffff; color: var(--text); }
.composer textarea { min-height: 72px; resize: vertical; }
.empty, .loading, .error { border: 1px dashed var(--line); border-radius: 3px; background: var(--panel); color: var(--muted); padding: 16px; }
.empty-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.skeleton { display: grid; gap: 8px; }
.skeleton-line { height: 10px; border-radius: 2px; background: linear-gradient(90deg, #e7eef1, #f7fafb, #e7eef1); }
.skeleton-line.short { width: 48%; }
.error { border-color: #f3b4ad; color: var(--danger); }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 11px; line-height: 1.4; }
.module { border: 1px solid var(--line); background: var(--panel); margin-bottom: 10px; padding: 9px; }
.module h2 { margin-bottom: 7px; }
.owner-card { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 8px; align-items: center; margin-bottom: 10px; padding: 6px; }
.avatar { width: 36px; height: 36px; border-radius: 2px; display: grid; place-items: center; background: var(--accent); color: #ffffff; font-weight: 700; border: 1px solid var(--accent-dark); }
.avatar.mini { width: 30px; height: 30px; font-size: 11px; background: var(--note); border-color: #274472; flex: 0 0 auto; }
.owner-name { font-weight: 700; overflow-wrap: anywhere; }
.owner-id { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.queue { display: grid; gap: 6px; }
.queue-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e4ebef; padding-bottom: 5px; }
.queue-row:last-child { border-bottom: 0; padding-bottom: 0; }
.queue-row strong { overflow-wrap: anywhere; }
.profile-panel { border: 1px solid var(--line); background: var(--panel); margin-bottom: 10px; padding: 10px; display: grid; gap: 8px; }
.profile-head { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 10px; align-items: center; }
.profile-head .avatar { width: 52px; height: 52px; font-size: 16px; }
.profile-name { font-size: 16px; font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
.profile-meta { color: var(--muted); overflow-wrap: anywhere; }
.activity-list { display: grid; gap: 6px; }
.activity-row { border-bottom: 1px solid #e4ebef; padding-bottom: 6px; display: grid; gap: 2px; cursor: pointer; }
.activity-row:last-child { border-bottom: 0; padding-bottom: 0; }
.activity-type { color: var(--ink); font-weight: 700; overflow-wrap: anywhere; }
.activity-note { color: var(--muted); overflow-wrap: anywhere; }
@media (max-width: 920px) {
  header { position: static; height: auto; min-height: 54px; }
  .top-inner { grid-template-columns: 1fr; padding: 8px 0 10px; }
  .status { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  header .badge { min-width: 0; text-align: center; white-space: normal; }
  .page { grid-template-columns: 1fr; padding-top: 12px; }
  nav, aside { position: static; }
  nav { display: grid; grid-template-columns: 1fr; gap: 6px; }
  nav button { margin: 0; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .trust-strip, .detail-grid { grid-template-columns: 1fr; }
}
</style>`;
