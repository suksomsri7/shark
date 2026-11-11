# SURVEY — real-code name check for the next two RUNs: Inventory V2 and HR V2 (READ-ONLY surveyors · one lane each)

Why: both RUNs follow POS. Their designs (`ledger/DESIGN-INVENTORY-V2.md` — 8 screens / 28 work orders, `ledger/DESIGN-HR-V2.md` — 8 screens / 29 work orders, mockups `ledger/design-inventory/`, `ledger/design-hr/`) were written before the code was re-opened. The POS survey (`ledger/REVIEW-POS-DESIGN-2026-10-01.md` — read it first as the model for format and depth) found 18 design↔code conflicts; do the same here BEFORE any brief is written.
Rules: lane rules `ledger/pos-briefs/pos-brief-LANE-RULES.md`. Read commands only (cat/grep/sed -n/ls/git log/show/diff). No tsx/tsc/pnpm/node, no DB, no build, no edits to existing files. You create exactly ONE file (named below) in your worktree, written incrementally. Every fact gets file:line; mark CONFIRMED (traced) or PLAUSIBLE. Tables, compact, no restating of the design. You may open at most 8 mockup PNGs.

Report sections (same for both):
1. Name corrections — every model/field/enum/function/file/route/event/permission/cron named in the design → EXISTS / EXISTS under another name / NEW / CONTRADICTS code.
2. As-built data model of the module (full field lists of the core models, scoping axis tenant/system/unit, uniqueness, loose vs real FKs) + every writer/reader of the money- or quantity-bearing fields (function, file:line, entry points: page/action/route/AI tool/cron/consumer).
3. Money/quantity integrity as-built: counters and caches (e.g. `onHand`, average cost, leave balances, payroll totals) — read-modify-write vs atomic, idempotency keys, outbox events + consumers, what is reversed on void/cancel and what is not, Thai-day/+07:00 handling (flag raw getDay/getDate/new Date day maths), rounding rules.
4. Tenancy/authorization as-built: per server action/route/AI tool — how tenant/system/unit/actor permission are resolved; every place that trusts a client-supplied id or checks permission without the unit.
5. Integration points with POS V2 (catalogue `PosProduct`/`RecipeLine`, stock cut on sale/void/refund, stock count from POS, shifts ↔ HR attendance, PIN, commissions), Accounting (journal posting, which accounting system is chosen — note `inventory.receive` posts to the tenant's first accounting system even when the inventory system is not linked: `inventory/service.ts:390-397`), Member, CRM, Approval core — what exists, what the design assumes.
6. Design↔code conflicts that change a work order's scope, ordered by impact, each with a recommended ruling.
7. Existing oracles/regression suites for the module (file names under scripts/, what they cover) and gaps.
8. Live defects found on the way (security or money) — severity, file:line, scenario; do not fix.
Finish: commit the report on your wip branch (`--no-verify` allowed for this docs-only commit), push it. Final message ≤50 lines: top 10 items of §6 + every item of §8.

- Inventory lane: worktree `/root/projects/shark-pos-e`, file `ledger/REVIEW-INVENTORY-V2-DESIGN-2026-10-01.md`, branch `wip/survey-inventory-v2`. Scope: `src/lib/modules/inventory/**`, `prisma/schema/inventory.prisma`, inventory pages/actions/routes/AI tools, `account/inventory-link.ts`, purchase-order code wherever it lives.
- HR lane: worktree `/root/projects/shark-pos-b`, file `ledger/REVIEW-HR-V2-DESIGN-2026-10-01.md`, branch `wip/survey-hr-v2`. Scope: `src/lib/modules/hr/**`, `prisma/schema/hr*.prisma`, HR pages/actions/routes/AI tools/crons, payroll/attendance/leave, the SHARK STAFF app surface if present.
