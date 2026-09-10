# MEMBER-RUN — แผนงาน RUN "ระบบสมาชิก v2" (34 ใบ · 3 เฟส) — สถานะ: **กำลัง RUN (เริ่ม 10 ก.ย. 2569 · session `session/member` · worktree `/root/projects/shark-member`)**

> เขียน 10 ก.ย. 2569 · พิมพ์เขียว `docs/modules/06-member-v2.md` · API `docs/api/MEMBER-API.md` · แบบ `ledger/DESIGN-MEMBER.md` + ภาพ 30 ใบ `ledger/design-member/`
> ใช้เอกสารนี้ **เทียบ QC**: ทุกใบมี (1) สัญญาไฟล์/ฟังก์ชัน (2) รายการข้อสอบ (oracle) ที่ Fable จะเขียนเป็น `scripts/qc-member-<wo>.mts` ก่อน spawn builder (3) ภาพที่ต้องตรงกับ mockup (4) regressions
> วิธีทำงาน = สืบทอดจาก `ledger/KANBAN-RUN.md` กติกา 1–10 + `HANDOVER-2026-09-10-KANBAN-P3.md` §5 (oracle ก่อน · builder แย้งพร้อมหลักฐาน · **builder ห้าม build** Fable build+ภาพ · งานหนักทีละ 1 · fitness มี/ไม่มี env · ข้อสอบที่กินตัวนับต้องคืนใน finally · ทุก push ตรวจ Vercel + `_prisma_migrations` · Telegram % ทุกใบ)

## 0. กติกาเพิ่มของ RUN นี้
1. **ข้อมูล QC**: seed ใหม่ `seed-member-qc.mts` (แผน · scripts/) (ร้าน "SIAM DIVE MEMBER QC" · ระบบ MEMBER/POINT/REWARD/COUPON/POS/BOOKING/CHAT · สมาชิก 60 คน 4 ระดับ · ฟิลด์เทมเพลตดำน้ำ · แต้ม/ล็อต · voucher · สแตมป์ · บิล 120 · นัด 40 · ห้องแชท 10 · เฉลย `member-expected.json` (แผน · scripts/)) · idempotent ลบร้านสร้างใหม่ · ทุก oracle คืนสภาพใน finally
2. **ห้ามแตะ tx ของ POS** โดยไม่มีข้อสอบ `qc-acc-v2-pos-*` + `qc-kanban-k3.3` เขียว (M2.8 เป็นใบเดียวที่แก้ `pos/service.ts` และต้องรัน regressions POS/บัญชีทั้งชุด)
3. **ทุก op ใหม่ต้องมี `test: "M<x>-S…"`** (F13.4) · generator `gen-member-api-docs.mts` + F13.5 ตั้งแต่ M1.11
4. ฝั่งลูกค้า `/m/*` ใช้ session ลูกค้า — visual harness `visual-member.mts` (แผน · scripts/) ต้องมี `--user owner|thana|customer:<memberCode>`
5. ภาพ parity: ทุกใบระบุภาพอ้างอิงจาก `ledger/design-member/NN-*.png` · Fable ดูภาพจริงคู่ mockup ทั้ง owner และ staff (thana = STAFF สาขาป่าตอง ไม่มี crm.*)
6. เพดาน/สิทธิ์/ข้อความ ตาม §6 §11 ของพิมพ์เขียว · event ใหม่ต้องลง 3 ทะเบียน (consumer/AUTOMATION_EVENTS/WEBHOOK_EVENTS) ในใบเดียวกับที่ emit

## 0.1 บทบาทและขั้นตอนต่อใบ (ใครทำอะไร · ตามลำดับ · ทุกใบเหมือนกัน)
| ขั้น | ใคร | ทำอะไร | หลักฐานที่ต้องมี |
|---|---|---|---|
| 1 | **Fable** | อ่านสัญญาใบนั้นในพิมพ์เขียว/MEMBER-RUN → เขียนข้อสอบ `qc-member-<wo>.mts` (SKIP guard · chk · JSON_SUMMARY · finally คืนสภาพ) + เพิ่ม spec ภาพใน `visual-member.mts` | ข้อสอบรัน = SKIPPED ก่อนมีโค้ด · ผ่าน tsc |
| 2 | Fable | commit ข้อสอบ · เขียน prompt builder (อ่านก่อน/env QC/ลำดับงานหนัก/ห้าม build/ห้าม commit/ส่งมอบ wo-notes) · spawn builder ตามคอลัมน์ "builder" | prompt เก็บใน transcript · ledger event "เริ่ม Mx.y" |
| 3 | **builder** (Opus/Sonnet) | ทำโค้ด + migration QC + รันข้อสอบจนผ่าน (ยกเว้นข้อภาพ) → tsc → regressions → fitness มี/ไม่มี env → เขียน `ledger/wo-notes/member-Mx.y.md` (ไฟล์ · ผล · ข้อแย้งพร้อมหลักฐาน · หนี้ · คืนสภาพ QC) | JSON_SUMMARY ทุกชุด · ห้ามแก้ข้อสอบ · ห้าม build · ห้าม commit |
| 4 | Fable | อ่านโน้ต → ตัดสินข้อแย้ง (แก้ข้อสอบเองถ้า builder ถูก) → รันข้อสอบ+regressions ซ้ำเอง | ผลรันของ Fable ไม่ใช่ของ builder |
| 5 | Fable | build QC server → ถ่ายภาพ (owner + thana + customer) → **เปิดดูทุกภาพเทียบ mockup** → stop server | ภาพใน `.qc-shots/member/<wo>/` · ระบุจุดต่างใน ledger |
| 6 | Fable | tsc · fitness (2 แบบ) · commit ระบุไฟล์ · rebase · push main + session branch | commit hash ใน ledger |
| 7 | Fable | poll Vercel READY · ตรวจ `_prisma_migrations` บน prod (ถ้ามี migration) · backfill prod ถ้าใบนั้นมี (dry-run ก่อน) | ผลใน ledger event |
| 8 | Fable | อัปเดต KANBAN-RUN-style ledger (แถว WO DONE + event) · memory · Telegram % (ฟีเจอร์ที่ผู้ใช้ได้ + บั๊กที่จับได้) | ข้อความ Telegram |
| 9 | Fable | ใบถัดไปตามลำดับ §3 · ถ้าเครื่องรีสตาร์ท: โค้ดบนดิสก์ → Fable รับจบเองไม่ spawn ใหม่ | — |
| ปิดเฟส | Fable | qc:all เต็ม · prod verify ทั้งเฟส · handover · Telegram · memory | HANDOVER-…-MEMBER-Mx.md |
- **เจ้าของ**: รับรายงาน Telegram · ตอบเมื่อ Fable ถามเรื่องที่เป็นมติธุรกิจเท่านั้น (ไม่ถามเรื่องเทคนิค) · ดูหน้าใหม่บน prod ด้วยตา · ตั้ง env/คีย์ที่ต้องใช้ (LINE OA · Resend · SMS provider)
- **ห้าม**: builder 2 ตัวพร้อมกัน · งานหนักซ้อน · แตะ `.env` prod · รัน suite ที่ `loadEnvFile(".env")`

## 1. ตาราง WO

