// Reader client app — section 2 of 2 (split from reader-script.ts): the
// render() view dispatcher, actions (runAction/createPost), refresh/polling,
// nav wiring, and the /add deep-link boot. Concatenated verbatim into
// READER_SCRIPT (reader-script.ts) — same byte-identity + no-backtick rules
// as reader-script-helpers.ts.
export const READER_SCRIPT_APP = `  function render() {
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
        renderOwnProfileDetails() +
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
        return item(contactLabel(contact) || "Unnamed contact", (contact.aliases && contact.aliases[0]) || contact.card_url || peerEndpointLabel(contact), [
          state.mutes[contact.peer_agent_id] ? "muted" : "active"
        ], contact, contact.relationship_state === "blocked" ? "risk" : "", state.mutes[contact.peer_agent_id] ? "" : action("Mute", "contact-mute", contact.peer_agent_id), [
          ["relationship", labelize(contact.relationship_state)],
          ["grants", (contact.capability_grants || []).length],
          ["endpoint", (contact.known_endpoints || []).length ? "known" : "missing"],
          ["local posture", state.mutes[contact.peer_agent_id] ? "muted" : "active"]
        ], "", initials(contactLabel(contact) || contact.peer_agent_id))
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
`;
