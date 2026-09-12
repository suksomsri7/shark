# HANDOVER — ระบบสมาชิก v2 ปิดเฟส M3 + ปิด RUN ทั้งระบบ (34/34)

วันที่: 11–12 ก.ย. 2569 (UTC) · worktree `/root/projects/shark-member` · branch `session/member` → main (M3.11 = `02edc5e`) · ผู้คุมงานเฟส M3.3–M3.F: **Opus 5** (รับช่วงจาก Fable ตาม `HANDOVER-2026-09-11-MEMBER-M3-CONTROLLER.md` · hash ฐานสำหรับ audit = `21fd9f3`)

## สรุป 1 บรรทัด
RUN ระบบสมาชิก v2 ครบ **34/34 ใบ** (M1 12 · M2 10 · M3 11 · M3.F) · ทุกใบมีข้อสอบของ oracle ผ่านเต็มจากการรันซ้ำของผู้คุมงานเอง + ภาพจริงเทียบ mockup ด้วยตา · migration `member_v2_*` ครบ **18 ใบ** บน prod (a → h3) · Vercel READY ทุก push

## สิ่งที่สร้างในเฟส M3 (ตัวเลขจากโค้ดจริง)
| ใบ | สิ่งที่ได้ | ข้อสอบ | ภาพ | commit |
|---|---|---|---|---|
| M3.1 segments | engine กลุ่มลูกค้า (ฟิลด์ระบบ/กำหนดเอง/แต้ม/ยินยอม/ที่มา · AND/OR) · MemberSegment (migration `g`) | 20/20 | 21 ขั้น 1 | `cb1d397` (Fable) |
| M3.2 campaigns v2 | 4 ช่องทาง · A/B · holdout · แนบ voucher/คูปอง · track use · stats (migration `g2`) | 27/27 | 21 · 07 ล่าง | `22d3ff2` (Fable) |
| M3.3 journeys | AutomationRule scope MEMBER_JOURNEY · 6 สำเร็จรูป · WAIT_THEN (cron รายชั่วโมง) · holdout · re-entry · quota · dry-run · stats (migration `g3` · FK บนคอลัมน์ใหม่ `journeyId` ไม่แตะแถวเดิม) | 32/32 | 07 บน · 22 | `60975ce` |
| M3.4 reviews | ขอรีวิว LINE/LIFF · submit 1 ครั้ง/ref + แต้ม · reply/hide · ≤ 2 ดาว → การ์ดบอร์ดงาน · AI สรุป/ร่างคำตอบ (migration `h`) | 23/23 | 23 · 08 ขวา · LIFF | `34cf316` |
| M3.5 referrals | โปรแกรม (D6) · โค้ด/ลิงก์ `/ref/<code>`/QR · convert SIGNUP/FIRST_PURCHASE · รางวัลสองฝั่ง · cap · กันโกง · leaderboard (migration `h3` — ตารางไม่เคยถูกสร้าง) | 21/21 | 24 · 08 ขวา · LIFF | `34cf316` |
| M3.6 notifications | เทมเพลต 8×4 · consent · quiet hours · digest รายวัน · stats (migration `h2`) | 19/19 | 30 | `34cf316` |
| M3.7 history | consumer ทุกโมดูล → MemberActivity · `crm.deal.won` · `shop.order.paid` (marketplace → สมาชิก/แต้ม) · read-through เอกสาร/การ์ด · แท็บประวัติกรอง 9 ชนิด · unit scope | 23/23 | 08 | `cbdd1a7` |
| M3.8 reports | 7 ชุด (overview · RFM · tiers · points หนี้สิน · promotions ROI · sources · cohort) · CSV BOM · ตั้งเวลาอีเมล | 18/18 | 25 | `cbdd1a7` |
| M3.9 templates | 16 กิจการ + ทั่วไป ตาม §10 (ส่วน/ฟิลด์/ระดับ/สแตมป์/journey) · validate/preview/apply ทีละส่วน · แผงตัวอย่างใน FieldDesigner | 24/24 | 03 | `34cf316` |
| M3.10 REST/AI ชุดสาม | ทะเบียน **135 → 212 op** · tools **33 → 54** + manifest + OpenAPI · join public lane (OTP) · webhooks REST + HMAC/retry · หน้าผู้ช่วย AI (ข้อเสนอรอยืนยัน) | 21/21 (HTTP จริง) | 27 | `59bd299` |
| M3.11 LIFF + แอป | `/m/[slug]/join` 3 ขั้น + `/join/done` · แอปพนักงาน 3 จอ (ค้น/สแกน · สรุป+ปุ่ม 4 · ประทับ PIN) ผ่าน `/api/mobile/member/*` · สะพาน push | 16/16 | 29 · 28 | `02edc5e` |

