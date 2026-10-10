# CRM v2 — final PARITY pass (controller, 8 Oct 2026)

Owner order "ทำ parity" (7 Oct). Shots: `scripts/visual-crm.mts`, 26 spec sets × owner/manager/nok/thana × 1440 + 390, QC1, server :3215 build 725f0e0a (= product code of prod f132ce21; later commits are ledger/scripts only). 7 Oct 23:16 → 8 Oct 01:09 UTC. 631 shots · 496 OK · 135 FAIL. Index + run matrix: `ledger/evidence/parity/INDEX.md` (sheets MOCKUP|RENDER were in `/tmp/crm-parity/sheets/`, volatile). Controller compared the 16 desktop PRIMARY sheets + the design-13 mockup by eye against `ledger/design-crm/01–17`.

## Classification of the 135 FAIL
- Owner: only set 0.1 (obsolete v1 selectors, pages 200) and `/b/<slug>/login` 404 (portal off in the seed). No owner page of v2 failed.
- Other roles: HTTP 404 by permission/visibility design (404-not-403): companies pages for nok/thana (no `crm.company.read` in the seed — C5.5-fix2 it4 F1), settings pages for non-owners, reports/e-mail for staff without the key, import for staff, sample deal/company outside the role's scope. NOT individually proven per shot — the per-role authority is the buttons registry (C4.2 / C3.10), which was green.
- No FAIL with reason "overflow" was reviewed as a defect in this pass (see INDEX for reasons).

## Verdict per design (desktop, owner)
| # | design | verdict | differences seen |
|---|---|---|---|
| all | app shell | accepted difference | render uses the shared SHARK sidebar + CRM top tabs; mockups show an icon rail + CRM sub-menu |
| 01 | home | ⚠️ 2 visual defects | (a) first KPI tile value truncated to "฿19...." at 1440 — number unreadable; (b) filter bar wraps: search left, three selects stacked on the right with empty space (mockup = one row). Template chooser block on top is a later feature (not in the mockup). Structure otherwise matches (6 KPI · AI · today · deals to watch · leaderboard · lead sources). |
| 02 | pipeline board | ✅ | filters are a form row instead of chips; "select many" not in the header |
| 03 | deal 360 | ✅ | header actions differ (quote + invoice; call/e-mail moved), extra "deal data" edit block |
| 04 | company 360 | ✅ | — |
| 05 | contact 360 + convert | ✅ | — |
| 06 | custom objects | ✅ | right-hand 360 preview smaller |
| 07 | automation + sequence | ✅ (split) | one mockup screen = three pages (automation / sequences / assignment) — accepted at C2.1–C2.3 |
| 08 | activity · call · e-mail · calendar | ✅ (split) | one mockup screen = activities / e-mails / calendar pages — accepted at C1.6, C2.4, C2.5 |
| 09 | reports / forecast | ✅ | — |
| 10 | teams · quota · commission | ✅ (split) | teams / visibility / quotas / commissions are separate pages — accepted at C1.7, C3.2, C3.3 |
| 11 | web/e-mail tracking + forms | ✅ (split) | forms / tracking / e-mail settings separate |
| 12 | B2B portal | ⏳ NOT compared | customer-side pages need `scripts/pending/portal-visual-prep.mts` (writes QC1); only the owner's portal-settings page was shot. C3.5 PARITY record stands. |
| 13 | staff mobile | not re-compared | mobile app render = C3.7 (`shoot-crm` 5/5, c3.7 30/30 on 8 Oct, C3.10 evidence); web 390 has no mobile mockup — checked for errors/overflow only |
| 14 | AI · API · webhook | ✅ | AI chat panel is not on this page (AI lives inside pages); keys / tools / webhook match |
| 15 | e-mail routing settings | ✅ | Gmail/Outlook "coming soon" cards absent |
| 16 | web tracking + consent | ✅ | timeline example + PDPA note panel absent |
| 17 | integration map | ✅ | plus background-jobs panel |

**PARITY: ผ่านแบบมีจุดต่างค้าง 2 จุด (หน้าแรก 01: ตัวเลข KPI ถูกตัด · แถบตัวกรองเรียงผิด) + แบบ 12 ฝั่งลูกค้ายังไม่ได้เทียบรอบนี้.** Fixing 01 needs a product change (src/) ⇒ a new deploy to prod — owner's decision.

## Follow-up (8 Oct, lane `wip/crm-parity-fix`, merged into session/crm — NOT on main/prod yet)
- **01 fixed** (`874a761d`): KPI number is container-sized and never truncated ("฿19.35M" readable at 1440; stress "฿999.99M" one line); filter bar is one row at 1440, 2 clean rows at 1280/1024/768, stacked at 390. Controller compared the BEFORE-over-AFTER crop by eye ✅. Residual nit: the owner select clips its label slightly ("ผู้ดูแล: ทั้งหม…") at 1440. Checks: typecheck rc=0 · fitness 42/42 · c3.2 47/47 · visual 3.2 owner 5/5.
- **12 customer side shot** (portal prep on QC1, undone, 0 leftovers): 12/12 customer pages + login OK. Structure matches the mockup (login e-mail+OTP / LINE, home counters + lists, invoices, quotations, documents, requests, contacts) — compared in EMPTY state only (seed company has no documents; QR/PromptPay card, invoice table and accept/reject buttons not visible). Differences: 2 counters instead of 3 (`showDeals:false` in the prep), logout button instead of bell, one page per menu item on desktop. **Verdict 12: ✅ structure, data-filled states not compared in this pass (C3.5 record stands).**
- **Prod-walk findings**: C1 new-deal form — REAL bug (re-click created up to 4 deals; navigation swallowed by the queued contact search at ~400 ms latency) fixed `abe1ad29` + regression check in `qc-crm-forms.mts` (red on the old build Δ4, green on the fix; deal-new-form 46/46; buttons /deals/new thana 30/30). C2 unmatched e-mail tab for MANAGER — NOT a bug: gate is scope-based (owner, or whole-shop member with CONTACT=ALL); registry note `2c35421c`.

**PARITY (after follow-up): ผ่าน — ไม่มีจุดต่างค้างที่ต้องแก้ · รอ deploy เพื่อให้การแก้ 01 + C1 ถึง prod.**
