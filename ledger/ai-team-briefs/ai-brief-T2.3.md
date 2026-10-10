# T2.3 — Tenant switcher bottom sheet A2 (Sonnet allowed · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A3, R-E C16 first. Contract: AI-TEAM-RUN §2 T2.3. Mockup `airy-a.jpg` page 2 (+ dark). HTML elements: title "กิจการ" + hint "แต่ละกิจการมีทีม AI และข้อมูลแยกกัน" · rows (initial badge · name · "AI n คน · วันนี้ n งาน" · unread badge) · "+ เพิ่มกิจการใหม่" · footer card "แพ็กฟรี · โควตาใช้ร่วมกันทุกกิจการ 62% · รอบใหม่ 1 ต.ค." · note "พนักงาน AI เห็นข้อมูลเฉพาะกิจการของตัวเอง …".

## Verified facts
- Switching: `useAuth().switchTenant(tenantId)` (`src/lib/auth-context.tsx`), tenants from `me.memberships`; drawer `DrawerBody` `(app)/_layout.tsx:20–140` keeps working for uiVersion 1.
- Per-tenant AI counts: `GET /api/mobile/me` has no AI counts → use `GET summary` for the active tenant only; other tenants show "AI n คน" from a new lightweight field — **do not** add N calls: spec T1.10 `me` includes `aiCount`, `tasksToday` per membership? Not in T1.10 — ruling: this WO requests a T1.10 addendum: `me.memberships[].team = { aiCount, tasksToday, pendingApprovals }` (cheap aggregate). Until merged, fixture provides it.
- Add tenant: existing flow (`POST tenants` then `/dna`).
- `BottomSheet` from T0.3 (no RN Modal).

## Deliverables
`src/components/team/TenantSheet.tsx` wired to `TeamHeader` ▾; rows → `switchTenant` + close + `invalidate("summary")`; "+ เพิ่มกิจการใหม่" → existing route; footer quota from `GET quota` (shared pct for FREE); testIDs `tenant-sheet`, `tenant-row-<id>`, `tenant-add`, `tenant-quota`; i18n; inventory; fixture `t2.3.json` (3 tenants).

## Acceptance (oracle `qc-ai-t2.3`)
S1 pairs light/dark · S2 switch call + close · S3 add route · S4 pct · S5 testIDs/i18n · S6 sheet renders in headless (no Modal) · S7 drawer shot unchanged for uiVersion 1 · typecheck · residue. Regression `qc-mobile-auth`.
