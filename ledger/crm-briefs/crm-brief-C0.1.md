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

## Controller addendum 2026-09-17 (RUN start · Opus 5 controller)
Facts re-verified against the code at `efd8452` before spawning agents:
1. **partyId tables — brief is CORRECT.** Checked every `model` block in `prisma/schema/*.prisma`:
   need a NEW column (0 `partyId` lines today): `Appointment` (booking.prisma) · `ShopOrder` (ecommerce.prisma) ·
   `RentalBooking` (rental.prisma) · `QueueTicket` (queue.prisma) · `ClinicVisit` (clinic.prisma).
   ALREADY have the column: `TicketOrder` (ticket.prisma) · `SchoolEnrollment` (school.prisma) ·
   `HotelReservation` (hotel.prisma) · `PatientRecord` (clinic.prisma).
   `HotelBooking` and `ClinicPatient` **do not exist** — the current `PARTY_LINK_TABLES` in `scripts/crm-qc-env.mts`
   still names them, and is also missing `ClinicVisit`. `PosSale` has `memberId String? // Customer.id` and no phone ⇒ stays out.
2. **Fitness ids**: the highest rule in `scripts/fitness.mts` today is `F13.9`; `F14.1`/`F14.2` are free as the brief assumes.
   Ratchet precedent to copy: `AUTHZ_BASELINE` (fitness.mts:436 + F6.1/F6.2 at :527–529) and `XREF_BASELINE` (:71).
3. **CRM v1 pages = exactly three** and they are the only CRM UI today:
   `src/app/app/sys/[id]/crm/{contacts,deals,activities}/page.tsx`. `src/components/crm/` **does not exist yet** ⇒
   F14.1 must treat a missing folder as "no findings", not as an error.
4. `scripts/qc-crm-c1.1.mts` SKIPs today because `prisma/migrations/*_crm_v2_a` is absent (the guard's other two
   conditions — `src/lib/core/teams.ts`, `scripts/seed-crm-qc.mts` — are already satisfied: the seed file exists).
   Verified just now: `bash scripts/iso.sh pnpm exec tsx scripts/qc-crm-c1.1.mts` → SKIPPED, exit 0. Keep it that way.
5. `scripts/crm-expected.json` already exists (generatedAt 2026-09-17T07:09Z) — the seed has been run once on the QC DB.
   Any change to the seed must keep it idempotent and must keep writing this file.
6. `scripts/seed-crm-qc.mts` does not hard-code `HotelBooking`/`ClinicPatient` anywhere; it goes through `has(model)`
   guards, so deliverable 3 is mostly a matter of keeping it consistent with the corrected `PARTY_LINK_TABLES`.
7. `scripts/visual-member.mts` is the template for `visual-crm.mts`: it loads `.env.qc` through `acc-v2-env.mts`,
   reads the expected JSON for `systemId`, mints a session tagged `userAgent = "qc-visual-member"` (must be deleted in
   `finally`), talks to `http://127.0.0.1:3215` served by `bash scripts/acc-v2-serve.sh`, and the cookie name depends on
   APP_ENV (`shark_session` on http). `visual-crm.mts` uses tag `qc-visual-crm` and reads `scripts/crm-expected.json`.

### Split of the work (two agents, disjoint file sets, neither touches prisma/schema)
- **ORACLE WRITER** owns: `scripts/crm-qc-env.mts` · `scripts/qc-crm-c1.1.mts` · `scripts/seed-crm-qc.mts` (deliverables 1–3).
- **BUILDER** owns: `scripts/visual-crm.mts` · `scripts/crm-ui-inventory.json` · `scripts/fitness.mts` ·
  `ledger/wo-notes/TEMPLATE-crm.md` (deliverables 4–6).
Nobody else touches those files in this work order. X-groups: N/A (tooling only, no product behaviour) — both agents
state that in their report; the controller records it in wo-notes.
