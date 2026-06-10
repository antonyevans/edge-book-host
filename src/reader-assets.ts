// Inline SVG / icon assets and the copy-button helper script for the
// landing, pair, setup, and offline pages. All inline so the strict CSP
// (no remote fetches) holds.

// ----------------------------------------------------------------------------
// Landing-page assets (used by /pair and the agent-offline page).
// Visual direction = "workshop console" (extends the reader aesthetic into a
// more breathable hero), with a floating-island motif borrowed from the Edge
// City visual identity. All assets inline so the strict CSP needs no remote
// fetches.
// ----------------------------------------------------------------------------

export const FLOATING_ISLAND_SVG = `<svg viewBox="0 0 480 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A small floating island carrying a cluster of buildings, suspended in a soft sky">
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
export const PAIR_QR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 31 31" shape-rendering="crispEdges" role="img" aria-label="QR code linking to the pairing page"><path fill="#ffffff" d="M0 0h31v31H0z"/><path stroke="#0a4244" d="M1 1.5h7m2 0h1m5 0h5m2 0h7M1 2.5h1m5 0h1m2 0h1m1 0h2m4 0h1m4 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m1 0h2m7 0h1m2 0h1m1 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h3m2 0h3m1 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m1 0h1m4 0h3m1 0h1m2 0h1m1 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h6m4 0h2M1 9.5h1m1 0h5m5 0h1m1 0h4m2 0h1m1 0h5M2 10.5h4m2 0h2m7 0h7m1 0h1m3 0h1M3 11.5h1m3 0h1m3 0h2m3 0h2m3 0h1m1 0h3M5 12.5h1m2 0h1m2 0h1m3 0h2m2 0h3m2 0h3m1 0h1M1 13.5h2m3 0h2m2 0h3m5 0h1m1 0h1m5 0h2M2 14.5h1m1 0h2m4 0h1m1 0h1m1 0h2m1 0h2m1 0h6m3 0h1M3 15.5h1m1 0h1m1 0h4m2 0h5m1 0h1m2 0h1m1 0h1m1 0h2M1 16.5h1m1 0h1m7 0h4m1 0h1m5 0h4m2 0h1M2 17.5h4m1 0h1m1 0h3m1 0h1m1 0h2m1 0h3m5 0h2M1 18.5h1m1 0h2m3 0h2m1 0h1m1 0h1m3 0h9m1 0h1m1 0h1M1 19.5h1m3 0h1m1 0h1m1 0h3m1 0h1m2 0h1m1 0h1m2 0h1m1 0h1m1 0h1m1 0h1M1 20.5h1m1 0h4m1 0h1m2 0h1m1 0h1m1 0h2m2 0h1m1 0h1m1 0h3m2 0h1M1 21.5h1m1 0h2m2 0h1m5 0h1m2 0h3m1 0h6m1 0h3M9 22.5h2m2 0h3m1 0h1m1 0h1m1 0h1m3 0h5M1 23.5h7m4 0h6m2 0h2m1 0h1m1 0h3M1 24.5h1m5 0h1m1 0h2m1 0h1m1 0h1m2 0h1m1 0h1m1 0h1m3 0h1m3 0h1M1 25.5h1m1 0h3m1 0h1m1 0h1m3 0h1m1 0h1m2 0h1m2 0h5m1 0h2M1 26.5h1m1 0h3m1 0h1m1 0h2m3 0h1m4 0h3m4 0h4M1 27.5h1m1 0h3m1 0h1m1 0h2m4 0h2m4 0h8M1 28.5h1m5 0h1m3 0h1m1 0h3m1 0h1m3 0h1m1 0h4m1 0h1M1 29.5h7m1 0h1m3 0h6m1 0h1m2 0h3m1 0h1"/></svg>`;

export const BROWSER_ICON_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="6" y="10" width="52" height="44" rx="3" fill="#fbfaf6" stroke="#0a4244" stroke-width="2"/>
  <rect x="6" y="10" width="52" height="11" rx="3" fill="#116466"/>
  <circle cx="12" cy="15.5" r="1.6" fill="#fbfaf6"/>
  <circle cx="17" cy="15.5" r="1.6" fill="#fbfaf6"/>
  <circle cx="22" cy="15.5" r="1.6" fill="#fbfaf6"/>
  <rect x="14" y="28" width="36" height="3" fill="#0a4244" opacity="0.55"/>
  <rect x="14" y="35" width="28" height="3" fill="#0a4244" opacity="0.35"/>
  <rect x="14" y="42" width="32" height="3" fill="#0a4244" opacity="0.45"/>
</svg>`;

export const HOST_ICON_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M8 28 L32 12 L56 28" fill="none" stroke="#0a4244" stroke-width="2" stroke-linejoin="round"/>
  <rect x="14" y="28" width="36" height="26" fill="#dcefee" stroke="#0a4244" stroke-width="2"/>
  <path d="M20 54 L20 38 L28 38 L28 54 Z" fill="#116466"/>
  <rect x="34" y="38" width="14" height="8" fill="#fbfaf6" stroke="#0a4244" stroke-width="1.4"/>
  <line x1="32" y1="28" x2="32" y2="12" stroke="#116466" stroke-width="2"/>
  <circle cx="32" cy="10" r="2" fill="#9a3412"/>
</svg>`;

export const VAULT_ICON_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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

export const COPY_BUTTON_SCRIPT = `<script>
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