| WO | ชื่อ | builder | ขึ้นกับ | migration | oracle (ข้อ) | ภาพ |
|---|---|---|---|---|---|---|
| **M1.1** | schema v2 + enum + backfill 6 สคริปต์ + seed QC + **ทะเบียนช่องทางกลาง `channels.ts` (D19) + `MemberChannelIdentity` + `HrEmployee.userId`+backfill (D17/D18)** | Opus | — | `member_v2_a` | 26 | — |
| **M1.2** | fields engine (sections/fields/values/history · validate · filterWhere · templates apply) | Opus | M1.1 | — | 26 | — |
| **M1.3** | ตัวออกแบบฟิลด์ UI + เทมเพลต 16 ชุด (ข้อมูล) | Sonnet | M1.2 | — | 14 | 03 |
| **M1.4** | profile service (create/update/360/duplicates/merge) + policy อ่อนไหว (บทบาท × **ตำแหน่ง/แผนก HR** D17) + access log + **linkIdentity/identities (D18 กติกาจับคู่ตายตัว)** | Opus | M1.2 | — | 34 | — |
| **M1.5** | หน้ารวมสมาชิก (กรองทุกฟิลด์ · มุมมองบันทึก · bulk · ส่งออก) + หน้า 360 แท็บโปรไฟล์ + แถบขวา | Sonnet | M1.4 | — | 20 | 01 · 02 |
| **M1.6** | สมัคร (โมดัล/QR/ลิงก์) · นำเข้า mapping · ตัวซ้ำ/รวมคน UI | Sonnet | M1.4 | — | 18 | 10 · 11 · 12 |
| **M1.7** | consent/privacy: นโยบายเวอร์ชัน · consent ต่อช่องทาง (key จากทะเบียน D19) · sensitive policy (D8+D17 UI ชิปตำแหน่ง HR + เตือนพนักงานยังไม่ผูก) · access log (+ตำแหน่ง) · คำขอ export/erase (+approval) | Opus | M1.4 | `member_v2_b` (ถ้าแยก) | 26 | 14 |
| **M1.8** | ช่องทางที่มา: AcquisitionLink/QR · attribution first/last · resolveSource ทุกทางเข้า (+MARKETPLACE/APP + `sourceChannel`) · รายงาน | Opus | M1.4 | — | 18 | 13 |
| **M1.9** | tiers engine: TierDef/benefits/rules (AutomationRule scope MEMBER_TIER) · evaluate · runTierReview · history · dry-run · sync legacy enum · welcome voucher (stub → M2.5) | Opus | M1.4 | — | 26 | — |
| **M1.10** | ระดับ UI: บันได · ตัวสร้างกฎ · benefits editor · ทดลองรัน · ประวัติ · แบบเสียเงิน | Sonnet | M1.9 | — | 16 | 04 · 15 |
| **M1.11** | REST/AI ชุดแรก: registry `member` + op members/fields/consents/privacy/sources/tiers/me(get/update/card) ~45 · generator docs · skill `members` v2 · webhook events M1 | Opus | M1.5–M1.10 | — | 24 | 27 (ครึ่งขวา) |
| **M1.12** | มือถือ (responsive ทุกหน้า M1) + แผงข้างห้องแชท (**linkIdentity ทุกช่องทาง** · ช่องทางที่ผูก n · candidates/ผูกรวม · สมัครจากแชท · ปุ่มด่วน) + `chat.contact.linked` | Sonnet | M1.5 | — | 18 | 26 · 28(ก,ข) |
| **M2.1** | point rules + lots + expiry (computeEarn · earnWithLot · burnFifo · expireDue · expiringSoon · cron · backfill lots) | Opus | M1.1 | `member_v2_c` | 28 | — |
| **M2.2** | point transfer (OTP) · adjust+approval · settings · หน้าตั้งค่าแต้ม + ledger รวม + ใกล้หมดอายุ | Sonnet | M2.1 | — | 16 | 16 |
| **M2.3** | stamp: cards/progress/events · addStamp (PIN/QR/auto) · completeCycle → รางวัล · editor UI + การ์ดจริง | Opus | M2.1 | `member_v2_d` | 22 | 17 |
| **M2.4** | reward v2: kind/stamp cost/tier/limits/image · QR รับของ · fulfil/cancel · editor + หน้ารับของ | Sonnet | M2.3 | — | 16 | 18 · 05 |
| **M2.5** | voucher: templates/issue(segment · approval เพดาน)/validate/redeem/release/cancel/expire · หน้า voucher + โมดัลออก | Opus | M1.9 | `member_v2_e` | 26 | 19 |
| **M2.6** | gift card: sell/use/reload/transfer/suspend/expire · PIN · settings accountingLink (D3) → บัญชี (รับเงินล่วงหน้า/รายได้) · UI | Opus | M2.5 | `member_v2_f` | 24 | 20 |
| **M2.7** | wallet facade: getWallet · quoteApply (ลำดับ/กันซ้อน) · applyOnSale · หน้า wallet ในโปรไฟล์ 360 | Opus | M2.1–M2.6 | — | 24 | 02(แท็บกระเป๋า) |
| **M2.8** | POS integration: แผงสิทธิ์ที่หน้าขาย · createSale รับ choices · **ย้าย point/member/coupon จาก tx เป็น consumer `pos.sale.paid`** · void ย้อนครบ · gift card sale line | Opus | M2.7 | — | 30 | 06 |
| **M2.9** | ฝั่งลูกค้า `/m/*` (LIFF + WebView แอป): บัตร QR token · wallet · โปรไฟล์แก้เอง · consent · PDPA ปุ่ม · session ลูกค้า (platform_auth LINE/OTP) | Opus | M2.7 | — | 22 | 09 |
| **M2.10** | REST/AI ชุดสอง: points/stamps/rewards/wallet/vouchers/coupons/giftcards/me(wallet/transfer/redeem) ~40 op · tools | Opus | M2.1–M2.9 | — | 20 | — |
| **M3.1** | segments: evaluateSegment ทุกฟิลด์+loyalty+consent · count/sample/save · หน้า segment builder | Opus | M1.11 | — | 20 | 21(ขั้น 1) |
| **M3.2** | campaigns v2: channels 4 (LINE ผ่าน chat facade · อีเมล · SMS gateway ถ้ามี · push customer) · variant A/B · holdout · attach voucher/coupon · track open/use · stats | Opus | M3.1 · M2.5 | `member_v2_g` | 26 | 21 · 07(ล่าง) |
| **M3.3** | journey: AutomationRule scope MEMBER_JOURNEY · trigger member.* 24 + birthday/inactive cron · condition ฟิลด์/ระดับ/consent/segment · action 10 (WAIT_THEN scheduled run) · quota · holdout · builder UI + detail | Opus | M3.2 | — | 30 | 07 · 22 |
| **M3.4** | reviews: request (journey/consumer) · submit (LIFF) · reply · hide · escalate → kanban card · AI summary/draft reply · inbox UI + settings | Opus | M2.9 | `member_v2_h` | 22 | 23 · 08(ขวา) |
| **M3.5** | referrals: program (D6) · code/link/QR · attach ตอนสมัคร · conversion consumer · reward both · fraud · leaderboard · UI + LIFF | Opus | M2.5 | — | 20 | 24 · 08(ขวา) |
| **M3.6** | notifications: templates 8×4 · send (consent/quiet hours/รวมรายวัน) · LINE/อีเมล/SMS/push · stats · UI | Sonnet | M3.2 | — | 16 | 30 |
| **M3.7** | history timeline: consumers ทุกโมดูล → MemberActivity (pos · booking(+event ใหม่ completed/no_show) · chat ทุกช่องทาง · **ecommerce `shop.order.paid` (Lazada/Shopee/TikTok → ซื้อ/แต้ม/ที่มา MARKETPLACE + linkIdentity)** · account docs · kanban · crm.deal.won · loyalty ทั้งหมด) · แท็บประวัติกรองได้ | Opus | M2.8 | — | 28 | 08 |
| **M3.8** | reports: overview/RFM/tiers/points(หนี้สิน)/promotions(ROI+holdout)/sources/cohort · CSV · ตั้งเวลาอีเมล | Sonnet | M3.3 · M3.7 | — | 18 | 25 |
| **M3.9** | เทมเพลตกิจการ 16 ชุดครบ (ส่วน/ฟิลด์/ระดับ/สแตมป์/journey) + apply/preview UI + ตัวอย่างมือถือ | Sonnet | M3.3 | — | 18 | 03(เทมเพลต) |
| **M3.10** | REST/AI ชุดสาม: segments/campaigns/journeys/reviews/referrals/notifications/reports/settings/apikeys/webhooks/join ~33 op · tools ครบ ~40 · manifest · OpenAPI · docs generator สมบูรณ์ | Opus | M3.1–M3.9 | — | 22 | 27 |
| **M3.11** | LIFF onboarding (join 3 ขั้น · OTP · ที่มา `?src=` · ผู้แนะนำ) + แอปพนักงาน (ค้น/สแกน/ประทับ/ใช้สิทธิ์ 3 จอ) + แอปลูกค้า WebView | Sonnet | M2.9 · M3.5 | — | 16 | 29 · 28 |
| **M3.F** | ปิด RUN: qc:all เต็ม · prod verify migration a–h · backfill prod ทีละร้าน · handover · Telegram · memory | Fable | ทั้งหมด | — | — | — |

รวม oracle ≈ **740 ข้อ** · migration 8 ตัว (a–h · additive) · ประมาณเวลา (จังหวะบอร์ดงาน 45–80 นาที/ใบ + build/ภาพโดย Fable): **M1 ~2 วันทำงานเต็ม · M2 ~1.5 วัน · M3 ~2 วัน ⇒ ~5–6 วันทำงานต่อเนื่อง** (บอร์ดงาน 36 ใบใช้ ~5 วัน)

## 2. สัญญารายใบ (สรุปที่ QC ใช้ — รายละเอียดเต็มดูพิมพ์เขียว §4–§9)

### M1.1 — schema + backfill + seed (Opus · 22 ข้อ)
- Prisma: ทุกตาราง/คอลัมน์/enum ใน 06-member-v2 §4.1–4.3 (+ `MemberChannelIdentity` · `HrEmployee.userId` · channel เป็น String) · `channels.ts` (แผน · src/lib/core/) ทะเบียนช่องทาง 15 key + backfill `HrEmployee.userId` จากอีเมล (ยกเว้นกลุ่ม M2/M3 ที่มี migration ของตัวเอง: PointRule/PointLot/PointTransfer → M2.1 · Stamp* → M2.3 · Voucher* → M2.5 · GiftCard* → M2.6 · CampaignVariantStat/MemberSegment → M3.2 · MemberReview → M3.4) · `AutomationRule.scope` · `AiCreditSource.MEMBER_ASSIST`
- backfill 6 สคริปต์ §4.6 (idempotent · `--tenant` · dry-run) · seed `seed-member-qc.mts` + `member-expected.json`
- oracle: S1 schema (คอลัมน์/enum/index ครบ 10) · S1b ทะเบียนช่องทาง 15 key + kind/canConsent/canNotify + แชท map ครบ (2) · S2 backfill tiers/fields/consent/party/attribution บนร้าน QC (8) · S3 seed ตัวเลขตรงเฉลย + idempotent (4) · S4 scope.ts ประกาศ tenant ครบ + fitness (2)