## บั๊กจริงที่จับได้ระหว่างเฟส M3 (ไม่ใช่ข้อสอบผิด)
1. **แอปพนักงาน bundle ล้มทั้งแอป** — จอสมาชิก import `@react-navigation/native` (expo-router SDK 56+ ไม่รองรับ) · tsc ผ่าน · จับได้ตอน web export ถ่ายภาพ (M3.11)
2. **ลิงก์แนะนำเพื่อน `/r/[code]` ชนหน้าใบเสร็จสาธารณะของบัญชี `(store)/r/[token]`** → `next build` ล้ม → ย้าย `/ref/[code]` (M3.5 · builder ห้าม build จึงจับได้ที่ด่าน build ของผู้คุมงานเท่านั้น)
3. **voucher เพื่อน ฿100 จะออกเป็น ฿1** ถ้าตามข้อสอบเดิม (Voucher.value FIXED = สตางค์) (M3.5)
4. **ปุ่ม "มาแล้ว/ไม่มา" ของหน้าจองเดิมไม่เคยยิง event** → สแตมป์จากนัด (M2.3) · journey no_show · ไทม์ไลน์ ไม่ทำงานจากจอจริง → ผ่าน `setAppointmentStatus` แล้ว (M3.7)
5. สถิติ journey หน้ารายละเอียดคิดแค่ 1 วัน (`numOr(undefined, 30)` → `Number("")` = 0) (M3.3)
6. ส่ง LINE จาก journey ไม่ออก — `pushToContact` ได้ systemId ของระบบสมาชิกแทนระบบแชท (M3.3)
7. ร่างแรกของ migration g3 ผูก FK `ruleId` Cascade → ลบกฎบอร์ดงานแล้วประวัติ run หาย (หักสัญญา K2.9) → ย้ายไปคอลัมน์ใหม่ (M3.3)
8. หน้าแจ้งเตือน: ลิงก์ย้อนกลับชี้หน้าไม่มีอยู่ (prefetch 404) · ตัวอย่าง LINE ใช้ชื่อร้านปลอม "ร้านตัวอย่าง"/slug demo · ตารางถูกตัดทั้ง desktop/มือถือ (M3.6 ตีกลับ)
9. เทมเพลตกิจการรอบแรกบางเกิน (คลินิก 3 ฟิลด์) เพราะข้อสอบ apply สะสม 16 ชุดจนชนเพดาน (M3.9 ตีกลับ + แก้ข้อสอบ)
10. ตารางผู้ช่วย AI แสดงรหัสแทนชื่อ · ชิปชนิด tool สีเทา (M3.10 ตีกลับ) · "สาขาสาขาป่าตอง" (ชื่อสาขาขึ้นต้น "สาขา" อยู่แล้ว · 4 จุด)
11. ข้อสอบรุ่นเก่า m1.4/m1.8 สมัครด้วย referralCode → ตั้งแต่ M3.5 ทิ้ง Referral กำพร้า + แต้มผู้แนะนำค้าง → อันดับผู้แนะนำเพี้ยน (เพิ่มเก็บกวาดใน finally)
12. `retryFailedWebhooks` ในข้อสอบ M3.10 เปลี่ยน delivery FAILED ของชุดอื่นทั้งฐานเป็น OK ทุกรอบ (กันไว้ในข้อสอบ)

