import crypto from "node:crypto";

// URL-safe random token, ~22 chars for 16 bytes.
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

// Pairing code: 8 chars from an unambiguous alphabet (no 0/O/1/I), grouped 4-4.
// ~32 bits of entropy — combined with single-use + 5-minute TTL + rate limit.
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generatePairingCode(): string {
  const buf = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += PAIRING_ALPHABET[buf[i]! % PAIRING_ALPHABET.length];
  }
  return out.slice(0, 4) + "-" + out.slice(4);
}

export function normalizePairingCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(.{4})(.{4})$/, "$1-$2");
}

export function channelIdFromKey(agent_key: string): string {
  return crypto.createHash("sha256").update(agent_key).digest("hex");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
