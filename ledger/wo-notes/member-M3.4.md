# M3.4 — รีวิวลูกค้า · โน้ตผู้ทำ

> builder: Opus 5 · 11 ก.ย. 2569 · worktree `shark-member` (โหมดขนาน M3.4 ∥ M3.5 ∥ M3.6) · ข้อสอบ `scripts/qc-member-m3.4.mts` (ไม่ถูกแตะ)

## 1. ไฟล์ที่ส่งมอบ

**สคีมา / migration**
- `prisma/schema/member.prisma` — enum `ReviewStatus {REQUESTED NEW REPLIED ESCALATED HIDDEN}` · model `MemberReview` (คอลัมน์ครบตามสัญญา + `escalatedAt` · relation Customer Cascade) · unique(tenantId,refType,refId) · unique(requestTokenHash) · index (systemId,createdAt) (customerId) (systemId,rating) (systemId,status) · `Customer.reviews` (Edit เฉพาะจุด ต่อท้ายบรรทัดของ M3.5)
- `prisma/schema/kanban.prisma` — `KanbanCardSourceType` +`REVIEW` (additive)
- `prisma/migrations/20261028000000_member_v2_h/migration.sql` — เขียนมือ · additive ล้วน (ADD VALUE IF NOT EXISTS · CREATE TYPE · CREATE TABLE · index · FK Customer) · ไม่มี DROP/DELETE/UPDATE · deploy บน QC แล้ว · `migrate diff` = `-- This is an empty migration.`

**เอนจิน / ไฟล์บริสุทธิ์ / action**
- `src/lib/modules/member/reviews.ts` (ใหม่) — `getReviewSettings` `setReviewSettings` `requestReview` `submitReview` `escalate` `reply` `hide` `unhide` `listReviews` `reviewStats` `reviewsForMember` `shopSummaryFor360` `reviewFilterOptions` `summarize` `draftReply` `reviewLiffView` `reviewTokenTenant`
- `src/lib/modules/member/reviews-shared.ts` (บริสุทธิ์) — ชนิด/ค่าปริยาย/ป้ายไทย/ตัวช่วยวันไทย · ชนิด deps (`ReviewDeps` line/kanban)
- `src/lib/modules/member/reviews-actions.ts` (`"use server"` · export เฉพาะ async) — reply / draft / hide / unhide / saveSettings / refreshSummary (ด่าน requireTenant + assertCan + review.reply / settings.manage) · `submitReviewAction` (LIFF ไม่มี session · ตรวจ token ก่อนรับรูป · จำกัดความถี่ต่อลิงก์)
- `src/lib/member-journey-senders.ts` — `reviewSenders.line` (ประตูเดียวกับ journey `journeySenders.line` · ด่านยินยอม/ที่อยู่ชุดเดียวกัน)

**หน้าจอ**
- `src/app/app/sys/[id]/member/reviews/page.tsx` (ภาพ 23) · `src/components/member/ReviewsInbox.tsx` (client · KPI 4 · ตัวกรอง · รายการ+ตอบ+AI ร่าง+ซ่อน · AI สรุป · ตั้งค่า)
- `src/app/m/[slug]/review/[token]/page.tsx` (LIFF · ไม่ต้อง session) · `src/components/member/ReviewLiff.tsx` (client · ดาว 5 · ข้อความ · รูป ≤ 3 · ขอบคุณ+แต้ม · done/invalid)
- `src/components/member/ReviewMember360.tsx` (server · แท็บรีวิวใน 360 + กล่อง "รีวิวร้าน") · `src/components/member/ReviewStars.tsx` (ดาว SVG)

