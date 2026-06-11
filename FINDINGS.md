# FINDINGS — 2026-06-09 legibility refactor

No bugs or suspicious behavior found during the refactor. Behavior is
preserved exactly; no code paths were altered.

## Layer boundaries decision (2026-06-10, spec-0042)

dependency-cruiser was evaluated and **not adopted** at current repo size. The
codebase is organized as vertical feature modules (routes, channels, store,
reader generators) with no horizontal layer stack defined in DESIGN.md — there
is no forbidden import direction to encode. The one real boundary
(`vendor/reader-src/` is a one-way port, never imported) is enforced by
convention and review. Revisit if DESIGN.md ever defines module layers or the
module count grows past ~60 files.

## Reversions

Agent-written code substantially rewritten or reverted within 30 days of merge
gets one line here: date, PR, cause (spec-0041 phase 4). Reviewed in the
monthly gardening pass (spec-0038).

_None logged._
