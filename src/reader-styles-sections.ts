// Landing CSS — section 2 of 2 (split from reader-styles.ts): how-it-works
// pipe diagram, setup steps, footer, and the copy button. Concatenated
// verbatim into LANDING_STYLES (reader-styles.ts) — same byte-identity rule
// as reader-styles-landing.ts.
export const LANDING_SECTIONS_CSS = `  .how-section {
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
`;
