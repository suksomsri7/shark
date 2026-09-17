# C0.1 — CRM QC tooling (no product behaviour change)
Read `crm-brief-COMMON.md` first.

## Why
The pre-written C1.1 oracle/seed (11 Sep) guess table names that turned out wrong, there is no CRM screenshot harness, and "every button works" needs a registry from day one.

## Deliverables
1. `scripts/crm-qc-env.mts`: fix `PARTY_LINK_TABLES` to REAL models — need a NEW `partyId` column: `Appointment`, `ShopOrder`, `RentalBooking`, `QueueTicket`, `ClinicVisit`; ALREADY have the column but nothing writes it: `TicketOrder`, `SchoolEnrollment`, `HotelReservation`, `PatientRecord`. `PosSale` is NOT in the list (no phone; linked via memberId). Add to `CRM_V2A_TABLES`: `CrmVisibilityPolicy`, `CrmFileLink`, `CrmContactConsent`. Keep counts (20 companies / 80 contacts / 60 deals / 200 activities / teams phuket+krabi / users owner, manager, thana, nok).
2. `scripts/qc-crm-c1.1.mts`: align S5 (party-links) with the 9 real tables; add checks for the 3 added tables, `TeamMember.acceptingLeads`, `settings.crm.uiVersion` default 1, and the two-step unique on `MemberSection/MemberField` (new unique `[systemId, objectKey, key]` exists; old unique still exists in `crm_v2_a`). Must still SKIP cleanly today.
3. `scripts/seed-crm-qc.mts`: same table-name fixes; keep `has(model)` guards.
4. NEW `scripts/visual-crm.mts` — copy the structure of `scripts/visual-member.mts` (step DSL, desktop 1440×900 + mobile 390×844 fullPage, overflow detection with culprit element, console/≥400 capture, `summary-<user>.json`, mandatory `restoreSeed()` in `finally`). Users: `owner`, `manager`, `thana` (STAFF, team phuket), `nok` (team lead krabi), `customer:<code>` (customer session for the portal). Output `.qc-shots/crm/<wo>/`. Ship specs for the three v1 pages so the harness is proven now (WO key `0.1`).
5. NEW `scripts/crm-ui-inventory.json` (empty array + `$schema` comment per MASTER-PLAN §7) and fitness rules in `scripts/fitness.mts`: **F14.1** every interactive `data-testid` under `src/app/app/sys/[id]/crm/**`, `src/components/crm/**` (and later the portal folder) has an inventory row; **F14.2** every inventory row's testid exists in code. Both must pass with the empty registry today: start with a BASELINE list of the v1 testids (ratchet style, like `AUTHZ_BASELINE`) so the rule is live for new code only.
6. `ledger/wo-notes/TEMPLATE-crm.md`: add the 12-gate table and the X1–X10 table (applicable / N-A + reason / check ids).

## Files you own
the six paths above only.

## Acceptance
- `bash scripts/iso.sh pnpm exec tsx scripts/qc-crm-c1.1.mts` → SKIPPED with the right reason, exit 0.
- `bash scripts/iso.sh pnpm fitness` and `bash scripts/iso.sh env -u DATABASE_URL pnpm fitness` → all green including F14.1/F14.2.
- `bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` clean.
- Controller (not you) builds and runs `visual-crm.mts 0.1 --user owner|thana` → 3 pages × 2 devices, no ❌ for owner.
- Regressions: `qc-crm`, `qc-crm-activity`.

## X-groups
N/A (tooling) — state that in the notes.
