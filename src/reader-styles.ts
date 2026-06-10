// Style sheets for every server-rendered page. LANDING_STYLES covers /pair,
// /agent-setup, /add, and the offline page; READER_STYLES is the reader app.
// Served inline (strict CSP, no external stylesheets).

export const LANDING_STYLES = `<style>
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