## ข้อสอบที่ผู้คุมงานแก้ (ORACLE-EDIT · สำหรับ audit ของ Fable)
- บันทึกใน `ledger/MEMBER-RUN.md` §4 ขึ้นต้น `ORACLE-EDIT` **44 บรรทัด** (38 รหัสข้อไม่ซ้ำ) · ทุกข้อมีเหตุผล + หลักฐาน (บรรทัดสคีมา/โค้ดจริง หรือผลรันสำเนาของ builder) · ไม่มีข้อไหนผ่อนเงื่อนไข — ส่วนใหญ่ข้อสอบอ้างคอลัมน์/รูปคำตอบที่ไม่ตรงของจริง หรือเปราะตามเวลา/ข้อมูลค้าง · 3 จุดเข้มขึ้น (M3.6-S4.1 ตรวจ 3 จุดแทน 2 · M3.9-S2 ทดสอบทีละชุด + ฟิลด์ ≥ 4 · F2.1 นับ dynamic import)
- `git diff 21fd9f3..main` ของไฟล์ข้อสอบ/harness/fitness = 76 hunk · 50 hunk มีคำว่า ORACLE-EDIT ในบรรทัดเอง · อีก 26 เป็นส่วนต่อของข้อเดียวกัน (ตามตารางด้านล่าง)

| ไฟล์ | ORACLE-EDIT ที่ครอบ |
|---|---|
| `scripts/fitness.mts` | F2.1 (member→kanban · member→account · นับ dynamic import) |
| `qc-member-m3.3.mts` | S2.1 (source/birthDate · วันไทย) · S8.2 (ปิด jh) · S2.3-finally · S2.9 (stub → M3.4) |
| `qc-member-m3.4.mts` | S2.1 (linkedBy) · S6.1 (ล้างแคช summary) |
| `qc-member-m3.5.mts` | S1.1 (ไม่มี migration → h3 · ลบแถวค้างก่อนวัดค่าปริยาย) · S1.2/S7.1 (`/ref/`) · S2.3 (อีเมล) · S3.2 (drain · สตางค์) · S5.2/S5.3 (300) |
| `qc-member-m3.6.mts` | S2.1 · S2.2 · S4.1 · S5.1 · S7.3 · S8.3 |
| `qc-member-m3.7.mts` | S2.1 · S2.6 · S2.7 · S5.1 |
| `qc-member-m3.8.mts` | S1.x (netSatang) |
| `qc-member-m3.9.mts` | S2.x (ทีละชุด + cleanupMade + S3.1/S3.2 ต่อชุด) |
| `qc-member-m3.10.mts` | S2/S3 envelope · 201 · S3.1/S3.8 reason · S2.1 tool.name · S3.7 (report.view · BOM) · S3.10 retry · finally คืนตั้งค่า |
| `qc-member-m3.11.mts` | S2.1/S2.2 (touch) · S5.1 (200 · token) |
| `qc-member-m1.4.mts` · `m1.8` | finally เก็บกวาด Referral |
| `qc-member-m2.3.mts` | S5.3 (หาช่องนัดว่าง) |
| `scripts/visual-member.mts` | M3.4-S8.2 (บอร์ดชั่วคราว) · M3.5-S1.1/S1.2 (คืนโปรแกรม · `/ref/`) · M3.9-S4.2 (`-trigger`) · harness บันทึก URL ของ response ≥ 400 |
| นอกรายการ audit | `qc-kanban-k1.1` S1.5 (enum +REVIEW) · `qc-pos-register` MEM-2 (หลัง drain · หนี้ M2.8 ปิดแล้ว) · `acc-v2-serve.sh` ตั้ง `QC_OTP_PREVIEW=1` ให้ QC server |

