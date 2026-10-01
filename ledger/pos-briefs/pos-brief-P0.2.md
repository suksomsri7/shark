# P0.2 — POS op registry skeleton (builder · lane 2 · worktree /root/projects/shark-pos-b)

Read first (the briefs live in the lane-1 tree — read-only for you): `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-LANE-RULES.md` (binding) → `pos-brief-COMMON.md` → `ledger/crm-briefs/crm-brief-COMMON.md` → `ledger/POS-API.md` (whole file) → `ledger/POS-MASTER-PLAN.md` §1, §4 rows P0.2 and P2.13.
Exemplars (read the real code): `src/lib/api/op.ts` + `src/lib/api/dispatch.ts`, `src/lib/modules/account/api/registry.ts` (+ one `ops/*.ts`), `src/lib/modules/crm/api/registry.ts`, `src/lib/modules/kanban/api/registry.ts` (smallest), how a registry feeds AI tools (`src/lib/ai/tools-kanban.ts` / `tools-crm.ts`), `src/lib/ai/skills.ts` (`assertSkillRegistryComplete`), fitness F10.1 and F13.10–F13.12 in `scripts/fitness.mts`.

Context: today POS has no registry. The AI skill at `src/lib/ai/skills.ts` (the entry listing `sales_summary, sales_by_day, pos_create_sale, void_sale, record_expense, financial_summary`) exposes 6 hand-written tools in `src/lib/ai/tools.ts`. The plan says: "`pos/api/registry.ts` skeleton (no route yet) + register the 6 existing ops; F10.1 passes". The REST surface `/api/v1/pos` and ~45 ops come much later (P2.13).

## Scope — you OWN (create)
- «src/lib/modules/pos/api/registry.ts», «src/lib/modules/pos/api/op.ts» (if the other modules have one), «src/lib/modules/pos/api/ops/*.ts` — `POS_OPS: ApiOp[]` with the existing operations expressed as ops in the SAME shape/conventions as account/crm/kanban (id naming, zod v4 input, scope strings `pos.*`, danger/confirm flags, `test:` ids if the convention requires them, Thai descriptions). Each op's handler calls the EXISTING service function (`createSale`, `voidSale`, the summary queries …) through the module facade — no new business logic, no copy of logic from `tools.ts`.
- `scripts/qc-pos-p0.2.mts` — a small static+unit oracle (no DB writes): registry loads; op ids unique; every op has scope/input schema/description; the set of registry op ↔ existing AI tool names mapping is explicit and complete for the tools that belong to POS; `matchOpIn`/dispatch helpers accept the registry; no route file exists under `src/app/api/v1/pos` (skeleton only). `JSON_SUMMARY` last line.
- `ledger/wo-notes/pos-P0.2.md` in YOUR worktree (checkpoint + report; template = `ledger/wo-notes/TEMPLATE-crm.md` until TEMPLATE-pos lands).

## Decisions already made (controller, 1 Oct)
1. **No behaviour change for the live AI tools in this work order.** Do NOT rewrite `src/lib/ai/tools.ts` / `skills.ts` / `proposals.ts` to route through the registry now (they are shared hot files and `pos_create_sale` goes through the proposal flow). The registry is the future single source; the switch-over of the AI surface happens in P2.13/P3.9. If the house pattern makes F10.1 or another fitness check REQUIRE a registration line in a shared file, make the smallest append-only hunk, marked `// POS P0.2 ▸ … ◂`, and list it in the report.
2. Which of the 6 tools are really POS? Verify in code where each one's logic lives. Expected: `sales_summary`, `sales_by_day`, `pos_create_sale`, `void_sale` are POS; `record_expense` and `financial_summary` may belong to accounting/finance. Register as POS ops the ones implemented by POS services; for the others, do not fake an op — record the finding and your recommendation in the notes ("6 ops" in the plan was written before the code was opened; code wins).
3. Scopes: check `src/lib/api-keys/scopes.ts` (`API_SCOPE_BUNDLES`). If POS scopes do not exist, do NOT add API-key bundles now (no key can reach POS until the route exists); define the scope string constants inside the POS module and note "bundle registration deferred to P2.13". If the type system forces registration, smallest hunk + report.
4. Money in satang integers; ids from the client are re-resolved against the tenant/unit (never trusted) — if an existing tool does not do this, do NOT fix it here; write it down as a finding with file:line (it becomes a P1/P5 item).
5. No `any` in `src/`. `"use server"` rules. No cross-module import except via facades + `ALLOWED_EDGES` (if you need a new edge in `scripts/fitness.mts`, do not edit fitness.mts — lane 1 owns it right now; report the exact line you need).

## Acceptance (paste final summary lines)
A1 `qc-pos-p0.2` green (run: `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/qc-pos-p0.2.mts`).
A2 `pnpm fitness` with env and without env: F10.1 green and every F-check identical to a "before" run saved at `.qc-shots/pos/p0.2/fitness-before.txt` (pre-existing reds are not yours — list them).
A3 `pnpm typecheck` clean (lane rule 5).
A4 Existing POS oracles unchanged before/after on QC4: `qc-pos-register`, `qc-pos-account`, `qc-pos-products`, `qc-pos-coupon`, `qc-pos-closeday`, `qc-pos-inventory` (lane command with gate lock; read each file header first — if one needs a fixture/seed that QC4 lacks, record SKIP+reason rather than seeding other tenants).
A5 Notes: op table (id · tool name · service fn · scope · danger), findings, decisions needed.

Finish: `git checkout -b wip/pos-p0.2`, commit (`pos P0.2: …`), `git push -u origin wip/pos-p0.2`. Never commit `.env*` or `.qc-shots`.
