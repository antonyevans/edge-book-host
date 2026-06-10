// Landing CSS — section 1 of 2 (split from reader-styles.ts): design tokens,
// landing shell/header, hero, and the pairing card + QR styles. Concatenated
// verbatim into LANDING_STYLES (reader-styles.ts) — the assembled stylesheet
// must stay byte-identical. Plain static template string only.
export const LANDING_SHELL_CSS = `  :root {
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

`;
