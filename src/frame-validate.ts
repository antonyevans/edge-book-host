// Runtime wire-frame validation (ea-claude-152) — dependency-free.
//
// Interprets the JSON-Schema subset actually present in the generated
// WIRE_FRAMES_SCHEMA (src/wire-schema.ts, generated from src/contracts.ts):
// $ref into definitions, type (object/string/number/boolean/array), const,
// enum, required, properties, items, anyOf. Unknown properties PASS — the
// contract never sets additionalProperties:false, so old/new client skew is
// tolerated. Error collection caps at MAX_ERRORS.
//
// `gateInboundFrame` is the host's fail-closed seam guard: it maps the inbound
// agent frame types the schema covers to their definitions and, on invalid
// input, hands back the protocol's error reply (or null = drop silently).
import { WIRE_FRAMES_SCHEMA } from "./wire-schema.js";

type Schema = Record<string, unknown>;

const DEFINITIONS = (WIRE_FRAMES_SCHEMA as { definitions: Record<string, Schema> }).definitions;
const MAX_ERRORS = 5;

export type ValidateResult = { ok: true } | { ok: false; errors: string[] };

export function validateWireFrame(defName: string, value: unknown): ValidateResult {
  const def = Object.prototype.hasOwnProperty.call(DEFINITIONS, defName)
    ? DEFINITIONS[defName]
    : undefined;
  if (!def) return { ok: false, errors: [`unknown schema definition: ${defName}`] };
  const errors: string[] = [];
  check(def, value, "$", errors);
  return errors.length ? { ok: false, errors } : { ok: true };
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function check(schema: Schema, value: unknown, at: string, errors: string[]): void {
  if (errors.length >= MAX_ERRORS) return;

  const ref = schema.$ref;
  if (typeof ref === "string") { checkRef(ref, value, at, errors); return; }

  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf)) {
    const matched = anyOf.some((branch) => {
      const branchErrors: string[] = [];
      check(branch as Schema, value, at, branchErrors);
      return branchErrors.length === 0;
    });
    if (!matched) errors.push(`${at}: matched no anyOf branch`);
    return;
  }

  if ("const" in schema && value !== schema.const) {
    errors.push(`${at}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
    return;
  }
  const allowed = schema.enum;
  if (Array.isArray(allowed) && !allowed.some((v) => v === value)) {
    errors.push(`${at}: ${JSON.stringify(value)} not in enum ${JSON.stringify(allowed)}`);
    return;
  }

  const type = schema.type;
  if (typeof type === "string") {
    const actual = typeOf(value);
    if (type === "object" ? actual !== "object" : actual !== type) {
      errors.push(`${at}: expected ${type}, got ${actual}`);
      return;
    }
  }

  if (type === "object") checkObject(schema, value as Record<string, unknown>, at, errors);
  if (type === "array" && Array.isArray(value)) checkArray(schema, value, at, errors);
}

function checkRef(ref: string, value: unknown, at: string, errors: string[]): void {
  const name = ref.replace("#/definitions/", "");
  const target = Object.prototype.hasOwnProperty.call(DEFINITIONS, name)
    ? DEFINITIONS[name]
    : undefined;
  if (!target) { errors.push(`${at}: unresolvable $ref ${ref}`); return; }
  check(target, value, at, errors);
}

function checkObject(schema: Schema, obj: Record<string, unknown>, at: string, errors: string[]): void {
  const required = schema.required;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (errors.length >= MAX_ERRORS) return;
      if (!(typeof key === "string" && key in obj)) errors.push(`${at}: missing required property "${String(key)}"`);
    }
  }
  const properties = schema.properties;
  if (properties && typeof properties === "object") {
    for (const [key, propSchema] of Object.entries(properties as Record<string, Schema>)) {
      if (errors.length >= MAX_ERRORS) return;
      if (key in obj) check(propSchema, obj[key], `${at}.${key}`, errors);
    }
  }
  // Properties NOT in the schema pass untouched (forward compatibility).
}

function checkArray(schema: Schema, value: unknown[], at: string, errors: string[]): void {
  const items = schema.items;
  if (items && typeof items === "object" && !Array.isArray(items)) {
    for (let i = 0; i < value.length; i++) {
      if (errors.length >= MAX_ERRORS) return;
      check(items as Schema, value[i], `${at}[${i}]`, errors);
    }
  }
}

// ── Inbound seam gate (fail closed) ──────────────────────────────────────────
// Inbound agent frame types the schema covers, with the protocol's error reply
// for an invalid instance. `reply: null` = drop silently (no error frame
// exists for that type in docs/wire-protocol.md).
const INBOUND_GATES: Record<string, { def: string; reply: ((request_id: string) => Record<string, unknown>) | null }> = {
  mailbox_send: {
    def: "MailboxSendFrame",
    reply: (request_id) => ({ type: "mailbox_send_err", request_id, error: "invalid_mailbox_send" }),
  },
  mailbox_ack: { def: "MailboxAckFrame", reply: null },
  mailbox_status: {
    def: "MailboxStatusFrame",
    reply: (request_id) => ({ type: "mailbox_status_err", request_id, error: "invalid_mailbox_status" }),
  },
  handle_claim: {
    def: "HandleClaimFrame",
    reply: (request_id) => ({ type: "handle_claim_err", request_id, reason: "bad_format" }),
  },
};

export type GateResult =
  | { ok: true }
  | { ok: false; errors: string[]; reply: Record<string, unknown> | null };

/** Validate an inbound frame against the contract BEFORE handler logic runs.
 *  Frame types the schema does not cover pass through untouched. */
export function gateInboundFrame(frame: Record<string, unknown>): GateResult {
  const type = frame.type;
  const gate = typeof type === "string" && Object.prototype.hasOwnProperty.call(INBOUND_GATES, type)
    ? INBOUND_GATES[type]
    : undefined;
  if (!gate) return { ok: true };
  const result = validateWireFrame(gate.def, frame);
  if (result.ok) return { ok: true };
  const request_id = typeof frame.request_id === "string" ? frame.request_id : "";
  return { ok: false, errors: result.errors, reply: gate.reply ? gate.reply(request_id) : null };
}
