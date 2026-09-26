# WO C3.7 — มือถือ: รอบ 390 px ของหน้า C2–C3 + แอปพนักงานส่วน CRM (ดีลของฉัน · งานวันนี้ · บันทึกสายหลังวางสาย · สแกนนามบัตร · push)

> RUN "CRM v2" · worktree `/root/projects/shark-crm-c110` (detached HEAD `d35d5bae`) · QC2 (`ep-cool-shadow`) · 26 ก.ย. 2569 · ผู้คุมงาน: Fable 5.1 · builder: Opus (DRAFT ของ builder)
> สัญญา: `ledger/CRM-RUN.md` §2 C3.7 · ใบสั่ง `ledger/crm-briefs/crm-brief-C3.6-C3.9.md` "C3.7" + Addendum (oracle author) + ruling ผู้คุมงาน (CONFIRMED ทั้งหมด)
> ภาพ `ledger/design-crm/13-mobile-staff-crm.png` · ข้อสอบ `scripts/qc-crm-c3.7.mts` (30 ข้อ · อ่านอย่างเดียว · ไม่แก้)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/crm/mobile.ts` | ใหม่ | `resolveSystem` (`?systemId=` ต้องเป็น CRM ของร้าน · v1 ⇒ 409 `CRM_V2_DISABLED` · ไม่ส่ง = ระบบ v2 ใบแรกตามลำดับ crmGates) · `myDeals/dealDetail` (OPEN · ไม่ถูกเก็บ · เจ้าของ = ฉัน ∩ dealWhere · ไม่มีเพดาน · เบอร์เฉพาะผู้ติดต่อที่มองเห็น) · `todayTasks` (ค้างครบกำหนดภายในวันไทย + ปิดวันนี้ ∩ activityWhere · เพดาน 200 · ตัวนับ 3 ช่องด้วย count) · `completeTask` (= `activities.completeActivity`) · `callPrompt` (ผู้ติดต่อ/ดีลที่มองเห็น · ทะเบียนผลสาย CALL) · `callOnce` (กันบันทึกสายซ้ำ: ชั้นในโพรเซส + advisory xact lock + `sourceRef = mobile-call:<userId>:<key>`) · `mobileErrorOf` (error → `{status,error,message ไทย}` · มองไม่เห็น = 404) |
| `src/lib/modules/crm/index.ts` | แก้ (บล็อก C3.7) | `export * as mobile from "./mobile"` |
| `src/lib/mobile/crm-routes.ts` | ใหม่ | `MOBILE_CRM_RATE_LIMIT {120, 60_000}` · `runMobileCrm` (limiter ต่อผู้ใช้ `mobile-crm:<userId>` ผ่าน `checkRateLimitDb` → resolveSystem → actor → งาน → JSON) · `mobileCrmAuthError/mobileCrmError/mobileCrmBadRequest` |
| `src/app/api/mobile/crm/{deals,deals/[id],tasks,tasks/[id]/complete,call-log,scan-card,scan-card/[proposalId]/accept}/route.ts` | ใหม่ (7) | ทุกเส้น `requireMobile` → `runMobileCrm` · ไม่มี prisma · call-log POST = `calls.logCall` ใน `mobile.callOnce` · scan-card = `calls.scanBusinessCard` (JSON base64) · accept = `calls.acceptLeadProposal` |
| `src/lib/modules/crm/contacts.ts` | แก้ 2 บรรทัด (บล็อก C3.7) ⚠️ นอกรายการเจ้าของ | `SOURCE_DETAIL_KEYS` + `via`/`proposalId` (`via` เฉพาะ `[a-z0-9-]{1,40}`) — บั๊กเดิมของ C2.4: `acceptLeadProposal` ส่ง `sourceDetail.via "card-scan"` แต่ตัวกรองทิ้งเงียบ ⇒ ข้อสอบ C3.7-S5.2 (และ C3.4-S5.2) แดง |
| `apps/mobile/app/(app)/crm/{_layout,index,tasks,call-log,scan-card}.tsx` | ใหม่ | Stack ของ expo-router + `useCallPrompt` · ดีลของฉัน (ชิปขั้น · การ์ด · ป้ายนิ่ง · ปุ่มโทร Linking `tel:`) · งานวันนี้ (ตัวนับ 3 · ติ๊กเสร็จ · ทางเข้าสแกน) · บันทึกสาย (ผลสาย/ระยะเวลา/ทิศทาง/โน้ต/งานถัดไป · idempotencyKey ต่อการเปิดแผ่น · แถบยืนยันในจอ) · สแกนนามบัตร (กล้อง/คลังรูป · ร่าง AI · สร้าง lead) |
| `apps/mobile/src/components/crm/ui.tsx` | ใหม่ | ชนิด DTO · `crmApiPath` · จัดรูปเงิน/เวลาไทย · หัวจอ · แถบล่าง ดีล/งาน/เมนู · ชิป · ข้อความแจ้ง |
| `apps/mobile/src/lib/crm-link.ts` | ใหม่ | `crmRouteFromLink` บริสุทธิ์ ไม่มี import (ดีล → `/crm?systemId&dealId` · กิจกรรม → `/crm/tasks?…&taskId` · แชท/URL เต็ม → null) |
| `apps/mobile/src/lib/call-prompt.ts` | ใหม่ | `telUrl` · `markPendingCall/clearPendingCall` · `takePendingCallRoute` · `useCallPrompt` (AppState active ⇒ `router.push("/crm/call-log?…&durationSec=")`) |
| `apps/mobile/app/(app)/_layout.tsx` | แก้ (บล็อก C3.7 ×3) | `Pressable testID="drawer-crm"` → `navigate("crm")` · ตัวฟังแจ้งเตือน: แชทก่อน แล้ว `crmRouteFromLink(data.link)` |
| `apps/mobile/qc/shoot-crm.mjs` | ใหม่ | สำเนา shoot-member · mock จาก fixture ของข้อสอบ · 5 จอ · summary `{fixture:{path,sha256}, screens[{…, expect, texts}]}` · ลบโปรไฟล์ chromium หลังปิด |
| `scripts/visual-crm.mts` | แก้ (บล็อก `3.7` เท่านั้น) | `C37_PAGES` จาก nav ตอนรัน + `report-<tab>` ×8 · สเปค `email-thread`/`sequence-editor` ที่ `before` หาของเดิมหรือสร้างชั่วคราว (TMP.emailIds/sequenceIds → restoreSeed เดิมลบ) |

หน้าเว็บ C2–C3: **ไม่แก้ CSS** — ภาพ 390 ของใบก่อน ๆ (2.1–3.2) ไม่ล้นเลย · S1.3/S1.4 (static proxy) เขียว · ที่เหลือรอภาพจริงของผู้คุมงาน

## 2. ผลทดสอบ (QC2 · reseed member → m1.1 → crm ก่อน)
- `qc-crm-c3.7` **27/30** — แดง 3 = S1.1 · S1.2 · S1.6 (ต้องมี build + `visual-crm 3.7` owner/thana ของผู้คุมงาน) · log `.qc-shots/c37/oracle-2.log`
- harness `QC_PREPARE=1 node apps/mobile/qc/shoot-crm.mjs` 5/5 ok (ไม่ล้น · ไม่มี error · ไม่มี unmocked) — `apps/mobile/qc/shots-crm/`
- regressions (QC2 · log `.qc-shots/c37/reg-*.log`): c2.4 91/91 · c1.6 79/79 · c1.4 110/110 · c1.8 81/81 · c0.2 27/27 · c1.11 66/66 (ต้องรันด้วย `CRM_V2_SWITCH=all` — ไม่ใส่ = S6.x แดง 9 ข้อเพราะหน้าสลับถูกซ่อน) ·
  qc-push 7/7 · qc-mobile-app 38/38 · qc-mobile-auth 31/31 · qc-mobile-chat 29/29 · qc-mobile-help 15/15 · qc-nav-functions ผ่าน 11 ·
  qc-member-m3.11 11/15 — แดง 4 ข้อต้องมีเซิร์ฟเวอร์ :3215 (S3.2 ภาพ · S4.1/S5.1 fetch ได้สถานะ 0 · ERR ตามมา) ไม่เกี่ยวกับใบนี้
- typecheck เขียว (ก่อน/หลัง) · fitness 33/33 ทั้งสองโหมด · tsc ของแอป (สำเนา QC + node_modules) เขียว

## 3. คำสั่งของผู้คุมงาน (ลำดับตามข้อสอบ ข้อ 11)
1. `bash scripts/iso.sh bash scripts/qcN.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c3.7.mts` (เขียน fixture)
2. `ISO_MEM=5G bash scripts/iso.sh env QC_PREPARE=1 node apps/mobile/qc/shoot-crm.mjs` (node_modules ของ `/root/qc-shark-mobile` ติดตั้งคืนแล้ว 26 ก.ย.)
3. build + `bash scripts/acc-v2-serve.sh` แล้ว `pnpm exec tsx scripts/visual-crm.mts 3.7 --user owner` และ `--user thana` (ผ่าน qcN.sh)
4. รันข้อสอบซ้ำ (วันไทยเดียวกับข้อ 1–2)

## 4. ค้าง / DEFERRED
- รูปนามบัตร: ไม่มี expo-image-manipulator ⇒ ย่อด้วย `quality 0.4` อย่างเดียว · เพดาน body ของ Vercel (~4.5 MB) ต่ำกว่าเพดาน route — รูปใหญ่ผิดปกติจะตกที่แพลตฟอร์ม
- จอแอปใหม่ถึงเครื่องจริงต้องมี build/OTA (ใบนี้ห้าม)
- ภาพ 13 มีปุ่มค้นหา/กระดิ่งบนหัวจอ — ไม่ทำ (ไม่มีในสัญญา)

## 5. รอบรีวิว 2 (SHOULD-FIX 5 + โน้ต · 26 ก.ย.)
- SF-1 กันซ้ำย้ายเข้า tx เดียว: `activities.logActivity(…, opts.sourceRef)` + `calls.logCall(…, deps, opts.sourceRef)` (บล็อก C3.7 — แบบ `createSequenceTaskOnce`:
  advisory lock `crm.activity.ref:<tid>:<sys>:<ref>` → หาแถว MANUAL ที่ `sourceRef` ตรง → insert พร้อม `sourceRef` · ซ้ำ = `replayed:true` ไม่มี audit/event ใหม่)
  · `mobile.callOnce` เหลือชั้นในโพรเซส + `run(sourceRef)` (ไม่มี tx นอก · ไม่มีการปักทีหลัง) · probe `.qc-shots/c37/r2-probe.log`: same key ×10 ×2 = 1 แถว ·
  logCall ×10 ตรงไม่ผ่านชั้นในโพรเซส = 1 แถว (replayed 9) · 12 และ 30 คีย์ต่างกันพร้อมกัน (pool pg ปริยาย 10) = 201 ทั้งหมด ไม่มี 500
- SF-2 แอป: `MAX_B64 4_200_000` · `quality 0.3` · HTTP 413 → "รูปนามบัตรใหญ่เกินไป — ถ่ายใหม่ด้วยความละเอียดต่ำลง"
- SF-3 `useCallPrompt`: เด้งเฉพาะเมื่อ AppState ผ่าน "background" · กลับ active โดยไม่ลงพื้นหลังและเครื่องหมายเก่ากว่า 15 วิ = ล้าง
- SF-4 `visual-crm.mts`: `snapshotTouch(contactId)` ก่อนจดหมายชั่วคราว (บล็อก 3.7 และบล็อก C2.5) → `restoreSeed` เขียน lastActivityAt ของผู้ติดต่อ/บริษัท +
  lastActivityAt/stalledAt ของดีลของเขาคืนด้วยคำสั่งดิบ · พิสูจน์: hash ของเวลาในระบบ CRM seed ก่อน/หลัง `visual-crm 3.7` และ `2.5` เท่ากัน (`r2-touch.log`)
- SF-5 `via`/`proposalId` ไม่อยู่ใน SOURCE_DETAIL_KEYS แล้ว (input ภายนอกถูกทิ้ง: `createContactAction` · REST `contacts.create` · เครื่องมือ AI) ·
  รับผ่าน `createContact(…, { trustedSource })` เท่านั้น (`acceptLeadProposal` → `{via:"card-scan", proposalId}`) · แผงแชท `leadFromBridge({via:"chat-panel"})`
  = ค่าคงที่ฝั่งเซิร์ฟเวอร์ที่เชื่อถือได้ · `via` `/^[a-z0-9-]{1,40}$/` · `proposalId` `/^[A-Za-z0-9_-]{1,64}$/` · `docs/modules/20-crm-v2.md` รายการคีย์อัปเดตแล้ว
- โน้ต: `myDeals` take 500 · `resolveSystem` take 50 · ถังที่สอง `mobile-crm-scan:<userId>` 10/นาที (POST scan) · เพดานความถี่ก่อน `readJson` (`runMobileCrm({readBody})`) ·
  เส้นที่ 8 `scan-card/[proposalId]/reject` → `calls.rejectLeadProposal` + ปุ่ม "ทิ้งร่าง" (`crm-scan-reject`) · `apps/mobile/.gitignore` + `qc/shots-crm/`

## 6. ข้อควรรู้ (บันทึกตามรีวิว)
- key เดิม + เนื้อคำขอแก้แล้ว (เช่นแก้โน้ตแล้วกดซ้ำ) = คืน id เดิม ไม่แก้แถว — สัญญาเดียวกับ Idempotency-Key · แอปออก key ใหม่ทุกครั้งที่เปิดแผ่น
- ร้านที่มี CRM หลายระบบ: ลิงก์แจ้งเตือนพา `?systemId=` ของระบบนั้นมาด้วย · ดีลที่มองไม่เห็นในระบบนั้น (หรือระบบถูกปิด v2) = 404 → จอแสดงข้อความในจอ ไม่พัง
- `drawer-crm` ไม่ได้ซ่อนตามสิทธิ์ (ปลอดภัย: ทุก route ตัดสินสิทธิ์/การมองเห็นเอง · ไม่มี CRM v2 = ข้อความ "ยังไม่ได้เปิดระบบ CRM ใหม่")
- ดัชนีของ `CrmActivity.sourceRef` (ตอนนี้กรองด้วย tenantId/systemId แล้วสแกน) → ผู้สมัครของ C6.1 (ใบนี้ห้าม migration)

## 7. รอบตรวจ QC1 ของผู้คุมงาน (C3.6+C3.7 รวม · 26 ก.ย.)
- C1.3-S0.3: `mobile.ts` ไม่ query CrmCompany เองแล้ว — ใช้ `companies.companyRefsInTx(prisma, ctx, actor, ids)` (companyWhere ในบริการของบริษัท) · c1.3 89/89
- `visual-crm 3.7`: รายการต่อผู้ใช้ = หน้าที่คนนั้นเปิดได้ (`crmNavItems(SYS, crmCan)` ∩ `C37_GATE` จาก notFound() ของ page.tsx · รายงานเฉพาะ crm.report.view) —
  dry-run QC2: owner 24 ภาพ (เหมือนเดิม) · thana 2 ภาพ (home · settings-notifications) · ไม่ถ่าย /settings/portal ให้ thana
- ORACLE-EDIT ที่ขอ: C3.7-S1.2 (qc-crm-c3.7.mts:430-432) วนทั้ง PAGES และนับ "ไม่มีภาพ" เป็นเสีย + บังคับ `emails` 200 ให้ thana
  (thana ใน seed ไม่มี crm.email.read ⇒ หน้านั้น 404 ตามแบบ) — ดูรายงาน builder
- ข้อสังเกต: แท็บ `emails` ใน CRM_NAV ไม่มี `perm` แต่หน้าต้องมี crm.email.read ⇒ แท็บตายสำหรับ STAFF ที่ไม่มีคีย์ (หน้า C2.5 ใช้ `crmNavItems(id)` ไม่ส่งตัวตัดสิน)

## ผู้คุมงาน (Fable 5.1 · 26 ก.ย. 2569) — รับงาน
| # | ผล | หลักฐาน |
|---|---|---|
| D1 | ✅ | ข้อสอบ 30 ข้อเขียนก่อน (c23) |
| D2 | ✅ | `qc-crm-c3.7` **30/30** QC1 หลัง build+ภาพ 390 (owner 24 หน้า · thana 2 หน้าตามสิทธิ์) + shoot-crm 5/5 (`c37b-verify.log`) · 27/30 QC2 ก่อนภาพ |
| D3 | ✅ | ORACLE-EDIT 1 = S1.2 (หน้าที่ thana ไม่มีสิทธิ์ไม่ถ่าย — ผู้คุมงานพิสูจน์: /emails 404 เพราะไม่มี `crm.email.read`) |
| D4 | ✅ | ถอยหลัง c367 + c37b เขียว (c1.3 89/89 หลังแก้ mobile.ts · c2.4 · c1.6 · c1.4 · c1.10 · c2.11 · mobile-* · push · c0.2 · nav) · m1.9 26/26 |
| D5/D6 | ✅ | typecheck · fitness 33/33 · build |
| D7 | ✅ | จอแอป 5 ใบ `apps/mobile/qc/shots-crm/` เทียบ mockup 13(ก): chips · การ์ดดีล (ขั้น/ชื่อ/ผู้ติดต่อ/ยอด/โทร) · แถบล่าง ✓ · เว็บ 390 24 หน้าไม่ล้น |
| D8–D11 | ✅ | ผู้ตรวจ 1 รอบ: SHOULD-FIX 5 (sourceRef ใน tx ของ logActivity · MAX_B64 · call prompt ผ่าน background · คืน lastActivityAt · via/proposalId trusted only) แก้ครบ + notes · ACCEPTANCE-FIX ผู้คุมงาน: แท็บอีเมล perm |
| D12 | ⏳ | รอ push |
หนี้: index `sourceRef` (C6.1) · แอปถึงเครื่องต้อง build/OTA (ห้ามในใบ) · ปุ่มค้นหา/กระดิ่งใน header ไม่อยู่ในสัญญา · แก้บั๊ก C2.4 allowlist