**สาย/ทะเบียน (Edit เฉพาะจุด)**
- `member/index.ts` — facade รีวิวทั้งชุด + `getMemberKpis`/`memberKpis` + ชนิด
- `member/journeys.ts` — `REQUEST_REVIEW` เรียก `requestReview` จริง (ตัวส่ง LINE = `env.deps.line` ของ journey) · ไม่มีบิล/นัดใน event = ข้าม
- `member/journeys-shared.ts` — ทริกเกอร์ journey `review.received` `review.replied` (กลุ่ม "รีวิว" · ตามโน้ต M3.3 §5 ข้อ 7)
- `member/profile.ts` — `Member360.counters.reviewAvg` (ค่าจริง) · merge ย้ายรีวิว + คิดคะแนนเฉลี่ยใหม่
- `member/list.ts` — `MemberKpis.reviewAvg` = ค่าเฉลี่ยจริงของร้าน
- `member/nav.ts` — `reviews` (ready) ใน `MEMBER_CAMPAIGN_NAV`
- `outbox-consumers.ts` — consumer `review.requested` `review.received` `review.replied` (no-op + automation/journey/webhook)
- `automation/labels.ts` — 3 event (spread เข้า `WEBHOOK_EVENTS` เอง ⇒ ครบ 3 ทะเบียน)
- `core/scope.ts` — `MemberReview: sys()`
- `members/[memberId]/page.tsx` + `Member360.tsx` — ช่องกลาง `tabPanel` / `sideTop` (M3.5 ใช้ช่องเดียวกันแล้ว)
- `kanban/types.ts` (+`"REVIEW"` ใน DTO) · `components/kanban/Card.tsx` (ป้าย "จากรีวิวลูกค้า") — จำเป็นเพราะเพิ่มค่า enum แล้ว tsc แดง (Record ครบทุกค่า)

## 2. ผลการทดสอบ

| ชุด | ผล |
|---|---|
| `qc-member-m3.4` (ตัวจริง) | **17/23** — ตก S2.1 · S5.1 (บั๊กข้อสอบ §4.1) + S8.2 · S8.3 · S9.1 · S9.2 (ภาพ/PARITY ของผู้คุมงาน) |
| สำเนาที่แก้ **เฉพาะ** `linkedBy` ใน `mkCust` (§4.1 · ลบแล้ว) | **19/23** — เหลือแค่ภาพ/PARITY 4 ข้อ |
| `qc-member-m3.3` | **31/32** — ตก S2.9 (สัญญาชนกัน §4.2) · สำเนาที่แก้เฉพาะ S2.9 = **32/32** |
| `qc-member-m3.2` / `m2.9` / `m2.2` / `m1.4` | ✅ 27/27 · 22/22 · 15/15 · 37/37 |
| `qc-kanban-k3.1` / `k3.2` | ตกเฉพาะข้อภาพ S6.3 / S4.6 (อยู่คนละ worktree = ฐานเดิม) · ข้อ `createCardFromExternal` ผ่านหมด |
| `qc-kanban-k1.1` | ตก **S1.5** (enum ครบ 7 ค่าเป๊ะ — ชนกับ M3.4 S1.1 ที่สั่งเพิ่ม REVIEW · §4.3) |
| `fitness.mts` (มี env / `env -u DATABASE_URL -u DIRECT_URL`) | ✅ 26/26 · ✅ 26/26 |
| `tsc --noEmit` | ✅ (ของใบนี้สะอาด · ระหว่างรันเคยเจอ error ชั่วคราวจากไฟล์ครึ่งทางของ M3.5/M3.6 — หายเอง) |
| `prisma migrate diff` หลัง deploy QC | ✅ empty migration |
| grep `'use client'` | ReviewsInbox/ReviewLiff import เฉพาะ `reviews-shared` + `reviews-actions` + คอมโพเนนต์ · ReviewMember360/ReviewStars ไม่มี hook ไม่ลาก prisma |
| ของค้างบน QC หลังรัน (อ่านอย่างเดียว) | MemberReview 0 · activity module review 0 · ledger REVIEW 0 · แจ้งเตือน "รีวิว" 0 · บอร์ด 0 · settings ระบบสมาชิก `{}` · outbox `review.requested` DONE 4 แถว (มาจาก finally ของ m3.3 ที่ไม่ลบ prefix `review.` — ไม่มีผล) |

## 3. ข้อตัดสิน (จุดที่สัญญาไม่ชัด)

