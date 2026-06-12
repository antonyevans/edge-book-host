// Wire-frame schema generator (ea-claude-152).
//
// Generates the machine-readable contract artifacts from src/contracts.ts —
// the canonical seam shared (by spec, not by import) with edge-book-cli:
//
//   schemas/wire-frames.schema.json  — canonical JSON Schema (draft-07)
//   src/wire-schema.ts               — the same schema embedded as a const so
//                                      runtime code imports it without any
//                                      packaging/Dockerfile changes
//
// Usage:
//   npm run schemas         — regenerate both artifacts in place
//   npm run schemas:check   — regenerate to a temp dir and diff (exit 1 on
//                             drift; spec-0042 generator-equivalence rule)
//
// Determinism: object keys are sorted recursively before serialization so
// regeneration is byte-stable and diffs are clean.
//
// Forward compatibility: additionalProperties stays ABSENT (tolerated), never
// false — unknown fields from newer/older peers must pass at runtime.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = path.join("schemas", "wire-frames.schema.json");
const TS_OUT = path.join("src", "wire-schema.ts");

// The wire frames the schema covers — the host↔agent ws seam only (Contract 1
// transport + spec-096 handles + spec-097 receipts). Contract 2 types are the
// agent's authority model and are NOT wire frames.
const FRAME_TYPES = [
  "MailboxSendFrame",
  "MailboxSendOkFrame",
  "MailboxSendErrFrame",
  "MailboxDeliverFrame",
  "MailboxAckFrame",
  "MailboxStatusFrame",
  "MailboxStatusOkFrame",
  "MailboxStatusErrFrame",
  "HandleClaimFrame",
  "HandleClaimOkFrame",
  "HandleClaimErrFrame",
];
// Non-frame definitions the frames reference (or that ride inside them).
const AUX_TYPES = ["MailboxStatusEntry", "MailboxMessage"];

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

// Recursively sort object keys (arrays keep their order) for stable output.
function sortKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: { [k: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

function buildSchema(): JsonValue {
  const generator = createGenerator({
    path: path.join(ROOT, "src", "contracts.ts"),
    tsconfig: path.join(ROOT, "tsconfig.json"),
    type: "*",
    expose: "export",
    topRef: true,
    jsDoc: "none",
    // Unknown fields are tolerated at runtime (old/new client skew) — never
    // emit additionalProperties:false.
    additionalProperties: true,
    skipTypeCheck: false,
  });

  const definitions: { [k: string]: JsonValue } = {};
  for (const name of [...FRAME_TYPES, ...AUX_TYPES]) {
    const s = generator.createSchema(name) as { definitions?: Record<string, JsonValue> };
    const defs = s.definitions ?? {};
    if (!defs[name]) throw new Error(`generator produced no definition for ${name}`);
    for (const [defName, def] of Object.entries(defs)) {
      definitions[defName] = def; // shared refs (e.g. RecipientAddress) converge
    }
  }
  // Top-level union of all wire frames, for whole-frame validation.
  definitions.WireFrame = {
    anyOf: FRAME_TYPES.map((name) => ({ $ref: `#/definitions/${name}` })),
  };

  return sortKeys({
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "edge-book/wire-frames",
    description:
      "Host<->agent wire-frame contract, generated from src/contracts.ts (edge-book-host). Regenerate with `npm run schemas`; do not edit.",
    definitions,
  });
}

function renderTs(json: string): string {
  return [
    "// GENERATED FILE — DO NOT EDIT.",
    "// Source of truth: src/contracts.ts via scripts/generate-wire-schemas.ts.",
    "// Regenerate with `npm run schemas`; CI enforces sync via `npm run schemas:check`.",
    "// Identical content to schemas/wire-frames.schema.json (the canonical artifact),",
    "// embedded here so runtime code imports it without packaging changes.",
    "// (Embedded as one line so the 500-code-line file cap never bites.)",
    `export const WIRE_FRAMES_SCHEMA = ${JSON.stringify(JSON.parse(json))} as const;`,
    "",
  ].join("\n");
}

function main(): void {
  const schema = buildSchema();
  const json = JSON.stringify(schema, null, 2) + "\n";
  const ts = renderTs(json);
  const check = process.argv.includes("--check");

  if (!check) {
    fs.mkdirSync(path.join(ROOT, "schemas"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, JSON_OUT), json);
    fs.writeFileSync(path.join(ROOT, TS_OUT), ts);
    console.log(`wrote ${JSON_OUT} and ${TS_OUT}`);
    return;
  }

  // --check: regenerate to a temp dir and diff both artifacts (spec-0042).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wire-schemas-"));
  fs.writeFileSync(path.join(tmp, "wire-frames.schema.json"), json);
  fs.writeFileSync(path.join(tmp, "wire-schema.ts"), ts);
  let drift = false;
  for (const [rel, fresh] of [
    [JSON_OUT, path.join(tmp, "wire-frames.schema.json")],
    [TS_OUT, path.join(tmp, "wire-schema.ts")],
  ] as const) {
    const committed = fs.existsSync(path.join(ROOT, rel))
      ? fs.readFileSync(path.join(ROOT, rel), "utf8")
      : "<missing>";
    if (committed !== fs.readFileSync(fresh, "utf8")) {
      console.error(`DRIFT: ${rel} does not match regenerated output (run \`npm run schemas\`)`);
      drift = true;
    }
  }
  if (drift) process.exit(1);
  console.log("schemas:check ok — artifacts match src/contracts.ts");
}

main();
