# POS P4.3 fix10 — credit accounts read-only for single-branch manager (CD-P43-17)

Tree `/root/projects/shark-pos-b` · branch `wip/pos-p4.3-fix10` from `63116bb2` (merge fix9+fix9b) · builder (account A) · product code + i18n + this note only. Server rule (มติ CD-P52-O4 F5 / P5.2 H6b) unchanged.

## Cause (survey CD-P43-14 · cell 6 manager-desktop)
- `saveCreditAccount` (`src/lib/modules/pos/credit.ts`) allows save only for `pos.credit.manage` **and** (OWNER or MANAGER whose `unitAccess` contains `"*"` literally).
- `settings/page.tsx` passed only `canManageCredit = evaluate(m, pos.credit.manage)` (true for every MANAGER) ⇒ `CreditSettingsCard` rendered `pos-settings-credit-edit-*` / `pos-settings-credit-add` / the form for a single-branch manager, and the server then refused with `pos-settings-credit-error`.

## Fix
1. `credit.ts` — new export `canEditCreditAccounts(actorRaw: RegisterActor | null): boolean` = `actorOf(actorRaw)` → `canManageCredit(actor) && (OWNER || (MANAGER && unitAccess.includes("*")))`. `saveCreditAccount` now calls it in place of the two former checks (same position: after the system check, before validation; same refusal `PERMISSION_DENIED`). `actorOf` is idempotent on an already-normalised actor, so the page and the server run byte-for-byte the same decision.
2. `settings/page.tsx` — builds `creditActor` once (same shape as `credit-actions.ts actorOf`: userId · role · unitAccess · permissions of the active membership), passes it to `listCreditAccounts` (unchanged behaviour) and to `canEditCreditAccounts` → new prop `canEdit` on the card, separate from `canManage` (read).
3. `CreditSettingsCard.tsx` — new prop `canEdit`. `canManage && hasCrm && !canEdit` ⇒ rows shown read-only (name · limit · term · active), **no** `pos-settings-credit-edit-*`, **no** `pos-settings-credit-add` / search / found, **no** form (`formNode` gated on `canEdit`), plus notice `pos-settings-credit-all-branches-only` (InlineNote tone ok, `<p role="status">`, non-interactive) with `settings.credit.allBranchesOnly`.
4. `src/messages/{th,en}/pos.json` — `pos.settings.credit.allBranchesOnly`:
   - th: "ผู้จัดการต้องเข้าได้ทุกสาขาจึงตั้งวงเงิน/เทอมได้ — คุณเห็นแบบอ่านอย่างเดียว"
   - en: "Only the owner or a manager with access to all branches can set credit limits — read-only for you"

No existing testid or i18n key changed. No `*actions*.ts` touched (so qc-pos-p1.6 not required). Nothing under `scripts/` touched.

## For the controller (registry — builder does not edit)
- New testid to register in `scripts/pos-ui-inventory.json`: `pos-settings-credit-all-branches-only` · kind notice · page `/app/sys/[id]/pos/settings?tab=payments` · visible for MANAGER without `"*"` (and STAFF holding `pos.credit.manage`) when the shop has CRM; hidden for OWNER and MANAGER `"*"`. Non-interactive ⇒ fitness F15.3a does not require it (passes unregistered).
- Existing rows `pos-settings-credit-edit-*`, `pos-settings-credit-add`, `pos-settings-credit-form`, `-limit/-term/-active/-note/-save/-cancel/-search/-found-*` are now absent for single-branch MANAGER — if their rows list MANAGER in `roles` without a `"*"` condition, they need `hiddenFor`/needs adjusted, or the walker cell manager-desktop will report them missing.

## Static proof — page gate == server rule
`canManageCredit(a)` = `evaluate(a, pos.credit.manage)` with no unitId: OWNER → true; MANAGER → true (`canAccessUnit(undefined)`); STAFF → `permissions["pos.credit.manage"] || permissions["pos.*"]`.

| actor | page `canManage` (read) | page `canEdit` | card shows | `saveCreditAccount` guard | match |
|---|---|---|---|---|---|
| OWNER | true | true | list + edit/add/form | pass (→ validation) | ✅ |
| MANAGER `unitAccess=["*"]` | true | true | list + edit/add/form | pass | ✅ |
| MANAGER single branch (`[posqc-btn-unit]`; also any explicit list without `"*"`) | true | **false** | list read-only + `pos-settings-credit-all-branches-only` · no edit/add/form | PERMISSION_DENIED | ✅ (no control the server rejects) |
| STAFF without key | false | false | `pos-settings-credit-no-permission` · no list | PERMISSION_DENIED (list also denied) | ✅ |
| (extra) STAFF with `pos.credit.manage` | true | false | list read-only + notice | PERMISSION_DENIED | ✅ |

`canEdit ⇒ canManage` always (helper contains `canManageCredit`), so the card never shows edit controls without the list.

## Tests (2026-10-25 · tree b · uncommitted working tree at the fix) — logs `/root/pos-runs/p43-fix10/tests/`
Static (`env -C … ISO_MEM=3G bash scripts/iso.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock pnpm exec tsx scripts/<suite>.mts`):
- qc-pos-p4.1 `--no-db`: 16/16 · rc=0 13:54:15Z
- fitness (fitness.mts, no env): 53/53 · rc=0 13:54:30Z
- fitness-pos: 8/8 · rc=0 13:54:39Z
- pos-authz-matrix-gen `--check`: "scripts/pos-authz-matrix.json ตรงกับตัวสร้าง" · rc=0 13:54:42Z

QC4 (`env -C … ISO_MEM=3G bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts`):
- qc-pos-p5.2: 55/55 · rc=0 13:57:54Z (pendingOwner P5.2-F4, P5.2-F11 listed as ok:false — owner-pending items, not failures; failed=[])
- qc-pos-p3.6: 52/52 · rc=0 13:59:01Z
- qc-pos-p2.14: 60/60 · rc=0 14:00:18Z
- qc-pos-p1.13: 33/33 · rc=0 14:00:53Z
- qc-pos-p1.15: 40/40 · rc=0 14:01:32Z

Strict typecheck (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`, avail 9338 MB): rc=0 · 14:01:43Z → 14:04:40Z.

No self-check test added: the existing suites live under `scripts/` (controller-owned); H6b behaviour of save is covered by qc-pos-p5.2 / qc-pos-p3.6 (both green).

Not done (by rule): no build / serve / screenshot — UI change proven statically only; next walker run of cell 6 manager-desktop should show the notice and no credit edit/add controls.