1. **token = `<reviewId>.<สุ่ม 32 ไบต์>`** เก็บเฉพาะ sha256 · ส่งแล้วล้าง hash (ใช้ครั้งเดียวตาม S2.3) — ส่วนหน้า (reviewId) ทำให้หน้า LIFF ตอบ "รีวิวไปแล้ว" (S9.2 `m-review-done`) ได้โดยไม่ต้องเก็บ token ดิบหรือเพิ่มคอลัมน์ · ตอบแค่สถานะ+ดาว ไม่คืนเนื้อหา
2. **ขอซ้ำ ref เดิม** คืน `token: null, url: null` (ไม่เก็บ token ดิบ จึงคืนของเดิมไม่ได้ · ไม่หมุน token ใหม่เพราะจะทำให้ลิงก์ที่ส่งไปแล้วตาย)
3. **ส่ง LINE** เฉพาะ มี LINE identity + ยินยอม `GRANTED` + มีตัวส่ง (`deps.line`) — ไม่ครบ = `sent:false` + `note` ไทย ("ส่งลิงก์ให้ลูกค้าเองได้") · ไม่ throw · ใช้กติกาเดียวกันกับการส่งคำตอบร้าน
4. **`requestSentAt`** = เวลาที่ออกคำขอ/ลิงก์ (ตั้งทุกครั้ง แม้ไม่ได้ส่ง LINE) · ส่งจริงไหมอยู่ใน `MemberActivity.data.sent` + payload `review.requested`
5. **ไม่ validate `photoFileIds`** กับ FileAsset (ข้อสอบส่ง `"file-1"`) — หน้า LIFF อัปผ่าน `storage.uploadFile` แล้วส่ง assetId จริง · แสดงผลเฉพาะ id ที่หา cdnUrl เจอ
6. **แต้ม** ผ่าน `point.earnWithLot` (refType REVIEW · idempotencyKey `review:<id>`) ของระบบแต้มที่ผูกสาขาเดียวกับระบบสมาชิก (`resolvePointSystemIds` แบบ journey) · แต้มล้ม = log WARN ไม่ทำให้รีวิวหาย
7. **escalate**: บอร์ด = `escalateBoardId` (ต้อง ACTIVE) ?? บอร์ด ACTIVE แรกของร้าน · ผู้รับ = Membership role ที่ตั้ง **ที่คุมสาขาของรีวิว** (unitAccess ว่าง/`*`/มีสาขานั้น) — ไม่มีใครคุมสาขานั้น = ทุกคนใน role นั้น · ไม่มีบอร์ด/เปิดการ์ดล้ม → ESCALATED + AppNotification **รายผู้รับ** (`recipientUserId` · title มีคำว่า "รีวิว" · body ไม่มีเบอร์) **เฉพาะครั้งแรก** (`escalatedAt` null) · ไม่มีผู้รับเลย = ใบเดียวทั้งร้าน · `escalate` ไม่รับ actor (ระบบเรียก — ตามลายเซ็นในข้อสอบ)
8. **unhide** คืนสถานะ: มีคำตอบ = REPLIED · เคยส่งต่อ (`escalatedAt`) = ESCALATED · อื่น ๆ = NEW — ต้องมี `escalatedAt` เพราะรีวิวที่ส่งต่อโดยไม่มีบอร์ด ไม่มี kanbanCardId ให้เดา (S5.4)
9. **ตอบซ้ำ**: ข้อความเดิม = ไม่ทำอะไร · ข้อความใหม่ = แก้คำตอบ + event ใหม่ (idempotencyKey ต่อ hash ข้อความ) + ส่ง LINE ใหม่ · ตอบ HIDDEN/REQUESTED ไม่ได้ (throw ไทย)
10. **unit scope**: STAFF/MANAGER ที่จำกัดสาขา เห็น/ตอบ/ซ่อนได้เฉพาะรีวิว unit ในสิทธิ์ หรือไม่ระบุ unit · นอกสิทธิ์ = "ไม่พบ" (404-not-403) · `reviewStats` ใช้ขอบเขตเดียวกัน · `shopSummaryFor360` = ทั้งร้าน (กล่องรีวิวร้าน)
11. **สถิติ**: ช่วงตาม `submittedAt` · `repliedPct` ปัดจำนวนเต็ม · `weekDelta` = จำนวนรีวิว 7 วันล่าสุด · `unreplied` (ชิป "ยังไม่ตอบ n") = ทั้งหมดที่ยังไม่ตอบ ไม่จำกัดช่วง · `trend` = เฉลี่ยราย 7 วัน 8 ช่วง
12. **AI**: prompt อังกฤษ (`You are …`) ส่งเฉพาะ คะแนน/ข้อความรีวิว (ตัดตัวเลขยาว/อีเมลออก)/ชื่อบริการ · credit `MEMBER_ASSIST` ผ่าน `chargeUsageSafe` + `canSpend` · **"แนวโน้ม" คิดจากตัวเลขจริงเสมอ** (เฉลี่ยเดือนก่อน → เดือนนี้ · ไม่ให้ AI แต่งตัวเลข) · AI ตอบไม่ใช่ JSON (เช่น MockProvider) / ไม่มีผู้ให้บริการ / เครดิตหมด = สรุปจากข้อมูลตรง ๆ (ข้อความรีวิว 4–5 ดาวล่าสุด · เรื่องที่ติ + จำนวน) — หน้าจอไม่ว่าง · แคช `settings.member.reviewSummary[YYYY-MM] = {…, generatedAt, day}` วันไทยเดียวกัน = cached
13. **หน้า inbox เรียก `summarize` ตอนเปิดหน้า** (แคชรายวัน ⇒ AI อย่างมากวันละครั้งต่อร้าน) · ปุ่ม "สรุปใหม่" = force (สิทธิ์ review.reply)
14. **เขียน `AppSystem.settings.member.<key>` ด้วย SQL คำสั่งเดียว** (`jsonb_set` + `||`) — ไม่ read-modify-write ทั้งก้อน กันทับคีย์ member อื่นของใบขนาน
15. **ตั้งค่า**: zod partial · `googleReviewUrl` รับได้แค่ `null` (D5) · `escalateBoardId` ต้องเป็นบอร์ด ACTIVE ของร้าน · สิทธิ์ `canManageSettings` (MANAGER ไม่ได้โดยปริยาย §6.1)
16. **เส้น member→kanban = dynamic import** `@/lib/modules/kanban/links` ใน reviews.ts (ข้อสอบ S7.2 บังคับให้ reviews.ts เรียกประตูนี้เอง เพราะ `submitReview` ในข้อสอบไม่ฉีด deps แต่ต้องได้การ์ด) — เหตุผลทางเทคนิค: import ตรงจะเกิดวงจร `kanban/*` → `outbox-consumers` → member facade → `reviews.ts` · ดู §4.4 เรื่อง allowlist
17. **ตัวส่ง LINE ของคำตอบร้าน** ใน `reviews-actions.ts` โหลด `@/lib/member-journey-senders` แบบ dynamic (composition root · ไม่ใช่เส้น `@/lib/modules/*` · แบบเดียวกับที่ kanban/* import `outbox-consumers`)
18. **ภาพ 08 กล่องรีวิวร้าน**: แสดงแจกแจงครบ 5 แถว (ภาพโชว์ 5/4/2 — น่าจะตัดเพื่อย่อ) · ดาวเป็น SVG เพราะ "★" (U+2605) อยู่ในช่วงที่ห้าม · ปุ่ม "เชิญรีวิว Google" แสดงตามภาพแต่ disabled (D5)
19. **ภาพ 23 แถวที่กางกล่องตอบไว้**: แถว ESCALATED ที่ยังไม่ตอบใบแรก (ตามภาพ) · แถวอื่นมีปุ่ม "ตอบกลับ" · เพิ่ม "ซ่อนรีวิวนี้" ในกล่องตอบ + ลิงก์ "ดูรีวิวที่ซ่อนไว้ด้วย" ในแถบกรอง (ภาพไม่มี แต่สัญญามี hide/unhide)

## 4. ข้อแย้งข้อสอบ (หลักฐาน) — ผู้คุมงานตัดสิน

### 4.1 🔴 M3.4 S2.1 / S5.1 — `mkCust` สร้าง LINE identity ไม่สำเร็จทุกคน (ข้อสอบบรรทัด 85)
`P.memberChannelIdentity.create({ data: { tenantId, customerId, channel: "LINE", externalId } })` ขาด `linkedBy` (enum `MemberLinkMethod` · ไม่มี default) ⇒ Prisma โยน `Argument \`linkedBy\` is missing.` แล้ว `.catch(() => null)` กลืน (ยืนยันด้วยสคริปต์ probe บน QC) ⇒ X / L / Y **ไม่มี LINE identity ทั้งคู่** — X (S2.1 ต้อง `sent true`) กับ Y (S2.2 ต้อง `sent false`) กลายเป็นข้อมูลเหมือนกันทุกประการ ⇒ สองข้อนี้ขัดกันเอง ทำให้ผ่านพร้อมกันไม่ได้ถ้าเคารพสัญญา "ส่ง LINE ถ้ามี LINE identity + ยินยอม" (S5.1 deps 1 ของ L ก็เหตุเดียวกัน)
**แก้ที่เสนอ**: บรรทัด 85 เพิ่ม `linkedBy: "MANUAL"` ใน data · หลักฐาน: สำเนาที่แก้จุดเดียวนี้ = **19/23** (ผ่านทุกข้อที่ไม่ใช่ภาพ) · ตัวจริง = 17/23

### 4.2 🔴 M3.3 S2.9 — refId ของ `REVIEW_REQUESTED` ชนกับ M3.4 S2.1
M3.3 S2.9 ตรวจ `memberActivity(REVIEW_REQUESTED).refId === saleId` ซึ่งหัวข้อเขียนเองว่า "(stub M3.4)" · M3.4 S2.1 บังคับ `MemberActivity REVIEW_REQUESTED refId reviewId` และ S7.2 บังคับให้ journey เรียก `requestReview` จริง ⇒ ทางเดียวที่ผ่านทั้งคู่คือเขียนแถวไทม์ไลน์ซ้ำ 2 แถวต่อ 1 คำขอ (ไม่ทำ — ไทม์ไลน์ M3.7 จะเห็นซ้ำ)
แถวที่เขียนจริง: `module "review" · refType "MemberReview" · refId reviewId · data { refType: "PosSale", refId: saleId, sent }`
**แก้ที่เสนอ**: S2.9 เปลี่ยน `actR.refId === sale.saleId` → `(actR.refId === sale.saleId || actR.data?.refId === sale.saleId)` (หรือตรวจ `memberReview.findFirst({ customerId: RV, refType: "PosSale", refId: sale.saleId })`) · หลักฐาน: สำเนาที่แก้จุดเดียวนี้ = **32/32** · ตัวจริง = 31/32 (ข้ออื่นผ่านหมดรวม `wRb.status OK`)
หมายเหตุ finally ของ M3.3: ไม่ลบ outbox prefix `review.` (DONE ค้างไม่มีผล) · รีวิวของ RV หายตามลูกค้าเพราะ FK Cascade

### 4.3 🟠 `qc-kanban-k1.1` S1.5 — enum `KanbanCardSourceType` ต้องเป็น 7 ค่าเป๊ะ
ตรวจ `labels === "MANUAL,TEMPLATE,CHAT,FORM,EMAIL,AUTOMATION,AI"` แต่ M3.4 S1.1 สั่งเพิ่ม `REVIEW` (สคีมาเพิ่มแบบ additive ต่อท้าย) ⇒ ตกแน่นอนทุกครั้งหลังใบนี้
**แก้ที่เสนอ**: `en.KanbanCardSourceType.startsWith("MANUAL,TEMPLATE,CHAT,FORM,EMAIL,AUTOMATION,AI")` (ยังล็อกลำดับ 7 ค่าเดิม)

### 4.4 🟠 fitness F2 ยังไม่มีเส้น `member→kanban` แต่ S7.2 บังคับ reviews.ts เรียก `kanban/links`
ข้อสอบ S7.2 ต้องการ `@/lib/modules/kanban/links` ในข้อความของ reviews.ts ("เส้น member→kanban") · M3.7 S4.2 ก็คาดว่า fitness จะมี `member→kanban` · แต่ `ALLOWED_EDGES` วันนี้ไม่มี ⇒ `import … from` ตรง = F2.1 แดง · builder แก้ fitness ไม่ได้
ใบนี้ใช้ **dynamic import** (F2 สแกนเฉพาะ `from "…"`) — มีเหตุผลทางเทคนิคของตัวเองคือตัดวงจร import (§3 ข้อ 16) แต่ก็เป็นเส้นข้ามโมดูลที่ fitness มองไม่เห็น ⇒ **ขอผู้คุมงานเพิ่ม `"member→kanban"` ใน ALLOWED_EDGES** (chokepoint: `kanban/links.createCardFromExternal` เท่านั้น · ทิศเดียว · แบบ `chat→kanban`) ให้ทะเบียนพูดความจริง · ยังคง dynamic import ไว้ได้ (วงจร)

## 5. หนี้ / เรื่องที่ยังค้าง

1. 🔴 **`askAfterHours` ยังไม่มีตัวตั้งเวลาอัตโนมัติของตัวเอง** — ทางอัตโนมัติวันนี้ = journey สำเร็จรูป "ขอรีวิว" (M3.3: `pos.sale.paid` → รอ 1 วัน → REQUEST_REVIEW · มี re-entry 30 วัน/holdout/โควตา) · `booking.completed` → requestReview เป็นงานของ M3.7 (ข้อสอบ M3.7 S2.4 บังคับที่ bridges) · ไม่ทำ consumer `pos.sale.paid` ขอรีวิวทุกบิลเพราะไม่มีตัวกันถี่ (ลูกค้าซื้อวันละ 2 บิล = ขอรีวิว 2 ครั้ง) และจะเปิดส่ง LINE ให้ทุกร้านบน prod โดยไม่มีใครเลือก · ถ้าต้องการให้ค่าในตั้งค่ามีผล: cron รายชั่วโมงหยิบบิล PAID อายุ `askAfterHours` ที่ยังไม่มีรีวิว + กันถี่ต่อคน (ต้องแตะ `platform/cron.ts` — นอกขอบเขตใบนี้)
2. token ไม่มีวันหมดอายุ (แถว REQUESTED ค้างได้ตลอด) · §11.7 "แก้รีวิวได้ใน 24 ชม." ยังไม่ทำ (ข้อสอบบังคับ token ใช้ครั้งเดียว)
3. ตอบรีวิวแล้ว **ไม่** ปิด/คอมเมนต์การ์ดบอร์ดงาน · กฎอัตโนมัติบอร์ดงานยังเลือกเงื่อนไข "ที่มา = รีวิว" ไม่ได้ (`kanban/automation.ts` CARD_SOURCE_TYPES — โมดูลบอร์ดงาน นอกขอบเขต)
4. คู่มือ REST/เว็บฮุคของสมาชิก (`member/api/openapi.ts` MEMBER_EVENT_PREFIXES) ยังไม่รวม `review.` — M3.10 (ops รีวิว) ควรเพิ่มพร้อมคำอธิบายใน `gen-member-api-docs.mts` แล้ว regen (F13.8)
5. ข้อความขอรีวิว/คำตอบร้าน สร้างใน reviews.ts เอง (`kind: "REVIEW_REQUEST" | "REVIEW_REPLY"`) — M3.6 (ทะเบียนแจ้งเตือน) ควรให้ตัวส่งเลือกแม่แบบจาก `kind` นี้
6. PDPA ลบข้อมูล (anonymize) ยังไม่ล้าง `body`/รูปของรีวิว (ถ้าลบแถวลูกค้าจริง รีวิวหายตาม FK)
7. อัปรูปบน LIFF ต้องมี env storage (Bunny) — QC ไม่มี ⇒ แนบรูปแล้วได้ข้อความ "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ … ส่งรีวิวแบบไม่มีรูปได้"
8. `summarize` ถูกเรียกตอน render หน้า inbox (เขียนแคชลง AppSystem) — วันละครั้งต่อร้าน · ถ้าผู้ให้บริการ AI ช้า หน้าแรกของวันจะรอ (มี catch → สรุปจากข้อมูล)
9. แถว REQUESTED ที่ journey สร้างแต่ส่ง LINE ไม่ได้ (ร้านยังไม่เชื่อม LINE OA) ไม่มีที่ให้พนักงานเห็นลิงก์ย้อนหลัง (ไม่เก็บ token ดิบ) — ถ้าต้องการ "ส่งลิงก์เอง" ต้องมีปุ่มออกลิงก์ใหม่ (หมุน token) ในหน้า 360

## 6. ก่อน push/deploy prod (ฝากผู้คุมงาน · อ่านอย่างเดียว)

migration additive ล้วน ไม่มีเงื่อนไขก่อน push · `ALTER TYPE … ADD VALUE IF NOT EXISTS` อยู่ในไฟล์เดียวกับ CREATE ได้ (ไม่ได้ใช้ค่าใหม่ในไฟล์เดียวกัน — แบบ g2/g3) · ลำดับชื่อ `20261028…_h` มาก่อน `…29_h2` `…30_h3` ของใบขนาน (QC apply ย้อนลำดับได้ปกติ)
```sql
SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name = '20261028000000_member_v2_h';
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname IN ('ReviewStatus','KanbanCardSourceType') ORDER BY t.typname, e.enumsortorder;
SELECT conname FROM pg_constraint WHERE conname = 'MemberReview_customerId_fkey';
SELECT count(*) FROM "MemberReview";
```

## 7. ข้อมูลสำหรับถ่ายภาพ

- harness `TMP34` สร้างรีวิวจากบิลสมาชิก 1–6 (สมาชิก 1 เก็บ token ไว้ถ่าย LIFF · ที่เหลือส่ง 5/2/5/4/2/5 ตามลำดับบิล) + ตอบ 1 ใบ (5 ดาว)
- ⚠️ **ร้าน QC ไม่มีบอร์ดงาน** ตอนถ่าย (ข้อสอบสร้างแล้วลบบอร์ดของตัวเอง · ระบบ KANBAN ยังอยู่) ⇒ แถว 2 ดาวจะขึ้นป้ายแดง "ส่งต่อผู้จัดการแล้ว — ยังไม่มีบอร์ดงานให้เปิดการ์ด" แทน "เปิดการ์ด #n ในบอร์ด …" · KPI ช่อง 4 "→ การ์ดบอร์ดงาน 0 ใบ" · ถ้าอยากได้ภาพตรงภาพ 23 ให้สร้างบอร์ด 1 ใบในระบบ KANBAN ของร้าน QC ก่อนรัน harness (escalate ใช้ "บอร์ดแรกของร้าน" เองเมื่อไม่ได้ตั้ง)
- ภาพ 23: หัว "รีวิวลูกค้า" + ปุ่มกรอบ "ตั้งค่า" (เลื่อนไปกล่องตั้งค่า) · KPI 4 (เฉลี่ย 30 วัน/รีวิว/ตอบกลับแล้ว/≤ 2 ดาว สีแดง) · แถบกรอง select 4 + ชิปฟ้า "ยังไม่ตอบ n" · "รีวิวล่าสุด n ใบ" กล่องรูป (ไอคอนกล้อง) · ดาว · ชื่อ · บริการ·พนักงาน/สาขา · วันที่ · "ข้อความ" · ป้ายแดง · กล่องตอบ (แถว ESCALATED ใบแรก) · "ตอบแล้ว — …" · ขวา AI สรุป (จุดแข็ง/ถูกพูดถึงบ่อย/แนวโน้ม) + ตั้งค่า 4 แถว (ขอรีวิวหลัง · ให้แต้ม · ≤ 2 ดาว บอร์ด/มอบหมาย · ≥ 4 ดาว สวิตช์ Google ปิด + "ปิดอยู่ — เจ้าของเลือกเก็บในระบบ") + ปุ่ม "บันทึกตั้งค่า"
- จุดที่รู้ตัวว่าต่างจาก mockup: ตั้งค่าเป็น select ให้แก้ได้จริง (ภาพเป็นข้อความตัวหนา) · มีปุ่ม "บันทึกตั้งค่า" · ลิงก์ "ดูรีวิวที่ซ่อนไว้ด้วย" · "สรุปใหม่"/"อัปเดต …" ใต้ AI สรุป · AI สรุปบน QC เป็นสรุปจากข้อมูล (ไม่มีคีย์ AI หรือเป็น mock)
- ภาพ 08 ขวา (`?tab=reviews` ของสมาชิก 2): คอลัมน์หลัก "รีวิวของลูกค้าคนนี้" · แถบขวาบนสุด "รีวิวร้าน" (เฉลี่ยตัวใหญ่ + แท่ง 5 แถว ≤ 2 ดาวแดง + 2 รีวิวล่าสุด + ป้าย "เปิดการ์ดอัตโนมัติ #n" + ปุ่ม "เชิญรีวิว Google" ปิด) ต่อด้วยกล่องเดิมของ 360
- LIFF (มือถือ): หัว "รีวิว <ร้าน>" · "คุณ<ชื่อ> ประทับใจแค่ไหนคะ" · ดาว 5 ปุ่ม 44px · ข้อความ · "แนบรูป (0/3)" · ปุ่มดำ "ส่งรีวิว" + "รีวิวแล้วรับ 50 แต้ม" → ขอบคุณ + ดาว + "ได้รับ 50 แต้ม…" · เปิดซ้ำ = "รีวิวไปแล้ว — ขอบคุณค่ะ" · token มั่ว = "ลิงก์รีวิวนี้ใช้ไม่ได้แล้ว" (200)
- มือถือ: KPI `grid-cols-2` · กริดหลัก `grid-cols-1 lg:…` + `min-w-0` · select `w-auto max-w-full` · ช่องเหตุผลซ่อน `basis-full sm:basis-0`

### ตรวจภาพ
_(ผู้คุมงาน Opus 5 · 11 ก.ย. ~11:00 UTC · build QC หลังรวมทั้งชุด 3.4/3.5/3.6/3.9 · เปิดดูทุกภาพเทียบ mockup ด้วยตาแล้ว)_
- **reviews-owner desktop (ภาพ 23)**: ตรง — หัว "รีวิวลูกค้า" + ปุ่มตั้งค่า · KPI 4 (เฉลี่ย 30 วัน · รีวิว · ตอบกลับแล้ว · ≤ 2 ดาว สีแดง → การ์ดบอร์ดงาน n ใบ) · แถบกรอง ดาว/บริการ/พนักงาน/สาขา + ชิป "ยังไม่ตอบ n" · รีวิวล่าสุด (รูป · ดาว · ชื่อ · บริการ · สาขา · วันที่ · คำพูด) · แถว 2 ดาว มีชิปแดง "เปิดการ์ด #n ในบอร์ด "…" — ผู้จัดการรับเรื่องแล้ว" + กล่องตอบ + "ให้ AI ร่างคำตอบ" + ส่งคำตอบดำ · แถวตอบแล้ว "ตอบแล้ว — …" · แผงขวา AI สรุปรีวิวเดือนนี้ (จุดแข็ง/ถูกพูดถึงบ่อย/แนวโน้ม) + ตั้งค่า (ขอรีวิวหลัง · ให้แต้ม · ≤ 2 ดาว → บอร์ด+มอบหมาย · ≥ 4 ดาว เชิญรีวิว Google ปิดอยู่ D5)
- ต่างจาก mockup (ยอมรับ): ตั้งค่าเป็น select จริง (ภาพเป็นข้อความ) + ปุ่ม "บันทึกตั้งค่า" · ลิงก์ "ดูรีวิวที่ซ่อนไว้ด้วย" · ตัวเลขน้อยเพราะข้อมูล QC 5 ใบ
- **แก้โดยผู้คุมงาน**: (1) meta แสดง "สาขาสาขาป่าตอง" (เติมคำว่าสาขาซ้ำ) — reviews.ts + ReviewsInbox + ReviewMember360 + หัวโปรไฟล์ Member360 (โค้ดเก่า M1.5) → เติมเฉพาะชื่อที่ยังไม่ขึ้นต้นด้วย "สาขา" (2) มือถือ ชิป "เปิดการ์ด…" ถูกตัด (truncate) → ขึ้นบรรทัดใหม่ (3) harness สร้างบอร์ด "รับเรื่องรีวิวลูกค้า" ชั่วคราวให้ภาพเห็นเส้นทางหลัก (ORACLE-EDIT §4)
- **reviews-owner mobile**: ไม่ล้น · KPI 2×2 · ตัวกรองขึ้นบรรทัด · รีวิวเรียงเป็นการ์ด · แผง AI/ตั้งค่าอยู่ท้าย
- **member-reviews-owner (ภาพ 08 ขวา · แท็บรีวิวใน 360)**: ตรง — แท็บ "รีวิว" · "รีวิวของลูกค้าคนนี้" + ชิป "ส่งต่อผู้จัดการ" + การ์ดบอร์ด · แถบขวา "รีวิวร้าน" คะแนน 3.6 + แท่ง 5→1 ดาว + รีวิวล่าสุด + เชิญรีวิว Google
- **LIFF /m/[slug]/review/[token] (customer)**: 4 สถานะ — ให้คะแนน (ดาว 5 · เล่าให้ร้านฟัง · แนบรูป 0/3 · ส่งรีวิว · "รีวิวแล้วรับ 50 แต้ม") · ขอบคุณ + ได้ 50 แต้ม · รีวิวไปแล้ว · ลิงก์ใช้ไม่ได้ · แถบล่าง บัตร/กระเป๋า/โปรไฟล์/ประวัติ
- **PARITY: ผ่าน**