### M1.2 — fields engine (Opus · 26 ข้อ)
- `fields.ts` (แผน · member/) ตาม §5.3 · zod ต่อชนิด 11 · unique/required/choices/lookup validate · history · `fieldFilterWhere` (TEXT contains/eq · NUMBER range · DATE range · BOOL · SELECT in · MULTI hasAny · LOOKUP eq) · `applyTemplate` ไม่ทับ · เพดาน 60/12/20 filterable
- oracle: S1 CRUD section/field + isSystem guard (6) · S2 setFieldValue ทุกชนิด + ผิดชนิด/นอก choices/unique ซ้ำ/required ว่าง → throw ไทย (8) · S3 history เมื่อ trackHistory (2) · S4 filterWhere ทุกชนิดคืนผลถูก (6) · S5 applyTemplate ดำน้ำ 2 ครั้ง = idempotent (2) · S6 เพดาน (2)

### M1.3 — ตัวออกแบบฟิลด์ UI (Sonnet · 14 ข้อ · ภาพ 03)
- `settings/fields/page.tsx` + `components/member/FieldDesigner.tsx` (palette 11 · ลากเรียง dnd-kit เดิม · แผงคุณสมบัติ 10 รายการ · ตัวอย่างมือถือ · เทมเพลต dropdown · ตัวนับ 23/60) · testid `field-designer` `field-palette` `field-props` `field-template-select`
- oracle: static (ไม่มีอีโมจิ · testid ครบ · เรียก actions ที่ M1.2) + actions (create/update/reorder/archive/applyTemplate ผ่าน server action + สิทธิ์ settings.manage) + ภาพ ≥ 2

### M1.4 — profile service + 360 + policy (Opus · 28 ข้อ)
- `profile.ts` §5.2 (+ `linkIdentity/listIdentities/unlinkIdentity` D18: เบอร์ → อีเมล → id ช่องทาง → candidates) · `privacy.canView/logAccess` (D17: roles ∪ hrPositions ∪ hrDepartments → sameUnit → log พร้อม hrEmployeeId) · `getMember360` ซ่อนส่วนอ่อนไหว **ไม่ส่งลง client** · duplicates ผ่าน party · merge ledger (แต้ม/ประวัติ — voucher/สแตมป์/gift card เพิ่มใน M2.x ผ่าน hook `onMerge`)
- oracle: S0 linkIdentity 6 กรณี (เบอร์ตรง · อีเมลตรง · id เคยผูก · ไม่ตรง→candidates · id ซ้ำคนอื่น→CONFLICT · unlink ต้อง MANAGER) (6) · S1 create (ซ้ำเบอร์ → duplicate · partyId · memberCode pattern · attribution FIRST/LAST · consent · welcome event) (8) · S2 update + history + customerEditable guard (4) · S3 360: thana ไม่เห็นส่วนสุขภาพ · พนักงาน HR ตำแหน่ง "พยาบาล" (STAFF) เห็นได้ตาม policy · sameUnitOnly · AccessLog มีตำแหน่ง (7) · S4 duplicates/merge (5) · S5 unit scope 404 (2) · S6 events member.created/updated/merged ลง 3 ทะเบียน (4)

### M1.5 — หน้ารวม + 360 (Sonnet · 20 ข้อ · ภาพ 01 · 02)
- `members/page.tsx` (KPI 6 · FilterBar reuse แบบบอร์ดงาน + ฟิลด์ filterable · SavedViews reuse K2.5 pattern · ตาราง 10 คอลัมน์ตั้งได้ · bulk) · `members/[id]/page.tsx` (หัว · ตัวเลข 6 · แท็บ 5 (แท็บอื่น placeholder จนใบที่เกี่ยวเสร็จ) · ส่วนตามเลย์เอาต์ · แถบขวา AI(stub)/การเชื่อมต่อ/PDPA/ระดับถัดไป)
- oracle: listMembers filters ทุกชนิด + segment + view (8) · bulk actions (3) · 360 DTO ครบ (4) · static/testid/ภาพ owner+thana (5)

### M1.6 — สมัคร/นำเข้า/ตัวซ้ำ UI (Sonnet · 18 ข้อ · ภาพ 10 · 11 · 12)
- โมดัลสมัคร (ฟอร์มจาก layout · ที่มา · ผู้แนะนำ(stub) · consent · QR LIFF/ลิงก์) · นำเข้า 3 ขั้น (mapping รวมกำหนดเอง · ตรวจแถว · ตัวเลือกซ้ำ) · ตัวซ้ำ+เปรียบเทียบ+รวม (2 ขั้น)
- oracle: import mapping/validate/onDuplicate 3 โหมด (8) · สมัครผ่าน action + ตรวจซ้ำสด (4) · merge UI → service (3) · ภาพ 3 (3)

### M1.7 — consent/privacy (Opus · 22 ข้อ · ภาพ 14)
- policies/versions · consent per channel + source · sensitive policy CRUD (D8) · access log · privacy requests → approval (`MEMBER_ERASE`) · exportBundle (รวม party/chat/account/kanban ผ่าน facade) · eraseMember (anonymize · ledger คง) · auto-erase cron (สร้างคำขอ)
- oracle: policy publish + ยอมรับ (3) · consent set/revoke + event + legacy sync (4) · sensitive policy: STAFF ✗ MANAGER ✓ sameUnit (5) · export bundle มีทุกโมดูล (3) · erase → approval → anonymize + บิลคง (5) · UI ภาพ (2)

### M1.8 — ช่องทางที่มา (Opus · 16 ข้อ · ภาพ 13)
- AcquisitionLink CRUD + QR (storage) + hit counter (`/m/{slug}?src=`) · resolveSource ทุกทางเข้า (POS/LIFF/WEB_FORM/CHAT/BOOKING/IMPORT/CRM/API/REFERRAL) · attribution FIRST once / LAST update · report by source · หน้า 13
- oracle: resolveSource 9 ทาง (9) · first ไม่ทับ/last ทับ (2) · report ตัวเลขตรง seed (3) · ภาพ (2)

### M1.9 — tiers engine (Opus · 26 ข้อ)
- §5.4 + AutomationRule scope MEMBER_TIER (upgrade/keep) · เงื่อนไข spent{window}/visits/tierPoints/memberDays/paidPlan/referrals · evaluate → applyTierChange (history evidence · legacy enum sync · welcome voucher hook) · runTierReview (grace/notifyBefore/at_risk event) · dry-run · setManual (approval) · benefitsFor facade · paid plan link (MemberPlan/Subscription เดิม)
- oracle: evaluate 6 กรณีเงื่อนไข (6) · เลื่อนทันทีหลัง sale (2) · review: คง/ลด/ผ่อนผัน/แจ้ง 30 วัน (6) · manual + approval + until (4) · archive tier ย้ายคน (2) · benefitsFor รวม (3) · events (3)

### M1.10 — ระดับ UI (Sonnet · 16 ข้อ · ภาพ 04 · 15)
- บันได · ตัวสร้างกฎ reuse AutomationBuilder (scope prop) · benefits editor 9 ชนิด · dry-run panel · history table · paid plan card · ตัวอย่างบัตร LINE
- oracle: actions ครบ + สิทธิ์ (8) · static/testid (4) · ภาพ 2 owner (ธนาไม่มีสิทธิ์ = 404) (4)

### M1.11 — REST/AI ชุดแรก (Opus · 24 ข้อ · ภาพ 27 ขวา)
- `member/api/registry.ts` + ops ~45 ตาม MEMBER-API §2.1–2.5 + `me.get/update/card` · route `/api/v1/member/[...]` reuse dispatch กลาง · bundle scopes 3 · generator + docs + endpoints.md + skill `members` v2 (tools M1) + webhook events M1 + OpenAPI · หน้า `settings/api`
- oracle: ทุก op มี test (F13.4) · 404-not-403 · readonly ไม่เห็นอ่อนไหว (3) · idempotency (2) · APPROVAL_REQUIRED shape (1) · tools propose→confirm ใช้ Membership จริง (3) · manifest โหลด (1) · docs = registry (1) · rate limit (1) · ตัวอย่าง curl 3 เส้นทำงานจริงบน QC server (3)

### M1.12 — มือถือ + แชท side panel (Sonnet · 14 ข้อ · ภาพ 26 · 28ก,ข)
- responsive M1 ทุกหน้า (≤390) · `chat/context-panel.tsx` + `member.linkContact` (เขียน partyId/customerId/linkedBy + event `chat.contact.linked` ลง 3 ทะเบียน) · เลือกจาก 2 คน/สมัครจากแชท · ปุ่มด่วน (stub M2)
- oracle: linkContact 4 วิธี + ไม่พบ (5) · event (2) · แผง DTO (3) · ภาพมือถือ 3 + แชท 1 (4)

### M2.1 — point rules/lots/expiry (Opus · 28 ข้อ)
- §5.5 · migration PointRule/PointLot/PointTransfer + PointLedger cols + PointSettings cols · backfill lots (ไม่ตัดย้อนหลัง) · cron expireDue/expiringSoon · events point.* ลง 3 ทะเบียน
- oracle: computeEarn breakdown 6 กฎ + exclude gift/voucher + เพดานวัน (8) · earnWithLot expiresAt ตาม mode/ระดับยกเว้น (4) · burnFifo ตัดล็อตเก่าก่อน + reverse คืนล็อต (4) · expireDue idempotent + balance + event (4) · expiringSoon (2) · backfill (3) · settings (3)

