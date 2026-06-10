// Reader client app — section 1 of 2 (split from reader-script.ts): state,
// api/headers plumbing, escaping, and every card/list/annotation renderer.
// Concatenated verbatim into READER_SCRIPT (reader-script.ts) — the assembled
// script must stay byte-identical and valid standalone JS
// (test/reader-script-syntax.test.ts parses the whole literal). Keep this a
// plain static template string: no interpolations, no backticks.
export const READER_SCRIPT_HELPERS = `(function () {
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
  // Name precedence (spec-098): profile.name -> owner_label -> display_name -> handle -> generic.
  function publicOwnerLabel() {
    if (!state.me) return "Local owner";
    return (state.me.profile && state.me.profile.name) || state.me.owner_label || state.me.display_name || state.me.handle || "Local owner";
  }
  // Same precedence for peers: shared friend-profile name first, then legacy fields.
  function contactLabel(contact) {
    return (contact.friend_profile && contact.friend_profile.name) || contact.owner_label || contact.display_name || (contact.aliases && contact.aliases[0]) || shortId(contact.peer_agent_id);
  }
  // The agent's own name — shown as a subtitle when it differs from the owner.
  function agentSubLabel() {
    if (!state.me) return "hosted session";
    var owner = publicOwnerLabel();
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
    // contactFor() returns {} for unknown agents, so fall back to the raw id.
    return contactLabel(contact) || shortId(agentId);
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
        var name = contactLabel(c);
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
`;
