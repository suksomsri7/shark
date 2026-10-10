# T4.4 — Promotion / demotion rules + screen D6 (Opus · server + app)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A9, R-E C28 first. Contract: AI-TEAM-RUN §2 T4.4. Mockup `airy-d.jpg` page 6 (+ dark). HTML: "คุณเอกพร้อมทำเองแล้ว · งาน: ส่งใบเสนอราคาให้ลูกค้า" · stats "50 งานล่าสุด · 96% ผ่านไม่ต้องแก้ · 0 ตีกลับ 30 วัน" · "ระดับสิทธิ์" segmented ร่าง+รออนุมัติ / ทำเองได้ · "ทำเองได้ เฉพาะเมื่อ" rows (💸 ยอดไม่เกิน ฿20,000 · 🏷 ส่วนลดไม่เกิน 10% · 🔔 แจ้งฉันทุกครั้งที่ส่ง · ยกเลิกได้ภายใน 10 นาที) · note "ลดการกดอนุมัติประมาณ 40 ครั้งต่อเดือน · ถ้าผ่านต่ำกว่า 90% จะกลับมารออนุมัติเอง" · buttons "ยังก่อน" / "ให้ทำเองได้".

## Verified facts
- Outcomes per proposal: APPROVE unedited (`decidedById` set, no `edits`) · EDIT (decide with `edits` — T1.9 writes `AiActionLog.edited=true`? **add** `edited Boolean @default(false)` to `AiActionLog` in `_ai_team_b` if T3.3 opened it; else derive EDIT = `resultNote` marker `EDITED#` written by T1.9 — choose the marker to avoid a migration) · REJECT (`REJECT:` note / `AiTeachNote`).
- `AiPromotionOffer` (T1.1) · `grantAuto` (T4.2) · cron runner `scripts/ai-team-cron.mts --job=promotions` + `/api/cron/hourly` hook (idempotent).
- Stats in one SQL: window of the last 50 decided proposals per (aiEmployeeId, kind) ordered by `decidedAt` — `ROW_NUMBER()` CTE; counts of unedited/edited/rejected; computed in `$queryRaw`.

## Deliverables
Server `src/lib/ai/team/promotion.ts`: `statsOf(aiEmployeeId, kind, { now }) → { total, unedited, edited, rejected, pct, rejected30d }` · `evaluatePromotions(now)` (advisory lock; for each employee × kind with ≥ 50 decided: pct ≥ 95 and access level DRAFT and no OPEN offer in 30 days ⇒ `AiPromotionOffer{ status OPEN }` + notify owner(s) `team.promotion.offer`; level AUTO and pct < 90 ⇒ `revokeAuto(system, …, "DEMOTED")` + notify + audit) · `acceptOffer(ctx, userId, offerId, limits)` → `grantAuto` (same rules; non-OWNER refused) → offer ACCEPTED · `dismissOffer` → DISMISSED (new offer possible after 30 days) · `estimateApprovalsSaved(aiEmployeeId, kind)` = decided count of that kind in the last 30 days · routes `GET /api/mobile/team/promotions`, `POST promotions/[id]/accept|dismiss`.
App `app/(app)/team/promotion/[id].tsx` reached from a notification deep link and from a banner on A1/B7 when an OPEN offer exists: stats, segmented (visual), limits rows (editable amount/discount via `AutoLimitsSheet` from T4.2; notify switch; undo window read-only), estimate line, buttons.
testIDs `promo-stat-<k>`, `promo-level-<k>`, `promo-limit-<k>`, `promo-later`, `promo-accept`.

## Acceptance (oracle `qc-ai-t4.4`)
S1 48/50 ⇒ offer, 47/50 ⇒ none · S2 one offer per 30 days (X4) · S3 AUTO + 44/50 ⇒ DEMOTED revoke + notify + audit · S4 X5 overlapping jobs, injected now · S5 accept ⇒ grantAuto rules (non-OWNER refused) · S6 stats single SQL (static) + parallel decisions consistent · S7 pairs D6 light/dark + buttons · S8 numbers equal stats · S9 date independence. Regressions T4.2 T4.1.