### M2.2 — transfer/adjust/settings UI (Sonnet · 16 ข้อ · ภาพ 16)
- transfer (OTP ผ่าน platform_auth · cap/fee) · adjust + approval (`MEMBER_POINT_ADJUST`) · หน้าตั้งค่าแต้ม (ก–จ) + ผลกระทบ · ledger รวม · ใกล้หมดอายุ
- oracle: transfer สำเร็จ/ไม่พอ/เกิน cap/ไม่มี OTP (5) · adjust ≤/> เพดาน (3) · settings persist (3) · ภาพ (2) · static (3)

### M2.3 — stamp (Opus · 22 ข้อ · ภาพ 17)
- §5.6 · migration StampCard/Progress/Event · addStamp กฎ 5 ชนิด · PIN/QR/auto · completeCycle → voucher(stub→M2.5)/points/reward · autoRestart · expire · merge hook · editor + การ์ดจริง + สถิติ
- oracle: addStamp ตามกฎ + perDayMax + tier/unit (7) · complete → reward + restart (4) · void/expire (3) · auto จาก sale/visit (consumer) (3) · idempotency (1) · UI/ภาพ (4)

### M2.4 — reward v2 (Sonnet · 16 ข้อ · ภาพ 18 · 05)
- Reward cols · redeem ด้วยแต้ม/สแตมป์ · limits ต่อคน/เดือน/ระดับ/สาขา · QR code + expiresAt pickup · fulfil/cancel (คืน) · หน้า editor/รับของ/ประวัติ · LIFF list (M2.9 ใช้)
- oracle: redeem 5 เงื่อนไข (5) · fulfil/cancel/expire (4) · lookup QR (2) · หน้า 05 catalog (2) · ภาพ (3)

### M2.5 — voucher (Opus · 26 ข้อ · ภาพ 19)
- §5.7 · migration VoucherTemplate/Voucher · issue (รายคน/segment stub → M3.1 รับ customerIds) · approval เพดาน · validate/redeem/release/cancel/expire · origin/originRef · merge hook · tier welcome hook (M1.9) · stamp reward hook (M2.3) · หน้า voucher + โมดัล
- oracle: issue idempotent ต่อ (customer, originRef) (3) · เพดาน → approval → issue เมื่ออนุมัติ (4) · validate 6 เงื่อนไข (6) · redeem atomic ACTIVE→USED · ซ้ำ → CONFLICT (3) · release/void (2) · expire + expiring (3) · events (2) · ภาพ (3)

### M2.6 — gift card (Opus · 24 ข้อ · ภาพ 20)
- §5.7 · migration GiftCard/GiftCardTxn · sell (PosSale line GIFT_CARD_SALE ไม่ให้แต้ม) · PIN hash + lockout · use/reload/transfer/suspend/expire · **accountingLink** (D3): เปิด → เอกสารบัญชี "รับเงินล่วงหน้า" ตอนขาย · รับรู้รายได้ตอนใช้ · รายได้อื่นตอนหมดอายุ ผ่าน facade บัญชี (ตรวจ chart ที่บัญชี V2 มี) · ปิด → ไม่แตะบัญชี · UI ขาย/ตั้งค่า/รายการ
- oracle: sell/use/balance/reload/transfer (7) · PIN ผิด 5 → lock (2) · accountingLink เปิด/ปิด → เอกสารบัญชีมี/ไม่มี + สลับกลางทาง (5) · expire (2) · idempotency (2) · fitness edge giftcard→account (1) · ภาพ (3) · events (2)

### M2.7 — wallet facade (Opus · 24 ข้อ · ภาพ 02 แท็บกระเป๋า)
- §5.8 getWallet/quoteApply/applyOnSale · ลำดับตายตัว · กันซ้อน settings · pointsToEarn preview · แท็บกระเป๋าสิทธิ์ใน 360
- oracle: quote 10 กรณี (ระดับ+voucher+คูปอง+แต้ม+gift · เกินยอด · ซ้อนห้าม · ขั้นต่ำ · หมดอายุ · ต่างสาขา) (10) · applyOnSale ใน tx จำลอง + rollback (4) · getWallet DTO ครบ (4) · perf ≤ 6 query (1) · ภาพ (2) · unit scope (3)

### M2.8 — POS integration + consumer (Opus · 30 ข้อ · ภาพ 06)
- แผงสิทธิ์ใน `pos/register` (UI) · `createSale` รับ `memberChoices` → `applyOnSale` · **ย้าย** `point.earn/member.recordSpend/logActivity` ออกจาก tx → consumer `pos.sale.paid` ใน `member-bridges.ts` (computeEarn→earnWithLot · สแตมป์ · attribution · review request hook · tier evaluate) · `pos.sale.voided` ย้อนครบ · gift card sale line · ตั้ง `giftCard.excludeFromPoints`
- oracle: บิลครบทุกสิทธิ์ → ยอด/แต้ม/สแตมป์/voucher USED/gift balance (8) · void → ย้อนทุกอย่าง (6) · consumer idempotent ×3 (2) · บิลไม่ล้มเมื่อ member consumer พัง (try/catch WARN) (2) · POS เดิมไม่มีสมาชิก ยังทำงาน (2) · ภาพ (2) · **regressions**: qc-acc-v2-pos-* ทั้งชุด · kanban-k3.3 · point/coupon/reward เดิม (8 ชุด = ข้อสอบ S7 ตรวจว่ารันแล้วเขียว)

### M2.9 — ฝั่งลูกค้า `/m/*` (Opus · 22 ข้อ · ภาพ 09)
- session ลูกค้า (platform_auth LINE login/OTP) · `/m/card` (QR token หมุน 24 ชม.) · `/m/wallet` · `/m/profile` (customerEditable · consent · PDPA ปุ่ม) · ใช้ได้ทั้ง LIFF และ WebView แอป (D4 · แอปเปิด URL เดียวกัน) · rate limit OTP
- oracle: session แยก + ตรวจเจ้าของทุก op (5) · QR token หมุน/หมดอายุ + พนักงาน lookup (4) · me.update เฉพาะ editable (3) · consent/PDPA จากลูกค้า → request (3) · ภาพ 3 จอ (3) · perf (1) · OTP limit (3)

### M2.10 — REST/AI ชุดสอง (Opus · 20 ข้อ)
- ops MEMBER-API §2.6–2.12 + me.* ~40 · tools · webhook events M2 · docs regen
- oracle: F13.4/F13.5 · idempotency ทุก write (5) · CUSTOMER session op (3) · tools propose ทุกตัว (6) · curl จริง 5 เส้น (5) · rate (1)

### M3.1 — segments (Opus · 20 ข้อ · ภาพ 21 ขั้น 1)
- `marketing/segments.ts` evaluateSegment (ฟิลด์ระบบ 26 · f.{key} filterable · tier · points · lastActivity · spent12m · visits · voucherCount · consent · source · unit · tags · lifecycle CRM) · AND groups OR · count/sample/save/scope · UI builder ประโยค + ผล + บันทึก
- oracle: 12 ชนิดเงื่อนไข (12) · AND/OR (2) · perf ≤ 400 ms บน seed (1) · save/scope (2) · UI/ภาพ (3)

### M3.2 — campaigns v2 (Opus · 26 ข้อ · ภาพ 21 · 07 ล่าง)
- migration MemberSegment/CampaignVariantStat + MktCampaign/MktRecipient cols · channels: LINE ผ่าน chat facade push message · อีเมล Resend · SMS provider interface (ไม่มี = ช่องปิด) · push `PushDevice` ลูกค้า · variant A/B · holdout hash คงที่ · attach voucher (issue ต่อคน origin CAMPAIGN) / coupon per-member · track open (pixel/LINE read) / use (consumer voucher.used/pos.sale.paid ≤ 30 วัน) · stats · เพดาน/วัน
- oracle: split variant/holdout deterministic (4) · consent ณ เวลาส่ง (3) · voucher issue ต่อ recipient idempotent (2) · track use (3) · เพดาน (2) · cancel (2) · stats สูตร ROI (3) · UI/ภาพ (4) · events (3)

### M3.3 — journey (Opus · 30 ข้อ · ภาพ 07 · 22)
- AutomationRule scope MEMBER_JOURNEY · trigger 24 + cron birthday.upcoming/inactive · condition set · action 10 (WAIT_THEN → AutomationRun scheduledAt + hourly cron) · re-entry · quota MEMBER · loop guard · holdout · dry-run · stats ขั้น×คน + holdout เทียบ · builder UI reuse AutomationBuilder (scope prop) · หน้า list + detail
- oracle: 6 journey สำเร็จรูป (birthday/new/inactive/at_risk/no_show/review) รันครบเส้น (12) · WAIT_THEN ถึงเวลาแล้วทำต่อ/ยกเลิกเมื่อปิด (4) · holdout ไม่ทำ action แต่บันทึก (2) · re-entry (2) · quota (2) · dry-run (2) · stats (2) · UI/ภาพ (4)

