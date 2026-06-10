import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReaderHtml } from "../src/reader-html.js";
const html = renderReaderHtml({ csrf_token: "t", agent_online: true });

test("owner label prefers profile.name, then legacy fields, then handle", () => {
  assert.match(html, /state\.me\.profile && state\.me\.profile\.name/);
  assert.match(html, /state\.me\.handle/);
});

test("reader has a shared contactLabel helper using friend_profile.name first", () => {
  assert.match(html, /function contactLabel/);
  assert.match(html, /contact\.friend_profile && contact\.friend_profile\.name/);
});

test("reader has a renderSocialLinks helper with safe external links", () => {
  assert.match(html, /function renderSocialLinks/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
  assert.match(html, /target="_blank"/);
});

test("profile view renders bio, location, and socials from state.me.profile", () => {
  assert.match(html, /renderOwnProfileDetails\(\)/);
  assert.match(html, /profile-bio/);
});

test("profile view has an empty state when no profile is set", () => {
  assert.match(html, /No profile yet/);
});

test("social allowlist lookup is own-property safe (no prototype-key bypass)", () => {
  assert.match(html, /hasOwnProperty\.call\(SOCIAL_LINK_LABELS/);
});

test("contact rows render the peer's shared friend_profile bio and socials", () => {
  assert.match(html, /contact\.friend_profile\.bio/);
  assert.match(html, /renderSocialLinks\(contact\.friend_profile\.socials\)/);
});