## หนี้ที่ส่งต่อ (ตามลำดับความสำคัญ)
1. 🔴 **พนักงานยังเข้าจอสมาชิกในแอปจริงไม่ได้** — Drawer ของแอปปิดท่าสไลด์ตั้งแต่ 6 ก.ย. · ฝั่งแอปรับสัญญาณ `open-member` แล้ว แต่เมนูเว็บยังไม่ส่ง · สแกนด้วยกล้องต้องติดตั้ง `expo-camera` + บิลด์ใหม่ (รอเจ้าของสั่งบิลด์)
2. **ROI 3 นิยาม** — รายงาน (ยอด ÷ ต้นทุน · "31.6×" ตามภาพ 25) · หน้า journey ((ยอด − ต้นทุน) ÷ ต้นทุน) · แคมเปญ (สูตร M3.2) → ตัวเลขไม่ตรงกันระหว่างหน้า · ควรเคาะนิยามเดียว (เป็นเรื่องการสื่อสารกับร้าน → ถามเจ้าของ)
3. อีเมลรายงานแนบ CSV ไม่ได้ (`core/email` ยังไม่รองรับไฟล์แนบ) — ตอนนี้ส่งสรุป KPI + ลิงก์
4. ข้อมูลทดสอบค้างใน QC จากข้อสอบบางชุด (แถว activity แนะนำเพื่อนของสมาชิก 1 · tier drift ของสมาชิก seed) — reseed ก่อน qc:all แก้ได้ · ควรไล่ finally ของชุดที่ยังรั่ว
5. preset journey ตัดขั้น "ออก voucher" เงียบเมื่อร้านไม่มีแบบ voucher (ควรชวนสร้างแบบก่อน) · แถว "ข้าม" นับโควตา journey · แถว WAITING ที่จองแล้วเครื่องดับค้าง
6. M3.4: token ขอรีวิวไม่หมดอายุ · PDPA erase ยังไม่ล้างเนื้อรีวิว · askAfterHours ไม่มีตัวตั้งเวลาของตัวเอง (ใช้ journey สำเร็จรูป)
7. M3.5: `mergeMembers` ไม่ย้าย referral · ไม่มี cron เก็บตก CONVERTED ค้าง
8. M3.7: ยังไม่มี event คืนเงินออเดอร์ (ไม่ย้อนแต้ม) · ออเดอร์ออนไลน์ไม่บันทึกยอดสะสม
9. M3.10: `/join/*` ไม่มี CORS (เว็บร้านโดเมนอื่นเรียกจากเบราว์เซอร์ไม่ได้) · กล่องข้อเสนอแสดงต้นทุนเฉพาะ voucher FIXED
10. หนี้เดิม M2: ชิปมือถือ nowrap · `pos/index.ts` ผู้เรียกเดิม 15 ที่ · ค่าธรรมเนียมโอนแต้ม

## ของที่ยังรอเจ้าของ (ไม่บล็อกงาน)
- เชื่อม LINE OA + ตั้ง `LINE_LIFF_ID` + `LINE_CHANNEL_ID` → ปุ่ม "สมัครด้วย LINE" / เปิด `/m/*` จาก LINE (ตอนนี้ตกไปใช้ OTP)
- SMS provider (OTP ทางเบอร์ · SMS แคมเปญ/แจ้งเตือน · interface `core/sms.ts` รอเสียบ) — ระหว่างนี้ OTP สมัครส่งทางอีเมลได้
- ลิงก์ LINE OA ของร้าน (ปุ่ม "เพิ่มเพื่อน LINE" หน้าสมัครสำเร็จ)
- สั่งบิลด์แอปพนักงานเมื่อพร้อม (expo-camera + ทางเข้าเมนูสมาชิก)
- เคาะนิยาม ROI (หนี้ข้อ 2)

## วิธีตรวจ/ใช้งาน
- QC ต่อใบ: `QC_ENV_FILE=.env.qc bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m3.<n>.mts` · ข้อภาพ/HTTP: `bash scripts/acc-v2-serve.sh` (ห้ามห่อ gate lock · มี `QC_OTP_PREVIEW=1` แล้ว) + `pnpm exec tsx scripts/visual-member.mts <wo> --user owner|thana|noperm|customer:<memberCode>` · แอปพนักงาน: `QC_PREPARE=1 bash scripts/with-gate-lock.sh node apps/mobile/qc/shoot-member.mjs`
- ทั้งระบบ: reseed `qc-member-m1.1.mts` ก่อน แล้ว `pnpm qc:all` (env จาก .env.qc · ตอนไม่มี builder)
- REST: `docs/api/MEMBER-API.md` (212 op) · สกิล `shark-member-api` · `/developers/member` · manifest `GET /api/v1/ai/skills/members`

## ผลตรวจบน prod จริง
- Vercel READY: `60975ce` · `34cf316` · `cbdd1a7` · `59bd299` · `02edc5e`
- `_prisma_migrations` บน prod: `member_v2_a b b2 b3 c c2 d d2 e f f2 f2_identity_fk g g2 g3 h h2 h3` = **18 ใบ** (g3 07:36 · h/h2/h3 11:01 UTC 11 ก.ย. — Vercel build รัน migrate deploy)
- backfill prod: ดูหัวข้อ "M3.F" ด้านล่าง