### M3.4 — reviews (Opus · 22 ข้อ · ภาพ 23 · 08 ขวา)
- migration MemberReview · request (journey/consumer หลัง booking.completed/pos) · submit (LIFF token) · reward points · reply · hide · escalate ≤ N → `kanban.createCardFromExternal` (sourceType REVIEW) · AI summary/draft (prompt อังกฤษ · MEMBER_ASSIST) · inbox UI + settings · Google ปิด (D5)
- oracle: request→token→submit 1 ครั้ง/ref (4) · แต้มรีวิว (2) · escalate → การ์ด + มอบหมาย (3) · reply/hide + คะแนนรวม (4) · summary cache (2) · events (2) · UI/ภาพ (3) · LIFF ภาพ (2)

### M3.5 — referrals (Opus · 20 ข้อ · ภาพ 24 · 08 ขวา)
- ReferralProgram (D6) · code/link/QR · attach ตอนสมัคร (source REFERRAL) · consumer member.created/pos.sale.paid → convert · reward both (points/voucher ตาม program · idempotent) · fraud (เบอร์/device) · reject · leaderboard · UI + LIFF share
- oracle: attach/self-refer/ซ้ำ (4) · convert on SIGNUP vs FIRST_PURCHASE ≥ min (4) · reward ทั้งสองแบบ (4) · cap/fraud (3) · leaderboard (1) · UI/ภาพ (4)

### M3.6 — notifications (Sonnet · 16 ข้อ · ภาพ 30)
- templates 8×4 · send (consent/quiet hours/digest) · ช่องทาง 4 · stats · UI + test send
- oracle: template render ตัวแปร (3) · consent block/transactional allow (3) · quiet hours เลื่อน (2) · digest รวม (2) · stats (1) · UI/ภาพ (3) · SMS ไม่มี provider = ปิด (2)

### M3.7 — history timeline (Opus · 24 ข้อ · ภาพ 08)
- consumers → MemberActivity: pos paid/voided · booking (event ใหม่ `booking.completed/no_show` ใน booking/service + ลง 3 ทะเบียน) · chat.contact.linked/message summary · account docs (facade listDocsByParty) · kanban linked cards · crm.deal.won (event ใหม่ + auto-link member) · loyalty ทั้งหมด · แท็บประวัติกรอง type/ช่วง/สาขา · unit scope
- oracle: แต่ละ consumer เขียน activity ถูก (10) · booking/crm events ลง 3 ทะเบียน (4) · กรอง (4) · unit scope (2) · ภาพ (2) · perf (2)

### M3.8 — reports (Sonnet · 18 ข้อ · ภาพ 25)
- reports.ts 7 ชุด · RFM สูตร (R/F/M quintile) · หนี้สินแต้ม = balance × costPerPoint(settings) · ROI = ยอด/ต้นทุน · holdout uplift · cohort รายเดือน · CSV · schedule email (cron 06:00)
- oracle: ตัวเลขตรง seed 7 ชุด (7) · RFM จัดกลุ่มถูก (3) · CSV (2) · schedule (2) · ภาพ (2) · perf (2)

### M3.9 — เทมเพลตกิจการ 16 (Sonnet · 18 ข้อ)
- `(templates)` (แผน · member/templates/) 16 ชุดตาม §10 (ส่วน/ฟิลด์/ระดับ/สแตมป์/journey) + ทั่วไป · apply ไม่ทับ · preview · UI เลือกตอนเปิดใช้ + ในตัวออกแบบ
- oracle: ทุกชุด apply ผ่าน validate (16) · idempotent (1) · preview นับถูก (1)

### M3.10 — REST/AI ชุดสาม + manifest (Opus · 22 ข้อ · ภาพ 27)
- ops §2.13–2.20 ~33 · tools ครบ ~40 · manifest skill · OpenAPI · webhooks CRUD + delivery HMAC + retry · api keys bundle UI · docs สมบูรณ์ (generator ทับ MEMBER-API.md)
- oracle: F13.4/F13.5 (2) · webhook delivery/sign/retry (4) · manifest schema (2) · tools propose/confirm 6 ตัวอย่าง (6) · curl 5 (5) · หน้า api ภาพ (1) · AI แชทตัวอย่าง proposal flow ภาพ (2)

### M3.11 — LIFF onboarding + แอปพนักงาน/ลูกค้า (Sonnet · 16 ข้อ · ภาพ 29 · 28)
- `/m/join` 3 ขั้น (src · OTP · fields customerEditable+required · referral · consent · policy) · แอปพนักงาน (Expo): ค้น/สแกน QR (token) / สรุป+ปุ่ม 4 / ประทับ PIN — เรียก REST ของ M2.10 · แอปลูกค้า: WebView `/m/*` + push device register
- oracle: join สำเร็จ/ซ้ำ/OTP ผิด/ผู้แนะนำ (5) · src attribution (2) · แอปพนักงาน 3 จอ QC render (3) · LIFF 3 จอ (3) · push device (2) · OTA/บิลด์ไม่ต้อง (1)

### M3.F — ปิด RUN (Fable)
qc:all เต็ม · prod verify migration a–h + backfill 6 สคริปต์ทีละร้าน (dry-run ก่อน) · `HANDOVER-…-MEMBER.md` · Telegram · memory · ขึ้นแผน CRM v2 (§14 พิมพ์เขียว)

## 3. ลำดับ/ขนาน
M1.1 → M1.2 → (M1.3 ∥ M1.4) → (M1.5 ∥ M1.7 ∥ M1.8 ∥ M1.9) → (M1.6 ∥ M1.10) → M1.11 → M1.12 → M2.1 → (M2.2 ∥ M2.3) → (M2.4 ∥ M2.5) → M2.6 → M2.7 → M2.8 → M2.9 → M2.10 → M3.1 → M3.2 → M3.3 → (M3.4 ∥ M3.5 ∥ M3.6) → M3.7 → (M3.8 ∥ M3.9) → M3.10 → M3.11 → M3.F — **เครื่อง 2 คอร์ = builder ทีละ 1** (ขนานได้เฉพาะ Fable เขียน oracle ล่วงหน้า)

