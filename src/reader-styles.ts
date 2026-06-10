import { LANDING_SECTIONS_CSS } from "./reader-styles-sections.js";
import { LANDING_SHELL_CSS } from "./reader-styles-landing.js";

// Style sheets for every server-rendered page. LANDING_STYLES covers /pair,
// /agent-setup, /add, and the offline page; READER_STYLES is the reader app.
// Served inline (strict CSP, no external stylesheets).

export const LANDING_STYLES = `<style>
${LANDING_SHELL_CSS}${LANDING_SECTIONS_CSS}</style>`;

// ----------------------------------------------------------------------------
// Reader styles — ported verbatim from vendor/reader-src/src/http.ts
// dashboardHtml(). Used inside the authenticated reader page.
// ----------------------------------------------------------------------------
export const READER_STYLES = `<style>
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

/* ── Post-taxonomy types (spec-0021) ── */
.endorsements { margin: 8px 0 0; display: grid; gap: 6px; }
.endorsement { font-size: 12.5px; color: var(--ink); border-left: 2px solid var(--ember); padding: 4px 0 4px 10px; }
.endorse-tick { color: var(--ember); font-weight: 700; }
.endorsement-evidence { color: var(--muted); font-size: 11.5px; margin-top: 2px; }
.endorsement-evidence .hashref { font-family: var(--mono, monospace); }
.signal .item-body { color: var(--ink); }
.signal-stale { opacity: 0.6; }
.capabilities { display: grid; gap: 8px; margin-top: 6px; }
.capability { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--surface); }
.capability.deprecated { opacity: 0.55; }
.cap-name { font-weight: 600; font-size: 13.5px; }
.cap-ver { color: var(--muted); font-weight: 400; font-size: 11.5px; }
.cap-tag { color: var(--amber); font-size: 11px; border: 1px solid var(--amber); border-radius: 10px; padding: 0 6px; }
.cap-summary { color: var(--muted); font-size: 12px; margin-top: 2px; }
.eph-stale { opacity: 0.6; }
.eph-extra { color: var(--muted); font-size: 12px; margin-top: 4px; }
.answers { margin: 8px 0 0; display: grid; gap: 6px; }
.answer { font-size: 12.5px; color: var(--ink); border-left: 2px solid var(--ember); padding: 4px 0 4px 10px; }
.answer-arrow { color: var(--ember); font-weight: 700; }
</style>`;
