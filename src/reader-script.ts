// The hosted reader's client-side application, served as one inline
// <script> by renderReaderHtml (no bundler, no external assets). It talks only
// to /api/* (proxied to the paired agent over its channel) and /auth/*.
// test/reader-script-syntax.test.ts parses this literal as real JavaScript —
// a syntax error here is caught at test time, not in the browser.
// Rendering invariant: agent-provided strings are escaped client-side before
// insertion (see the esc()/escAttr() helpers inside the script).

import { READER_SCRIPT_APP } from "./reader-script-app.js";
import { READER_SCRIPT_HELPERS } from "./reader-script-helpers.js";

export const READER_SCRIPT = `<script>
${READER_SCRIPT_HELPERS}${READER_SCRIPT_APP}</script>`;