## M3.F (ปิด RUN · 12 ก.ย. 2569)
### qc:all เต็มชุด (QC DB · ไม่มี builder · QC server เปิดค้างสำหรับชุดที่ยิง HTTP)
ลำดับที่ใช้ (สำคัญ — ถ้าสลับจะแดงเพราะสภาพข้อมูล ไม่ใช่โค้ด): **seed `seed-member-qc.mts` → `acc-v2-serve.sh` (build+start) → ถ่ายภาพ 26 ใบทุกผู้ใช้ → `pnpm qc:all` (server ยังเปิดอยู่)**
- รอบสุดท้าย: **317/320** · แดง 3 ชุด อธิบายได้ทั้งหมด:
  - `kanban-k2.3` (15/17) · `kanban-k2.11` (28/30) — ข้อภาพต้องมีไฟล์ใน `.qc-shots/kanban/*` ซึ่งอยู่ worktree `shark-kanban` (ฐานเดิมตั้งแต่ปิดเฟส M2) · k2.11 ข้ออื่น (S3.3 อีเมลรวมรายชั่วโมง) **ผ่านเมื่อรันเดี่ยว** = flaky ตามลำดับ/เวลา ไม่ใช่โค้ด
  - `member-m1.9` (25/26 · S1.1) — สมาชิก seed 1 คน (`8EHJTK`) ถูกเลื่อน MEMBER→silver ระหว่างรอบ เพราะชุดใดชุดหนึ่งออกบิลทดสอบให้สมาชิก seed แล้วลบบิลทิ้งโดยไม่คืนระดับ (เอนจินเลื่อนระดับทำงานถูกต้อง — `RULE_UPGRADE` แล้ว `RULE_KEEP` at-risk) ⇒ **หนี้**: ไล่หาชุดต้นทาง แล้วให้ finally คืนระดับ หรือใช้เฉพาะสมาชิกที่ชุดนั้นสร้างเอง
- รอบก่อนหน้า (ระหว่างไล่สาเหตุ): 304 → 308 → 310 → 317 · ที่แก้ระหว่างทางดู §4 ของ `MEMBER-RUN.md` (ORACLE-EDIT qc-all · m2.6-S1.2 · m3.4-S2.x/S4.3 · harness TMP34 · m2.3-S5.3 · m1.4/m1.8 finally · m2.6/m3.7 ensureAccounting)

### บั๊กระดับระบบที่ qc:all จับได้ (ยังไม่แก้ที่โค้ดจริง — หนี้ข้อ 1 ของเฟสถัดไป)
ขั้นแรกของ consumer `pos.sale.paid` คือลงบัญชี · ถ้าร้าน **ผูกระบบบัญชีไว้แต่ยังไม่เปิดผังบัญชี** (เช่น เพิ่งกดเชื่อม) บิลจะ throw `"ยังไม่ได้ seed ผังบัญชี"` และ **ขั้นสมาชิกทั้งหมดหยุดตาม** (ไม่ได้แต้ม · ไม่ได้สแตมป์ · ไม่มีไทม์ไลน์ · ไม่แปลงการแนะนำเพื่อน) โดยผู้ใช้ไม่เห็น error · ควรให้ขั้นบัญชี `ensureAccounting` เองหรือข้ามอย่างสุภาพเมื่อยังไม่เปิดผัง

### prod
- Vercel READY ทุก push ของเฟส M3 (ล่าสุด `02edc5e`) · `_prisma_migrations` มี `member_v2_*` ครบ 18 ใบ (a → h3)
- **backfill prod (dry-run ทั้ง 8 สคริปต์ · `ALLOW_PROD_BACKFILL=1 … --dry-run` · ทุกร้าน)**: ไม่มีอะไรต้องแก้เลย — `ร้านที่แก้ 0` ทุกตัว (ร้านจริงยังไม่เปิดใช้ระบบสมาชิก v2) · `member-backfill-hr-users` รายงาน "ไม่มีอีเมล 8" (พนักงาน HR ที่ยังไม่มีอีเมล — เจ้าของกรอกแล้วรันซ้ำได้)
- ⇒ **ไม่ต้องรัน backfill จริงบน prod ตอนนี้** · เมื่อร้านแรกเปิดใช้ v2 ให้รัน dry-run ต่อร้านก่อนเสมอ
