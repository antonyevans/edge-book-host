import crypto from "node:crypto";

export const RESERVED_HANDLES = new Set(["add", "healthz", "metrics", "agent", "api", "handle", "auth"]);
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export function isValidSlug(handle: string): boolean {
  return SLUG.test(handle) && !RESERVED_HANDLES.has(handle);
}

export function canonicalizeHost(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeHost).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalizeHost(obj[k])}`).join(",")}}`;
}

export function didFromPem(pem: string): string {
  return "did:openclaw:" + crypto.createHash("sha256").update(pem).digest("base64url").slice(0, 32);
}

export interface MinimalCard {
  agent_id: string;
  signature: string;
  public_keys?: Array<{ public_key_pem: string }>;
}

export type ClaimVerdict = "ok" | "bad_card" | "bad_sig";

export function verifyHandleClaim(card: MinimalCard, handle: string, claimed_at: number, claim_sig: string): ClaimVerdict {
  const pem = card.public_keys?.[0]?.public_key_pem;
  if (!pem || !card.agent_id || card.agent_id !== didFromPem(pem)) return "bad_card";
  const { signature, ...unsigned } = card as unknown as Record<string, unknown> & { signature: string };
  try {
    if (!crypto.verify(null, Buffer.from(canonicalizeHost(unsigned)), pem, Buffer.from(signature, "base64url"))) return "bad_card";
  } catch { return "bad_card"; }
  const payload = { handle, agent_did: card.agent_id, claimed_at };
  try {
    if (!crypto.verify(null, Buffer.from(canonicalizeHost(payload)), pem, Buffer.from(claim_sig, "base64url"))) return "bad_sig";
  } catch { return "bad_sig"; }
  return "ok";
}
