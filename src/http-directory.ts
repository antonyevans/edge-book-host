// Directory endpoint (spec-136): public paginated listing of discoverable handles.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostStore } from "./store.js";

export function handleDirectory(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  store: HostStore,
  sendJson: (res: ServerResponse, status: number, body: unknown) => void,
): void {
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10);
  const offsetRaw = parseInt(url.searchParams.get("offset") ?? "", 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 100 : limitRaw, 1), 500);
  const offset = Math.max(isNaN(offsetRaw) ? 0 : offsetRaw, 0);
  const { handles, total } = store.listHandles({ offset, limit });
  const entries = handles.map((rec) => {
    const card = rec.card as { display_name?: string; owner_label?: string } | null | undefined;
    const entry: { handle: string; display_name: string; owner_label?: string; claimed_at: number } = {
      handle: rec.handle,
      display_name: (typeof card?.display_name === "string" && card.display_name) ? card.display_name : rec.handle,
      claimed_at: rec.claimed_at,
    };
    if (typeof card?.owner_label === "string" && card.owner_label) {
      entry.owner_label = card.owner_label;
    }
    return entry;
  });
  sendJson(res, 200, { handles: entries, total });
}