## 3.1 สถานะสด (Fable อัปเดตทุกใบ)
| WO | สถานะ | วันที่ | commit | หมายเหตุ |
|---|---|---|---|---|
| M1.1 | ✅ DONE 28/28 · prod ✓ | 10 ก.ย. | `f3c0f49` | migration `member_v2_a` (18 ตาราง · 13 enum · +29 คอลัมน์ Customer) · `channels.ts` 15 key · backfill 6 สคริปต์ · seed 60 คน/120 บิล/40 นัด/10 แชท · โน้ต `wo-notes/member-M1.1.md` |
| M1.2 | ✅ DONE 27/27 | 10 ก.ย. | (ดู §4) | `member/fields.ts` engine · `limits.ts` · templates dive/general · seed ใช้ applyTemplate · โน้ต `wo-notes/member-M1.2.md` |
| M1.3 | ✅ DONE 14/14 (ภาพ parity ผ่านรอบ 2) | 10 ก.ย. | (ดู §4) | FieldDesigner (dnd-kit) · permissions member.* 30 · access.ts · nav.ts 9 หมวด · MemberTabs/Icon · `wo-notes/member-M1.3.md` |
| M1.4 | ✅ DONE 37/37 · prod ✓ | 10 ก.ย. | `1e5550c` | migration `member_v2_b` (phone2/facebook/USER) · profile.ts (create/update/360/linkIdentity/duplicates/merge/briefFor) · privacy.ts canViewSensitive · point/index.ts facade · backfill ตัวที่ 7 referral-codes · `wo-notes/member-M1.4.md` |
| M1.5 | ✅ DONE 20/20 · ภาพ 01/02 ผ่าน (ตีกลับ 2 รอบ) | 10 ก.ย. | (ดู §4) | `member/list.ts` `views.ts` · หน้า members + [memberId] · `wo-notes/member-M1.5.md` |
| M1.6 | ✅ DONE 14/14 · ภาพ 10/11/12 ผ่าน (ตีกลับ 1 รอบ) | 10 ก.ย. | `3efa888` | import.ts (autoMapping/preview/import) · members-actions · duplicates-actions · หน้า members/new|import|duplicates · `wo-notes/member-M1.6.md` |
| M1.7 | ✅ DONE 26/26 · ภาพ 14 ผ่าน | 10 ก.ย. | (ดู §4) | `member/privacy.ts` เต็ม · settings/privacy · migration `member_v2_b2` (effectiveAt nullable) · `wo-notes/member-M1.7.md` |
| M1.8 | ✅ DONE 15/15 · ภาพ 13 ผ่าน (ตีกลับ 1 รอบ) · prod รอ migration b3 | 10 ก.ย. | `3efa888` | sources.ts (links/QR/hit/attribution/recordFirstPurchase/report) · settings/sources · migration `member_v2_b3` (costSatang) · `wo-notes/member-M1.8.md` |
| M1.9 | ✅ DONE 26/26 | 10 ก.ย. | (ดู §4) | `member/tiers.ts` (evaluate/apply/review/manual/benefits) · cron tierReviews · approval-effects member.tier.manual · เอนจิน automation เดิมกรอง scope KANBAN · `wo-notes/member-M1.9.md` |
| M1.10 | ✅ DONE 12/12 · ภาพ 04/15 ผ่าน | 10 ก.ย. | `3efa888` | หน้า tiers + tiers/[tierId] (บันได · TierRuleBuilder · benefits 10 ชนิด · ทดลองรัน · ประวัติ · แบบเสียเงิน) · `wo-notes/member-M1.10.md` |
| M1.11 | ✅ DONE 26/26 · ภาพ 27 ขวา ผ่าน | 10 ก.ย. | `3efa888` | registry 68 op · route /api/v1/member · bundle 3 · generator + skill shark-member-api · tools-member 22 · settings/api · แกน REST additive (customer_session_required · X-RateLimit-Limit · auditTarget · idempotency key) · core/origin.ts dynamic env · F13.7–9 · `wo-notes/member-M1.11.md` |
| M1.12 | ✅ DONE 14/14 · ภาพ 26/28 ผ่าน | 10 ก.ย. | `3efa888` | chat-bridge.ts (linkContact/chatPanelFor/registerFromChat) · ChatMemberPanel · chat.contact.linked 3 ทะเบียน · seed/harness ผูก ChatSetting.memberSystemId · `wo-notes/member-M1.12.md` |
| M2.1 | ✅ DONE 30/30 (Fable รันซ้ำ) · regressions qc-point 18/18 · m1.2/m1.4/m1.9 ผ่าน · ไม่มีภาพ | 10 ก.ย. | `530b1f9` | `scripts/qc-member-m2.1.mts` · migration `member_v2_c` · PointRule/PointLot/PointTransfer · point/{rules,lots,internal,db}.ts · backfill `member-backfill-points-lots.mts` · ไม่มีภาพ · มติ builder ยอมรับ: PointLedger.data (lotIds) · setPointSettings รับ 2 รูป (M2.2 รวบ) · daysLeft floor · หนี้→M2.2 adjustPoints ล็อต · point.transferred ยังไม่ยิง · M2.8 เสียบ computeEarn |
| M2.2 | ⏳ oracle พร้อม (16 ข้อ) + สเปคภาพ 16 | — | — | `scripts/qc-member-m2.2.mts` |
| M2.3 | ⏳ oracle พร้อม (22 ข้อ) + สเปคภาพ 17 (TMP23) | — | — | `scripts/qc-member-m2.3.mts` |
| M2.4 | ⏳ oracle พร้อม (16 ข้อ) + สเปคภาพ 05/18 (TMP24) | — | — | `scripts/qc-member-m2.4.mts` · migration `member_v2_d2` (Reward/Redemption +cols — WO table เดิมเขียน "—" แต่คอลัมน์ยังไม่มีในสคีมา) |
| M2.5 | ⏳ oracle พร้อม (26 ข้อ) + สเปคภาพ 19 (TMP25) | — | — | `scripts/qc-member-m2.5.mts` · VoucherIssueBatch (เก็บคำขอรออนุมัติ) · composition root `src/lib/member-hooks.ts` |
| M2.6 | ✅ DONE 24/24 · ภาพ 20 ผ่าน (owner desktop/mobile · sell drawer · settings · thana · noperm 404) · Fable แก้ข้อสอบ 2 จุด (source STAFF→WALK_IN · merge confirm) · TMP26 ต้อง enabled + posSystemId | 10 ก.ย. | `530b1f9` | `scripts/qc-member-m2.6.mts` · migration `member_v2_f` · giftcard/{service,index,db,errors,giftcard-actions}.ts · pos/index.ts (facade ใหม่ · หนี้ย้ายผู้เรียกเดิม 15 ที่) · member.memberRefs() · merge ผ่าน dynamic import · บัญชี 2110/4030/4900 · UI promotions/giftcards + settings |
| M2.7 | ⏳ oracle พร้อม (24 ข้อ) + สเปคภาพ 02 แท็บกระเป๋า (TMP27) | — | — | `scripts/qc-member-m2.7.mts` · member/wallet.ts · MEMBER_LIMITS.vouchersPerSale · stamp.previewForCart |
| M2.8 | ⏳ oracle พร้อม (30 ข้อ) + สเปคภาพ 06 (TMP28 · harness เพิ่ม step select) | — | — | `scripts/qc-member-m2.8.mts` · member-bridges.ts (composition root) · createSale memberChoices · regressions 8 ชุดผ่าน qc-all log |
| M2.9 | ⏳ oracle พร้อม (22 ข้อ) + สเปคภาพ 09 (--user customer:<code>) | — | — | `scripts/qc-member-m2.9.mts` · migration `member_v2_f2` (CustomerSession/CustomerOtp/cardToken — `g` สงวนให้ M3.1/M3.2 ตามตาราง WO) · customer-session.ts + me.ts · /m/[slug]/* |
| M2.10 | ⏳ oracle พร้อม (20 ข้อ) | — | — | `scripts/qc-member-m2.10.mts` · ops ชุดสอง ~66 · customer token cs_ เป็น Bearer · curl จริงบน QC server |
| M3.1 | ⏳ oracle พร้อม (20 ข้อ) + สเปคภาพ 21 ขั้น 1 (TMP31) | — | — | `scripts/qc-member-m3.1.mts` · migration `member_v2_g` (MemberSegment) · engine ที่ member/segments.ts · marketing/segments.ts re-export |
| M3.2 | ⏳ oracle พร้อม (26 ข้อ) + สเปคภาพ 21/07 | — | — | `scripts/qc-member-m3.2.mts` · migration `member_v2_g2` · deps injection ส่ง 4 ช่องทาง · chat/index.ts pushToContact · core/sms.ts · fitness marketing→voucher/coupon/chat |
| M3.4 | ⏳ oracle พร้อม (22 ข้อ) + สเปคภาพ 23/08 ขวา + LIFF (TMP34) | — | — | `scripts/qc-member-m3.4.mts` · migration `member_v2_h` (MemberReview +requestTokenHash/submittedAt · ReviewStatus +REQUESTED · KanbanCardSourceType +REVIEW) · reviews.ts · /m/[slug]/review/[token] |
| M3.5 | ⏳ oracle พร้อม (20 ข้อ) + สเปคภาพ 24/08 ขวา + LIFF (TMP35) | — | — | `scripts/qc-member-m3.5.mts` · ไม่มี migration · referrals.ts · /r/[code] · /m/[slug]/referral |
| M3.6 | ⏳ oracle พร้อม (16 ข้อ) + สเปคภาพ 30 | — | — | `scripts/qc-member-m3.6.mts` · **Fable ตัดสิน: ต้องมี migration `member_v2_h2` ตาราง MemberNotification** (คิว/digest/stats) · notifications.ts + notification-events.ts (8×4) · /member/settings/notifications |
| M3.7 | ⏳ oracle พร้อม (24 ข้อ) + สเปคภาพ 08 (TMP37) | — | — | `scripts/qc-member-m3.7.mts` · ไม่มี migration · history.ts + history-kinds.ts (9 kinds) · event ใหม่ booking.completed/no_show · crm.deal.won · shop.order.paid · read-through account listDocsByParty + kanban listCardsForTarget |

## 4. บันทึกเหตุการณ์
- **10 ก.ย. 19:45 UTC** — M2.1 ส่งมอบ (Opus · 30/30 · Fable รันซ้ำ 30/30 · regressions ผ่าน) · M2.6 ส่งมอบ (Opus · 22/24 เหลือภาพ) · builder พบบั๊กในข้อสอบ M2.6: `source: "STAFF"` ไม่ใช่ MemberSource (ต้อง WALK_IN) + mergeMembers ต้อง confirm:"MERGE" → Fable แก้ข้อสอบ + กวาดแก้ oracle M3.4–M3.7/harness ที่เขียนผิดแบบเดียวกัน · เขียน oracle M3.5 (20) · M3.6 (16 · ตัดสินให้มี migration member_v2_h2 MemberNotification) · M3.7 (24) + สเปคภาพ 3.5/3.6/3.7 + TMP26 (gift card 4 ใบ) · กำลัง build QC server เพื่อถ่ายภาพ 2.6
- **10 ก.ย. 19:10 UTC** — Vercel READY `3efa888` (shark-36pjfx3v6) · prod `_prisma_migrations` มี `20261015000000_member_v2_b3` (finished 18:57 UTC) · ตาราง MemberTierDef/MemberChannelIdentity/MemberField ครบ · ไม่ต้อง backfill · เขียน oracle M3.4 (รีวิว · 22 ข้อ · migration member_v2_h · TMP34 + สเปคภาพ 3.4 · LIFF /m/[slug]/review/[token]) tsc ผ่าน
- 10 ก.ย. 2569 — เขียนแผน 34 ใบ + สัญญาย่อ + จำนวนข้อสอบ · รอเจ้าของสั่งเริ่ม (D9)
- 10 ก.ย. 2569 14:30 — เจ้าของถาม 4 ข้อ → เพิ่มมติ D17 (สิทธิ์อ่อนไหว × HR) · D18 (ตัวตนหลายช่องทาง) · D19 (ทะเบียนช่องทางเปิดขยาย + marketplace) + §0.1 บทบาท/ขั้นตอนต่อใบ · แก้ M1.1/M1.4/M1.7/M1.8/M1.12/M3.7 · oracle ≈ 740 · ภาพ 02/14/26 แก้
- 10 ก.ย. 2569 (session สมาชิก) — **เริ่ม RUN**: worktree `/root/projects/shark-member` (branch `session/member` จาก main `91e18e3`) · เขียน `scripts/member-qc-env.mts` (สัญญาชุดข้อมูล: สมาชิก 60 = 30/15/10/5 · ป่าตอง 40/กะตะ 20 · บิล 120 · นัด 40 · แชท 10 · LINE identity 30 · consent 40 · ฟิลด์ดำน้ำ 45 · สุขภาพ 12 · วันเกิด ต.ค. 12) · oracle M1.1 28 ข้อ (S1 schema 12 · S1b ทะเบียนช่องทาง 2 · S2 backfill 8 · S3 seed 4 · S4 scope/fitness 2) · tsc ผ่าน · SKIPPED ก่อนมีโค้ด
- 10 ก.ย. 2569 — **มติเทคนิคของ Fable (M1.1)**: (1) D17 `HrEmployee.userId` → ใช้คอลัมน์เดิม `linkedUserId` (ความหมายเดียวกัน · `staff/service.ts` เขียนอยู่แล้ว) ไม่เพิ่มคอลัมน์ซ้ำ (2) D17 `hrDepartmentIds[]` → `hrDepartments String[]` เพราะ HR ไม่มีตาราง Department (`HrEmployee.department` เป็นข้อความ) (3) backfill ข้อ 4 (points-lots) ย้ายไป M2.1 (ตาราง PointLot เกิดที่ migration `member_v2_c`) · M1.1 มี 6 สคริปต์ = tiers · fields · consent · party-links · attribution · **hr-users** (ใหม่ · แยกจาก party-links) (4) seed ใส่ส่วน/ฟิลด์เทมเพลตดำน้ำตรง ๆ ในรอบ M1.1 (engine ยังไม่มี) → M1.2 เปลี่ยนเป็น `applyTemplate` (5) enum `MemberConsentSource` ใช้เป็นชนิดของ `MemberFieldValueHistory.changedVia` ตามพิมพ์เขียว
- 10 ก.ย. 2569 — **M1.1 ปิด 28/28** (builder Opus ~2:40 ชม. · Fable รันซ้ำเอง ผ่านครบ · tsc ✓ · fitness 23/23 ทั้ง 2 โหมด · regressions kanban-k1.1 30/30 · acc-v2-pos-lines 87/87 · migrate diff = empty) · **ข้อแย้งของ builder ถูก 2 เรื่อง → Fable แก้ข้อสอบ**: (1) `hasIdx` เดาว่า pg ใส่คำพูดทุกคอลัมน์ (คอลัมน์ตัวพิมพ์เล็ก key/name/code ไม่มีคำพูด) (2) วันเกิด seed ต้องเป็นปีเกิดจริง ไม่ใช่ 2026 → ข้อสอบนับ "เดือน 10 ปีใดก็ได้" · **ข้อตัดสินเพิ่ม**: `SystemType.BOOKING` ถูกเพิ่ม (additive) เพราะ MQC.systems ระบุ BOOKING ทั้งที่โมดูลจองไม่มี AppSystem — คงไว้ (ลบค่า enum ใน PG ไม่ได้) · `TagColor` enum ใหม่ 6 ค่า · ตารางใหม่ไม่ผูก FK ข้ามโมดูล · **หนี้**: 3 ชุดเดิม (`qc-chat-member-autolink` `qc-point` `qc-member-tier`) ยัง `loadEnvFile(".env")` ต้องย้ายมา loadQcEnv · seed ส่วนเทมเพลตดำน้ำยัง insert ตรง → M1.2 เปลี่ยนเป็น applyTemplate · backfill prod รอทำหลัง Vercel READY (dry-run ก่อน)
- 10 ก.ย. 2569 06:26Z — **prod**: Vercel READY `f3c0f49` · `_prisma_migrations` มี `20261012000000_member_v2_a` (finished 06:23Z) · backfill 6 สคริปต์บน prod (dry-run ก่อน → รันจริง → รันซ้ำ = 0): ร้านที่มีระบบสมาชิก 6/10 → TierDef 24 · กฎเลื่อนระดับ 18 · ส่วนระบบ 24 · ฟิลด์ระบบ 156 · สมาชิกจริงยัง 0 คน (consent/party/attribution แตะ 0) · HR ไม่มีอีเมล 8 คน (ผูกไม่ได้ — เจ้าของกรอกอีเมลพนักงานใน HR แล้วรันซ้ำได้) · 3 ชุดข้อสอบเดิมย้ายออกจาก `.env` (`227c6e0`) เขียว 11/11 · 18/18 · 7/7
- 10 ก.ย. 2569 — **M1.2 ปิด 27/27** (builder Opus ~32 นาที · Fable รันซ้ำ 27/27 · M1.1 regression 28/28 · tsc ✓ · fitness 23/23 ×2) · ข้อแย้ง builder ถูก 2: (1) `"ยาว".repeat(100)` = 300 ตัวอักษร ไม่ใช่ 200 → แก้ข้อสอบ (2) key ฟิลด์รับ camelCase (`[a-z][a-zA-Z0-9_]*`) เพราะฟิลด์ระบบ/เทมเพลตเป็น camelCase · เพดาน filterable 20 บังคับตอนเปิดสวิตช์ (updateField) ไม่ใช่ตอนสร้าง · **ข้อตัดสิน**: `member/db.ts` re-export prisma (F5 ratchet 45/45 เต็ม แบบ kanban/db.ts) · `applyTemplate(ctx,key,{onlyFieldKeys?})` เพิ่มตัวเลือกให้ seed จำลองร้านที่ใช้เทมเพลตรุ่นก่อน · DATE เก็บเที่ยงคืน UTC อ่านด้วย getUTC* · ตัวกรองฟิลด์กำหนดเอง 2 จังหวะ (ค่า → id → where) · **หนี้ → M1.4**: `phone2`/`facebook` ยังไม่มีคอลัมน์ (throw ไทย ไม่แอบเก็บ) → migration `member_v2_b` (additive) + `MemberLookupTarget.USER` ให้ฟิลด์ระบบ `ownerUserId` (คอลัมน์เก็บ userId ไม่ใช่ HrEmployee) · ข้อสอบ M1.2 finally ลบฟิลด์เทมเพลตครบชุดแล้ว
- 10 ก.ย. 2569 — **M1.3 ปิด 14/14** (builder Sonnet · ตาย 429 session limit กลางทาง → resume ตัวเดิมหลัง 07:30 UTC · ตีกลับรอบ 1 เพราะภาพไม่ตรง mockup 03: ผืนกลางต้องเป็นฟอร์มจริง+ค่าตัวอย่าง · ปุ่มบันทึก · แถบล่าง · มือถือกล่องซ้อน → รอบ 2 ผ่าน) · **ข้อตัดสิน**: `@dnd-kit` 3 แพ็กเกจติดตั้งใหม่ (ไม่เคยมีในโปรเจกต์) · gate ของ fields-actions ใช้ `canManageSettings()` จาก access.ts แทน assertCan เพราะ rbac.evaluate ให้ MANAGER ผ่านทุก action (ขัด §6.1) · `qc-nav-functions.mts` เพิ่มบล็อก S0.3 (เมนูสมาชิกย้ายมาทะเบียน nav.ts) · harness: สเปคที่ไม่ผูก user ต้องไม่ถ่ายซ้ำโดย user อื่น (ภาพทับ) · oracle M1.4 เพิ่ม S0.0 (migration member_v2_b) · oracle M1.4/M1.9/M1.7 สร้างนโยบายอนุมัติเอง (ไม่มีนโยบาย = autoApproved)
- 10 ก.ย. 2569 — **M1.4 ปิด 37/37** (builder Opus ~35 นาที · Fable รันซ้ำ 37/37 · M1.2 ×2 ไม่ reseed 27/27 หลังแก้ finally · tsc ✓ · fitness 23/23 ×2 · approval 3 ชุด 7/16/12 หลังย้ายออกจาก .env) · **ข้อแย้ง builder ถูก**: (1) seed ไม่แจก referralCode → เพิ่ม **backfill ตัวที่ 7** `member-backfill-referral-codes.mts` (prod ต้องรัน) (2) M1.2 finally ไม่ลบ history nickname → แก้ข้อสอบ · **ข้อตัดสิน**: `MemberLookupTarget.USER` สำหรับ ownerUserId · `point/index.ts` facade ใหม่ · การเชื่อมต่อ 360 นับแถวด้วย prisma read (ห้องแชทนับจากเบอร์ตรงด้วย) · รวมคนต้องล้างเบอร์/อีเมลฝั่งถูกรวมก่อน (unique) · **Fable เพิ่ม**: approval labels/whitelist `member.merge` `member.tier.manual` `member.erase` (เจ้าของตั้งนโยบายจาก UI ได้ · ไม่มีนโยบาย = ทำทันที) · หนี้: attribution.linkId (M1.8) · tier.next (M1.9) · consumer 5 ตัว no-op
- 10 ก.ย. 2569 08:53Z — **prod M1.4**: Vercel READY `1e5550c` · `_prisma_migrations` มี `member_v2_b` (08:49Z) · backfill prod: fields (ownerUserId target USER · 6 ร้าน) + referral-codes (สมาชิก 0 → แจก 0)
- 10 ก.ย. 2569 — **M1.9 ปิด 26/26** (builder Opus ~25 นาที · Fable รันซ้ำ 26/26 · tsc ✓ · fitness 23/23 ×2 · 3 ชุดเดิม cron/automation/ai-automation ย้ายออกจาก .env → 4/13/4 เขียว) · **ข้อตัดสิน**: `match` เก็บใน `AutomationRule.actionConfig.match` (backfill เดิมบน prod = ALL) · ไม่มีกฎคง = ใช้กฎเลื่อนของระดับนั้นเป็นเกณฑ์คง · visits12m = วันไม่ซ้ำ (บิล PAID + นัด DONE/CONFIRMED) · คำขอตั้งระดับมือรออนุมัติ = แถว TierHistory MANUAL evidence.pending · **เอนจิน automation v1 รั่ว**: engine.runForEvent/service.listRules ไม่กรอง scope → เพิ่ม `scope: "KANBAN"` · บั๊กที่ข้อสอบจับได้ 2: clamp memberDays กลืนวันอนาคต · กรอง paidAt ≤ now ตัดบิลชุด QC (วันที่อนาคต) · ปิดหนี้ tier.next ของ 360
- 10 ก.ย. 2569 — **M1.9 prod**: Vercel READY `0de54cf` (09:21Z · ไม่มี migration)
- 10 ก.ย. 2569 — **M1.5 ปิด 20/20** (builder Sonnet · ตีกลับภาพ 2 รอบ: แถบกรอง/คอลัมน์ซ้ำ/สีชิป/display ไทย/ระดับถัดไป → LOOKUP ชื่อ) · ข้อแย้ง builder ถูก: Next ห้าม `[id]` ซ้ำใน route → หน้า 360 อยู่ที่ `members/[memberId]` (แก้ข้อสอบ) · เทมเพลตดำน้ำ diveCount ต้อง filterable (แก้ template) · **บั๊กที่ oracle จับได้**: listFields รั่วเบอร์เต็ม · unit scope รั่วเมื่อส่ง unit= คู่กับกิจกรรมข้ามสาขา (แก้แล้ว) · profile.ts เพิ่ม resolveLookupNames + displayOf ไทย · `member-source-labels.ts` ใหม่
- 10 ก.ย. 2569 — **M1.5 prod**: Vercel READY `90127a2` (10:46Z)
- 10 ก.ย. 2569 — **M1.7 ปิด 26/26** (builder Opus ~37 นาที · ภาพ 14 ผ่านรอบแรก) · ข้อตัดสิน builder รับ 2: (1) `WHATSAPP.canConsent = true` (canNotify คงเดิม — ยินยอมเก็บได้ก่อนมี adapter) (2) migration `member_v2_b2` = ปลด NOT NULL `MemberPrivacyPolicy.effectiveAt` (ร่าง = null · ผ่อนคลายล้วน ตารางบน prod ว่าง) · เพิ่ม `src/lib/core/sanitize.ts` จริง (ถอดจาก XREF_BASELINE) · `MemberSettingsTabs` แท็บย่อยตั้งค่า · point facade +listCustomerLedger · หนี้ 6 ข้อใน wo-notes (ปุ่มดาวน์โหลดสำเนา · ข้อความ consent แก้เองไม่ได้ ฯลฯ)
- 10 ก.ย. 2569 18:40 ไทย — **เจ้าของสั่ง RUN ยาว + ปล่อย sub-agent เต็มที่** → เปิดโหมดขนาน: M1.8 (Opus) ∥ M1.6 (Sonnet) ∥ M1.10 (Sonnet) บน worktree เดียว (ไฟล์ไม่ชน) · งานหนักต่อคิว with-gate-lock · Fable ตรวจรับ/build/ภาพ/commit ทีละใบตามลำดับที่เสร็จ · M1.7 prod: Vercel READY `fbde9ed` + migration `member_v2_b2` (11:28Z)

- 10 ก.ย. ~12:55 UTC — **M1.10 DONE 12/12** ภาพ 04/15 ผ่าน (benefit 10 แถว: builder เพิ่ม "ส่วนลดจำนวนคงที่" เกินภาพ 15 — ยอมรับ) · **M1.8 ตีกลับรอบ 1**: มือถือการ์ด "สมาชิกใหม่ต่อช่องทาง" ล้นแนวนอน (harness วัด scrollWidth) + ภาพ 13 มีตัวเลือกช่วงวัน (?days=) · **M1.6 ตีกลับรอบ 1**: ตรรกะ 11/11 ผ่าน แต่ภาพ 10 (QR โชว์ตลอด · ขาด LINE/แคมเปญ/พนักงานที่รับ · ไม่มีแถบล่าง) · ภาพ 11 (การ์ดแทนตาราง · ไม่มีชิปเหตุผล/ข้อมูลย่อ/ปุ่มสแกน · หัวแผงถูกตัดคำ) · ภาพ 12 (ขั้น 2 คอลัมน์เดียว ตั้งค่าไปอยู่ขั้น 3 · ไม่มีชิปสถานะต่อคอลัมน์) · harness 1.6: ขั้น 2 ต้องกด "ถัดไป" หลังอัปโหลด (รอปุ่ม enabled) · dup-option ย้ายไปขั้น 2 · builder Opus M1.8 โดน 429 session limit อีกรอบ (ปลุกซ้ำหลังรีเซ็ต) · ปล่อย **M1.11 (Opus) ∥ M1.12 (Sonnet)** ขนานเพิ่ม → 4 builder พร้อมกัน
- 10 ก.ย. ~13:40 UTC — เขียน oracle ล่วงหน้า **M2.3 (22) · M2.4 (16) · M2.5 (26)** + สเปคภาพ 2.3/2.4/2.5 (TMP23/24/25) · fitness F2 เพิ่มเส้น M2.x: point→member/approval · stamp→member/point/voucher · member→stamp · reward→stamp/member · voucher→member/approval · ข้อตัดสิน: M2.4 ต้องมี migration `member_v2_d2` (Reward +11 คอลัมน์ · Redemption +5) · M2.5 เพิ่มตาราง `VoucherIssueBatch` เพราะ ApprovalRequest ไม่มีช่องเก็บ payload · hook ย้อนกลับ (tier/stamp → voucher) ลงทะเบียนที่ `src/lib/member-hooks.ts` · **M1.6 ตีกลับรอบ 1 ส่งแล้ว 14/14 (รอถ่ายภาพหลัง build)** · M1.8 ตีกลับรอบ 1 ส่งแล้ว 14/15 (รอภาพ) · รอ M1.11/M1.12 ให้ tsc เขียวก่อน build ครั้งเดียวถ่าย 4 ใบ
- 10 ก.ย. ~14:40 UTC — **M1.11 ส่ง 25/26 · M1.12 ส่ง 11/14** (4 builder ขนานจบครบ) · tsc เขียว · fitness 26/26 ทั้ง 2 โหมด (M1.11 เพิ่ม F13.7–9 · แก้ core/origin.ts ให้ env เป็น dynamic import — regression จาก sources.ts ของ M1.8) · เขียน oracle ล่วงหน้าเพิ่ม **M2.6 (24) · M2.7 (24) · M2.8 (30) · M2.9 (22)** + สเปคภาพ · fitness F2 เพิ่มเส้น giftcard→pos/account/member · member→voucher/giftcard/reward/coupon · build QC server ครั้งที่ 19 เพื่อถ่าย 1.6/1.8/1.11/1.12
- 10 ก.ย. ~15:30 UTC — build #19 ล้ม 2 รอบ: (1) ห่อ acc-v2-serve.sh ด้วย with-gate-lock ซ้อน (สคริปต์ล็อกเองอยู่แล้ว → flock ซ้อนรอ 30 นาทีแล้วตาย) (2) `next build` type-check รวม scripts/*.mts → oracle M3.1 ใช้ relation ที่ไม่มีใน CustomerWhereInput → แก้เป็น P (Any) · 🔴 บทเรียน: **ห้ามห่อ acc-v2-serve.sh ด้วย with-gate-lock** และ oracle ที่เขียนล่วงหน้าต้อง tsc ผ่านก่อน build เสมอ · เขียน oracle เพิ่ม **M2.10 (20) · M3.1 (20) · M3.2 (26)** · M2.9 migration เปลี่ยนชื่อเป็น `member_v2_f2` (g/g2 สงวนให้ M3.1/M3.2)
- 10 ก.ย. ~19:40 UTC — **M1 batch ปิด 5 ใบ (M1.6 14/14 · M1.8 15/15 · M1.10 12/12 · M1.11 26/26 · M1.12 14/14) commit `3efa888` push main** · regressions M1.2–M1.10 + chat-autolink + m1.1 reseed 28/28 (รอบแรก S3.1 flake เพราะข้อมูลชั่วคราวของภาพ 1.12 · รอบสองผ่าน) · fitness 26/26 ×2 · ข้อค้นพบ 1.12: แผงสมาชิกในแชทอ่าน `ChatSetting.memberSystemId` — ชุด QC ไม่ได้ผูก → seed+harness ผูกให้ (ไม่ใช่บั๊ก builder) · หนี้: brief.spent12m อ่าน cache ที่ cron ยังไม่ refresh (M3.9) · เขียน oracle M3.3 journey (30) + spec ภาพ 3.3 · **ปล่อย M2.1 (Opus) ∥ M2.6 (Opus)** · build #19 ต้องรัน `acc-v2-serve.sh` ตรง ๆ (ห้ามห่อ with-gate-lock) และ container รีสตาร์ทกลางทาง 1 ครั้ง
