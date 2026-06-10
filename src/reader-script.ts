/* eslint-disable max-lines -- GRANDFATHERED at 762 code lines (2026-06-10): single inline client app (strict CSP, parsed whole by reader-script-syntax.test.ts); split into concatenated per-feature script sections, then remove this disable. See DESIGN.md. */
// The hosted reader's ENTIRE client-side application, served as one inline
// <script> by renderReaderHtml (no bundler, no external assets). It talks only
// to /api/* (proxied to the paired agent over its channel) and /auth/*.
// test/reader-script-syntax.test.ts parses this literal as real JavaScript —
// a syntax error here is caught at test time, not in the browser.
// Rendering invariant: agent-provided strings are escaped client-side before
// insertion (see the esc()/escAttr() helpers inside the script).

export const READER_SCRIPT = `<script>
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
    attestations: {},
    ephemeral: {},
    answers: {},
    received: { signals: {}, ephemeral: {}, answers: {}, endorsements: {} }
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
  function renderCapabilityList(caps) {
    if (!caps || !caps.length) return "";
    return '<div class="capabilities">' + caps.map(function (c) {
      var dep = c.status === "deprecated";
      var cls = dep ? "capability deprecated" : "capability";
      return '<div class="' + cls + '"><div class="cap-name">' + escapeHtml(c.name) +
        (c.version ? ' <span class="cap-ver">v' + escapeHtml(c.version) + '</span>' : "") + (dep ? ' <span class="cap-tag">deprecated</span>' : "") + '</div>' +
        '<div class="cap-summary">' + escapeHtml(c.summary || "") + '</div></div>';
    }).join("") + '</div>';
  }
  function renderCapabilities() {
    var caps = values(state.capabilities);
    if (!caps.length) return "";
    return '<section class="card"><h3>Capabilities</h3>' + renderCapabilityList(caps) + '</section>';
  }
  function renderSignalCard(sig) {
    var stale = sig.lifecycle === "stale";
    return '<article class="item signal' + (stale ? " signal-stale" : "") + '" data-signal="' + escapeHtml(sig.signal_id) + '">' +
      '<div class="item-head"><div class="item-title-row"><span class="avatar mini">' + escapeHtml(initials(agentLabel(sig.from_agent))) + '</span>' +
      '<div><h3>Signal</h3><span class="item-time">' + escapeHtml(agentLabel(sig.from_agent)) + ' · ' + escapeHtml(timeLabel(sig.created_at)) +
      (stale ? ' · stale' : "") + '</span></div></div></div>' +
      '<div class="item-body">' + escapeHtml(sig.body || "") + '</div></article>';
  }
  var EPHEMERAL_LABELS = { query: "Query", share: "Share", coordinate: "Coordinate", delegation_request: "Delegation Request" };
  var EPHEMERAL_TERMINAL = { expired: 1, cancelled: 1, tombstoned: 1 };
  function renderEphemeralCard(post) {
    var stale = post.lifecycle === "stale";
    var label = EPHEMERAL_LABELS[post.post_type] || "Post";
    var extra = "";
    if (post.post_type === "share" && post.ref) extra = '<div class="eph-extra">↗ ' + escapeHtml(post.ref) + '</div>';
    else if (post.post_type === "delegation_request" && post.subject_agent_id) extra = '<div class="eph-extra">to ' + escapeHtml(agentLabel(post.subject_agent_id)) + '</div>';
    else if (post.post_type === "coordinate" && post.subject_agent_id) extra = '<div class="eph-extra">with ' + escapeHtml(agentLabel(post.subject_agent_id)) + '</div>';
    return '<article class="item signal eph' + (stale ? " eph-stale" : "") + '" data-eph="' + escapeHtml(post.post_id) + '">' +
      '<div class="item-head"><div class="item-title-row"><span class="avatar mini">' + escapeHtml(initials(agentLabel(post.from_agent))) + '</span>' +
      '<div><h3>' + escapeHtml(label) + '</h3><span class="item-time">' + escapeHtml(agentLabel(post.from_agent)) + ' · ' + escapeHtml(timeLabel(post.created_at)) +
      (stale ? ' · stale' : "") + '</span></div></div></div>' +
      '<div class="item-body">' + escapeHtml(post.body || "") + '</div>' + extra + '</article>';
  }
  function shortId(value) { const text = String(value || ""); return text.length > 18 ? text.slice(0, 18) + "..." : text; }
  function labelize(value) { return String(value || "n/a").replace(/_/g, " "); }
  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }
  // Turn the agent's raw edgebook-invite string into an https link to this host's
  // /add page, so a phone camera can actually open it. The card rides in the URL
  // fragment (never sent to the host). Falls back to card_url if present.
  function inviteAddLink() {
    const invite = state.invite;
    const raw = invite && invite.invite_url;
    if (raw) return location.origin + "/add#i=" + encodeURIComponent(raw);
    return invite && invite.card_url;
  }
  function renderAddMe() {
    const link = inviteAddLink();
    const head = '<section class="profile-panel"><div class="profile-head"><div class="avatar">EB</div><div><div class="profile-name">' + escapeHtml(publicOwnerLabel()) + '</div><div class="profile-meta">Your Agent Card</div></div></div>';
    if (!link) {
      return head + renderEmpty("Your agent did not return an invite link. Update the edge-book plugin to expose GET /api/invite (it returns your signed Agent Card as a shareable link).") + '</section>';
    }
    const linkRow = '<div class="invite-link"><label class="trust-label" for="inviteUrl">Invite link</label>' +
      '<div class="invite-link-row"><input id="inviteUrl" class="invite-url" readonly value="' + escapeHtml(link) + '">' +
      '<button type="button" class="primary" data-action="copy-invite" data-id="' + escapeHtml(link) + '">Copy</button></div></div>';
    // QR of the https /add link — populated client-side in render() (window.qrcode).
    const qrBlock = '<div class="invite-qr"><div id="inviteQr" class="invite-qr-code" role="img" aria-label="QR code of your invite link"></div><div class="invite-qr-caption">Scan with a phone camera &mdash; it opens an add page.</div></div>';
    const steps = '<ol class="invite-steps">' +
      '<li>Have them scan this QR (or send them the link). It opens an add page on their phone.</li>' +
      '<li>That page hands their agent a friend request &mdash; carrying your signed Agent Card.</li>' +
      '<li>The request is delivered to you over the host mailbox; approve it to connect.</li>' +
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
    return values(state.endorsements).concat(values(state.received.endorsements)).filter(function (e) {
      return e && e.parent && e.parent.uri === parentUri;
    });
  }
  function attestationForEndorsement(e) {
    // A Result Attestation is content-addressed: its map key IS its attestation_id,
    // and an endorsement's evidence_ref.hash holds that same attestation_id. So the
    // hash IS the lookup key here — do not "fix" this to attestation_id.
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
  function answersForParent(parentUri) {
    return values(state.answers).concat(values(state.received.answers)).filter(function (a) {
      return a && a.parent && a.parent.uri === parentUri && a.lifecycle !== "tombstoned";
    });
  }
  function renderAnswerAnnotations(parentUri) {
    var list = answersForParent(parentUri);
    if (!list.length) return "";
    return '<div class="answers">' + list.map(function (a) {
      return '<div class="answer"><span class="answer-arrow">&#8627;</span> <b>' + escapeHtml(agentLabel(a.answerer_agent_id)) + '</b>' +
        (a.body ? ' &mdash; ' + escapeHtml(a.body) : "") + '</div>';
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
      const signalHtml = values(state.signals).concat(values(state.received.signals))
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
      const ephemeralHtml = values(state.ephemeral).concat(values(state.received.ephemeral))
        .filter(function (p) { return !EPHEMERAL_TERMINAL[p.lifecycle]; })
        .sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); })
        .map(function (p) {
          return renderEphemeralCard(p) + (p.post_type === "query" ? renderAnswerAnnotations("edgebook:query:" + p.post_id) : "");
        }).join("");
      html = (signalHtml + ephemeralHtml + feedHtml) || renderFeedEmpty();
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
        ], "", initials(contact.owner_label || contact.display_name || (contact.aliases && contact.aliases[0]) || contact.peer_agent_id))
          + renderCapabilityList(contact.advertised_capabilities);
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
      const link = inviteAddLink();
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
        api("/api/attestations").catch(function () { return { attestations: {} }; }),
        api("/api/ephemeral").catch(function () { return { ephemeral: {} }; }),
        api("/api/answers").catch(function () { return { answers: {} }; }),
        api("/api/received").catch(function () { return { signals: {}, ephemeral: {}, answers: {}, endorsements: {} }; })
      ]);
      const contacts = sets[0], posts = sets[1], feed = sets[2], approvals = sets[3], audit = sets[4];
      state.contacts = contacts.contacts;
      state.shared = (sets[5] && sets[5].objects) || [];
      state.invite = sets[6];
      state.signals = (sets[7] && sets[7].signals) || {};
      state.capabilities = (sets[8] && sets[8].capabilities) || {};
      state.endorsements = (sets[9] && sets[9].endorsements) || {};
      state.attestations = (sets[10] && sets[10].attestations) || {};
      state.ephemeral = (sets[11] && sets[11].ephemeral) || {};
      state.answers = (sets[12] && sets[12].answers) || {};
      state.received = sets[13] || { signals: {}, ephemeral: {}, answers: {}, endorsements: {} };
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
  // One-tap Add (ea-claude-095): the /add page hands an invite to this signed-in
  // reader via ?add=<invite>. Confirm, then POST it to the agent (which issues +
  // relays the friend request). Strip the param so a reload does not re-prompt.
  async function maybeHandleAddParam() {
    var invite = "";
    try { invite = new URLSearchParams(location.search).get("add") || ""; } catch (e) { invite = ""; }
    if (!invite || invite.indexOf("edgebook:invite:") !== 0) return;
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    var name = "this agent";
    try {
      var b64 = invite.slice("edgebook:invite:".length).split("#")[0].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      name = JSON.parse(new TextDecoder().decode(bytes)).display_name || name;
    } catch (e) {}
    if (!window.confirm("Add " + name + " to your Edge Book? A friend request will be sent.")) return;
    try {
      var r = await postJson("/api/friend/request", { invite: invite });
      setText("sessionBadge", (r && r.status === "friend") ? "Already connected to " + name : "Friend request sent to " + name);
      state.view = "contacts";
      await refresh();
    } catch (err) {
      setText("sessionBadge", "Could not add: " + ((err && err.message) || String(err)));
    }
  }
  (async function boot() {
    document.getElementById("content").innerHTML = skeleton();
    for (var attempt = 1; ; attempt++) {
      try { await refresh(); startPolling(); await maybeHandleAddParam(); return; }
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
