import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import { WebSocket } from "ws";

// Set NODE_ENV=test before importing the server so its auto-listen block is
// skipped — the test owns the listen() call.
process.env.NODE_ENV = "test";
process.env.COOKIE_INSECURE = "1";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ebh-"));

const mod = await import("../src/server.js");
const { server, store, channels } = mod;

let started = false;
export async function startServer(): Promise<{ baseUrl: string; wsUrl: string; close: () => Promise<void> }> {
  if (!started) {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    started = true;
  }
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const wsUrl = `ws://127.0.0.1:${addr.port}/agent/ws`;
  return {
    baseUrl,
    wsUrl,
    // closeAllConnections: a failing assertion can leave agent sockets open;
    // without this, server.close() waits on them and a red run hangs forever.
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => { started = false; r(); }); })
  };
}

export { store, channels };

// Minimal in-test agent: dials in, completes hello, optionally answers api_request.
export async function spawnAgent(wsUrl: string, opts: {
  agent_key?: string;
  handle?: (frame: Record<string, unknown>, send: (f: Record<string, unknown>) => void) => void;
}): Promise<{ ws: WebSocket; channel_id: string; close: () => void }> {
  const agent_key = opts.agent_key || `ed25519:test-${Math.random().toString(36).slice(2)}`;
  const ws = new WebSocket(wsUrl);
  const channel_id: string = await new Promise((resolve, reject) => {
    ws.once("open", () => {
      ws.send(JSON.stringify({ type: "hello", agent_key, version: "test", nonce: "n" }));
    });
    ws.once("message", (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame.type === "hello_ok") resolve(frame.channel_id);
      else reject(new Error(frame.error || "hello_failed"));
    });
    ws.once("error", reject);
  });
  ws.on("message", (raw) => {
    const frame = JSON.parse(raw.toString()) as Record<string, unknown>;
    if (frame.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
    if (opts.handle) opts.handle(frame, (f) => ws.send(JSON.stringify(f)));
  });
  return { ws, channel_id, close: () => ws.close() };
}

export async function fetchJson(url: string, init: RequestInit = {}): Promise<{ status: number; body: any; headers: Headers }> {
  const r = await fetch(url, init);
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* leave as text */ }
  return { status: r.status, body, headers: r.headers };
}
