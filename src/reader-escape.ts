// HTML escaping for server-rendered pages. Invariant: ALL interpolated
// dynamic values in reader pages pass escapeText/escapeAttr (strict CSP
// bounds the blast radius, but escaping is the first line).
export function escapeText(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function escapeAttr(value: string): string {
  return escapeText(value);
}
