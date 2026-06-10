// Pairing-code page (split from reader-html.ts): the landing page served at
// /pair — hero, three-step setup, the pairing form (+ QR), and the
// how-it-works pipe diagram. Everything inline — strict CSP; all dynamic
// values pass escapeText/escapeAttr.
import { BROWSER_ICON_SVG, COPY_BUTTON_SCRIPT, FLOATING_ISLAND_SVG, HOST_ICON_SVG, PAIR_QR_SVG, VAULT_ICON_SVG } from "./reader-assets.js";
import { escapeAttr, escapeText } from "./reader-escape.js";
import { LANDING_STYLES } from "./reader-styles.js";

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
