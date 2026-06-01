import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../src/rate-limit.js";

test("rate limiter: peek never counts; only failures lock; reset clears (ea-058)", () => {
  const rl = new RateLimiter(10, 60_000, 300_000);

  // Peeking any number of times never locks an IP out.
  for (let i = 0; i < 50; i++) {
    assert.equal(rl.peek("1.2.3.4").allowed, true, "peek does not accumulate");
  }

  // 10 failures stay under the bar; the 11th trips the lockout.
  for (let i = 0; i < 10; i++) {
    const r = rl.recordFailure("9.9.9.9");
    assert.equal(r.locked, false, `failure ${i + 1} should not lock yet`);
  }
  assert.equal(rl.peek("9.9.9.9").allowed, true, "still allowed at 10 failures");
  const trip = rl.recordFailure("9.9.9.9");
  assert.equal(trip.locked, true, "11th failure locks");
  assert.equal(rl.peek("9.9.9.9").allowed, false, "locked IP is blocked");

  // A successful pair resets the IP's failure budget.
  rl.reset("9.9.9.9");
  assert.equal(rl.peek("9.9.9.9").allowed, true, "reset clears the lockout");
});

test("rate limiter: a different IP is unaffected by another's lockout", () => {
  const rl = new RateLimiter(3, 60_000, 300_000);
  for (let i = 0; i < 4; i++) rl.recordFailure("a");
  assert.equal(rl.peek("a").allowed, false, "a is locked");
  assert.equal(rl.peek("b").allowed, true, "b is independent");
});
