# TRIPS-RUN — สถานะสด · บันทึกเหตุการณ์ (RUN "TRIPS" ตั๋ว · ทัวร์ · Liveaboard · เอเจนซี่ · ผู้ให้บริการ)

> สถานะ RUN: **▶️ ขั้นเตรียม (P0) — เริ่ม 12 พ.ย. 2569 06:57Z** · ผู้คุม = session ที่วาง `TRIPS-KICKOFF-PROMPT.md` · branch `session/trips` (ฐาน `origin/release/svc-to-main` fda23269c)
> แผน/ใบงาน = `ledger/TRIPS-MASTER-PLAN.md` · แบบ = `ledger/DESIGN-TRIPS-AGENCY.md` (TA) · ภาพ = `ledger/design-trips/` · กฎหมาย = `ledger/LEGAL-TRIPS-TH.md` (LG) · จุดต่อ = `ledger/TRIPS-RESUME.md` · คำถามเจ้าของ = `ledger/TRIPS-OWNER-QUESTIONS.md`
> กติกาเหล็กและวิธีทำต่อใบ = `ledger/SVC-RUN.md` §1/§2 ใช้ทั้งหมด (แทน "svc" ด้วย "trips") + กติกาเฉพาะด้านล่าง
> ไฟล์นี้ = ที่เดียวที่ผู้คุมแก้สถานะ (§2) และจดเหตุการณ์/มติเทคนิค (§4)

---

## 1. กติกาเฉพาะ RUN นี้ (เพิ่มจาก SVC-RUN §1)
1. ~~ห้ามเริ่มใบที่มี migration จนกว่า ON_MAIN~~ **(**รวม main แล้ว 12 พ.ย. ~18:1xZ = bb45ac749**) ยกเลิก 12 พ.ย. ~10Z: เจ้าของอนุญาตเริ่ม T0.1 และใบถัดไปบน `session/trips` โดยไม่รอ ON_MAIN** (งานโรงแรมขึ้น main ช้ากว่าแผน · พบข้อแก้ 5 เรื่อง โรงแรม/CRM/POS) · เมื่อขึ้นแล้ว merge origin/main เข้ามาหนึ่งครั้ง (ตรวจ migration ชน/ลำดับ + `migrate deploy` ทุกฐาน) · เดิม: — ตรวจ: `git fetch -q origin main && git merge-base --is-ancestor origin/session/svc origin/main && echo ON_MAIN` · เมื่อ ON_MAIN: `git merge origin/main` เข้า `session/trips` หนึ่งครั้ง
2. ห้าม push main · ห้ามแตะ branch `release/svc-to-main` · ห้ามใช้เลน `shark-svc-l1/l2/l3` และฐาน QC ของ RUN อื่น
3. เครื่องร่วมกับ RUN HR V2 (3 เลน · 4 ช่วงพีค) + ด่าน release ของ SVC → TRIPS **2 เลน** · ตรวจ `uptime`/`free -g` ก่อนเปิดงานหนักทุกครั้ง · build หนักต่อคิวล็อกเครื่อง `/tmp/shark-gate.lock` (with-gate-lock.sh ทำให้เอง)
4. ทรีและฐาน QC:

| ทรี | branch | ฐาน QC (Neon) | host |
|---|---|---|---|
| `/root/projects/shark-trips` (ผู้คุม · ด่านรวม · รับใบหลัง merge) | `session/trips` | `wo-trips-qc` br-little-frost-aoax4vl3 (แม่ = wo-svc-qc-l1) | ep-wandering-butterfly-aogzkfrd |
| `/root/projects/shark-trips-l1` | `wip/trips-<ใบ>` | `wo-trips-qc-l1` br-cool-king-aoiyj16v | ep-green-sound-aokclp5k |
| `/root/projects/shark-trips-l2` | `wip/trips-<ใบ>` | `wo-trips-qc-l2` br-aged-darkness-aooezw0h | ep-calm-sun-ao0wyfu5 |

   - ทุกคำสั่งที่แตะฐาน: `bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh <คำสั่ง>` (อ่าน `.env.qc-trips` ของทรีนั้น · ล็อกต่อฐาน `/tmp/shark-gate-trips-<host>.lock`) · รายการ host = `scripts/trips-qc-hosts.mts` · ข้อสอบโหลด env ด้วย `loadTripsQcEnv()` ใน `scripts/trips-qc-env.mts`
   - **migration ใหม่ต้องลงทุกฐานที่เลนใช้** · ใบรับได้เฉพาะเมื่อรันซ้ำบนฐานหลักหลัง merge · จบ RUN ลบ Neon ทั้ง 3 branch (`/root/trips-runs/neon-mk.sh` = ตัวสร้าง · คีย์ `/root/svc-runs/.neon.env`)
   - node_modules แยกต่อทรี (คัดลอกจาก shark-svc-l1 12 พ.ย.) ⇒ `prisma generate` ในทรี TRIPS ไม่กระทบ RUN อื่น
5. สคริปต์/ล็อกของตัวแทน: `scratchpad/<ใบ>/` เท่านั้น · งานยาว: สคริปต์ path เต็มใน `/root/trips-runs/` + `systemd-run --unit=trips-<ชื่อ>` + ตัวเฝ้าจนจบ
6. รายงาน Telegram เฉพาะ `tg "📊 TRIPS · NN% (x/72)"` หลังปิดใบ · ไม่หยุดรอเช็กพอยต์ — คำถามลง `TRIPS-OWNER-QUESTIONS.md` พร้อมค่าปลอดภัย สรุปตอนถึงหมุด M1–M5

## 2. สถานะสด (⬜ ยังไม่เริ่ม · 🔄 กำลังทำ · 🧪 รอผู้คุมรับ · ✅ รับแล้ว · ⏸ รอของภายนอก) — **7/72 = 10%**

| ใบ | สถานะ | หมายเหตุ |
|---|---|---|
| P0.1 | ✅ | ทรี + 2 เลน + ฐาน QC 3 ตัว + `qc-trips.sh` (e14585342) · ฟิกซ์เจอร์ `scripts/trips-fixture.mts` + `seed-trips-qc.mts` + ข้อสอบ 56/56 บนฐานหลัก (merge 5db329246) · บันทึก `ledger/wo-notes/trips-P0.1.md` |
| P0.2 | ✅ | `ledger/TRIPS-DEFAULTS.md` (122 ค่าตั้ง · 46 คำเตือน + ภาคผนวก ก 27 คีย์ที่สัญญาเพิ่ม) · ผู้ตรวจอิสระเทียบกับสัญญาแล้ว |
| P0.3 | ✅ | `ledger/TRIPS-CORE-CONTRACT.md` รอบ 2 (48b243186) · ผู้ตรวจอิสระ 2 รอบ: r1 FIX FIRST (3 BLOCKER) → r2 **READY** (ไม่เหลือ BLOCKER · N-1…N-11 = หนี้มีด่าน §3) · รายงาน `ledger/wo-notes/trips-P0.3-review-r1.md` `-r2.md` |
| T0.1 | ✅ | merge 836080029 · oracle 96/96 บนฐานหลัก · ด่านเต็มของใบ + ผู้ตรวจ 2 รอบ + นักล่า · `ledger/wo-notes/trips-T0.1.md` |
| T0.2 | ✅ | merge 171b9ebc8 · oracle 84/84 + t0.1 96/96 บนฐานหลัก · `ledger/wo-notes/trips-T0.2.md` |
| T0.3 | ✅ | merge 8e9b616dd · oracle 116/116 + t0.2 84/84 + t0.1 96/96 บนฐานหลัก · `ledger/wo-notes/trips-T0.3.md` |
| T0.4 | ✅ | merge 8008b2280 · ด่าน @281452fa1: t0.4 109/110 (S-14 = ผู้คุมแก้ข้อสอบ) + t0.5/t0.3/t0.2/t0.1/p0.1 เขียว · `ledger/wo-notes/trips-T0.4.md` |
| T0.5 | ✅ | merge 571eba461 · oracle 130/130 + t0.3/t0.2/t0.1 บนฐานหลัก · `ledger/wo-notes/trips-T0.5.md` (มติ 8 ข้อ + ข้อบังคับสำหรับ T0.6) |
| T1.1 | 🔄 | ใบสั่ง `ledger/trips-briefs/T1.1.md` + ข้อสอบ `scripts/qc-trips-t1.1.mts` 100 ข้อ (แดง 95) · ผู้สร้างเลน l2 · ใบหน้าจอใบแรก — ภาพคู่กับจอ 16/17 ผู้คุม build + ถ่ายเอง |
| ที่เหลือ 63 ใบ | ⬜ | ตาม MASTER-PLAN §3/§4 |

ภาพ: ชุด M1 วาดแล้ว = จอ 16–20 (e6b3a7a9f · ผู้คุมเปิดดูครบ 5 จอ · รอเจ้าของดู OQ1) · ที่เหลือ (TA §12.3 ชุด 4–7 · 9 · ค่าตั้ง agency/ticket) วาดก่อนใบของเฟสนั้น

## 3. หนี้ (ข้อที่ผ่านไม่ได้ · เหตุผล · ใบที่จะปิด)
หนี้ของสัญญาชิ้นกลาง (ผู้ตรวจ r2) — **ต้องปิดในสัญญาก่อนเขียนใบสั่งของใบที่ระบุ** — **รอบ 3 แก้ครบทุกข้อแล้ว (ผู้ร่างรายงาน · ยังไม่ผ่านผู้ตรวจ)** ⇒ ผู้เขียนใบสั่งของ "ใบด่าน" ต้องตรวจย่อหน้า "(แก้รอบ 3)" ที่เกี่ยวกับโค้ดจริงก่อนใช้:
| หนี้ | เรื่อง | ต้องปิดก่อน |
|---|---|---|
| N-1 | รหัสบัญชี 2140/4040 ถูกใช้แล้ว (หอพัก · ผังนำเข้า) → อ้างด้วย mapping key + สร้างบนรหัสว่าง | T0.7 |
| N-2 | ใบรับของทริปใช้การลงบัญชีมัดจำมาตรฐานไม่ได้ (ทุกอย่างลง 2110) → ต้องลง journal เองมีขาเงินรับแทน + รายงาน VAT + ไม่นับในมัดจำค้าง | T0.7 |
| N-6 | ลงบัญชีในงวดที่ปิดแล้วถูกปฏิเสธ → คิวลองใหม่วนไม่จบ | T0.7 |
| N-5 | เอเจนซี่เก็บเงิน: ยกเลิกแบบมีค่าธรรมเนียม + โหมด AGENT_RESELLS ยังไม่มี journal | A1.5 |
| N-3 | ตั๋ว V2: ช่วง deploy ขายเกินได้ (โค้ดเก่าขายหลัง migration) → รอบต้องปฏิเสธการขายจน reconcile | K1.1 |
| N-4 | เงินสดขายหน้าร้านอยู่นอกกะ POS ยังไม่มีวิธีกระทบยอด | T1.3 |
| N-7 | LINE user id ต่างกันต่อ OA → คีย์ (provider, id) · เฉพาะเอเจนซี่เพิ่มผู้ใช้ของตัวเอง | A1.2 |
| N-8 | หน้าสัมผัส `reserveInTx` เขียนสองแบบ (§C vs §D.5) | T0.6 |
| N-9…N-11 · m-1 · m-2 | ระยะถือที่เอเจนซี่จ่ายทันที · ภาคผนวก X25/X26 · เพดานถือที่สาธารณะ · enum ไม่ตรง | แก้สัญญารอบถัดไป |
หนี้แพลตฟอร์ม (ไม่ใช่ของ RUN นี้ · นักล่า T0.1 พบ 12 พ.ย.): `tenantDb().update` ไม่ตัด `tenantId`/`unitId` ออกจาก data ⇒ โค้ดที่ส่ง data จากผู้ใช้ตรง ๆ ย้ายแถวของตัวเองไปร้านอื่นได้ (มีมาก่อน T0.1 · ตอนนี้ครอบ 33 ตารางใหม่ด้วย) → แจ้งเจ้าของ OQ18 · ใบของ TRIPS ทุกใบ: ห้ามส่ง object จากผู้ใช้เข้า `update({data})` ตรง ๆ (zod เลือกฟิลด์เสมอ)

ของที่ผู้ตรวจบอกว่าใบสั่ง T0.1/T0.5 ต้องกำหนดเอง: ค่าสถานะ (งวดจ่าย · แบบฟอร์มผู้เดินทาง · คำขอ PDPA · รายการรอ · ฤดูกาล) · รูป JSON (กฎรอบ · กฎราคา · หยุดขาย · ประกัน) · รายการคีย์ใน snapshot · ชนิดหน่วยของแต่ละค่าตั้ง · ใบที่เพิ่ม severity/ป้ายนักบัญชีในจอค่าตั้ง

## 4. บันทึกเหตุการณ์ · มติเทคนิค · ORACLE-EDIT (ต่อท้ายเท่านั้น · `YYYY-MM-DD HH:MMZ · ใบ · เรื่อง`)
- 2026-11-12 06:57Z · เริ่ม · เจ้าของวาง kickoff · ตรวจ §0: 8 vCPU · 31 GB (ว่าง 21) · load 8.1 (HR 3 เลน + ด่าน release SVC `svc-rel-main-gate2/3`) · `NOT_ON_MAIN` (origin/main a242405dd) · `origin/release/svc-to-main` = fda23269c ⇒ แตกทรีจาก release ตาม kickoff §0 ข้อ 4
- 2026-11-12 07:00Z · P0.1 · ทรี `shark-trips` + เลน l1/l2 · Neon `wo-trips-qc` (แม่ wo-svc-qc-l1 เพราะเป็นฐานที่ด่าน release ใช้ = มี migration ของ main + svc ครบ) → `prisma migrate status`: 198 migrations · up to date · ลูก l1/l2 แตกจาก wo-trips-qc · Neon รวม 19 branch
- 2026-11-12 07:00Z · มติ · ตัวโหลด env ของ TRIPS ปฏิเสธ host ของ SVC/HR/POS/CRM/ACC ทุกตัว (ไม่มีทางปลด) · ชุดข้อสอบเก่าของ SVC/POS ที่ตรึง host ของตัวเองจะรันบนฐาน TRIPS ไม่ได้ — ถ้าใบใดต้องรัน regression ของโมดูลเดิม (rooms · ticket · pos) ให้ผู้คุมออก ORACLE-EDIT เพิ่ม host แบบที่ HR ทำ (d505755d8) เป็นรายชุด
- 2026-11-12 07:10Z · เอกสาร · ทรี release มี TA/LG/แผน ฉบับก่อนรอบ 2 (ไม่มี TA §13.1 · LG N1–N26) → `git checkout session/svc -- <4 ไฟล์>` (dadf9bc4b) · `design-trips/render.mjs` แก้ให้ใช้โฟลเดอร์ของตัวเอง
- 2026-11-12 07:25Z · P0.1 ✅ · ผู้คุมรันเองบนฐานหลัก: seed สร้าง 2 ร้าน (andaman-dive · andaman-aquarium) · ข้อสอบ 56/56 · `scripts/trips-expected.json` = gitignore (id ตั๋วต่างกันต่อฐาน → **ทุกฐานต้อง seed เองก่อนรันข้อสอบ**) · ฐาน l2 ยังไม่ได้ seed
- 2026-11-12 07:25Z · มติฟิกซ์เจอร์ (ภาพขัดกันเอง — รายการเต็มใน wo-notes P0.1): ผังเรือ = 3 ดาดฟ้า (จอ 08/09 ชนะจอ 03) · ส. 14 ว่าง 9 (จอ 01/11 ชนะ 07ข/ง) · ยอดผังเรือ 293,100/188,450/104,650 = ค่าเคบินอย่างเดียว ไม่รวมอุทยาน · วงเงินหลังจอง = 56,518.50 (จอ 04ค ชนะ README) · ตารางยกเลิก = OQ2 · "อควาเรียม ชุดตั๋ว" ในสัญญา PTD ของอันดามันไดฟ์ (จอ 05/10/15) = สินค้าของผู้ให้บริการอื่นที่ร้านขายต่อ (S1.1) ไม่ใช่สินค้าของร้านเอง
- 2026-11-12 ~08:5xZ · P0.2 ✅ P0.3 ✅ · ผู้ตรวจอิสระ r2 = READY (ไล่ล็อก 14 ขั้นตอน ไม่พบ deadlock · ตัวเลข README ทุกชุดคำนวณซ้ำได้ผ่านตาราง journal) · มติผู้คุมรอบ 1 (15 ข้อ) อยู่ในสัญญาที่ติดป้าย "(แก้รอบ 2)" · ข้อแย้งผู้ร่าง M-a/b/d/f ผู้ตรวจยอมรับ · M-e: VAT คิดระดับเอกสาร (แก้ §F.1 ที่ยังเขียน "ปัดต่อบรรทัด" ในรอบ 3)
- 2026-11-12 ~09:0xZ · P0.3 รอบ 3 · ปิด N-1…N-11 + เพิ่ม §N (ค่าสถานะ · รูป JSON · คีย์ snapshot · ชนิดหน่วย · T0.1 เป็นใบที่เพิ่ม severity/ป้ายนักบัญชีในจอค่าตั้งกลาง) · ⚠️ N-2 เสนอคอลัมน์ใหม่ `AccountDocument.passThroughSatang` + N-4 ตาราง `TripCashClose` + N-7 `AgentLogin` ⇒ ต้องอยู่ใน migration ของ T0.1/A1.1 (ไม่มี migration นอกใบที่กำหนด)
- 2026-11-12 ~09:5xZ · T0.1 · ใบสั่ง + ข้อสอบ merge เข้า session/trips · ORACLE-EDIT svc-qc-hosts: เพิ่ม host ฐาน TRIPS 3 ตัว (เหตุผล: ชุด regression r0.3/r0.4/d.1/b.0/smoke ตรึง host SVC · ฐาน TRIPS เป็นลูกของ wo-svc-qc-l1 มี seed SVC ครบ) · มติ: migration ของ L1.9/L1.10 ที่สัญญาแยกไว้ → รวมใน L1.1 · `passThroughSatang` → T0.1 · tsrange แทน tstzrange · หนี้เอกสาร: แก้สัญญา :150 :229 :758 :1056 + TRIPS-DEFAULTS :85 (T44→T46) :76 (T22 ไม่มี CREDIT) ในรอบแก้สัญญาถัดไป
- 2026-11-12 ~10:0xZ · มติเจ้าของ · เริ่มสร้าง T0.1 และใบถัดไปได้โดยไม่รอ ON_MAIN · กติกาอื่นคงเดิม (ห้าม push main · ห้ามใช้เลน SVC) ⇒ ปล่อยผู้สร้าง T0.1 (l1) + ผู้เขียนใบสั่ง/ข้อสอบ T0.2 (l2) · ⚠️ เมื่อ merge main ทีหลัง: ส่วนโรงแรม/CRM/POS ใน main จะต่างจากฐาน release ที่ทรีนี้แตกมา — ต้องรัน regression ซ้ำ
- 2026-11-12 ~11:1xZ · T0.2 · ใบสั่ง+ข้อสอบ merge · มติ: ไม่มีการลบแถวจริง · `paxPrices` ต่อประเภทคน · คอลัมน์เพิ่มใน migration T0.1 (TripExtra name/note/active/sortOrder/paxPrices · TripPaxType active/sortOrder · TripOption sortOrder · TripProduct publishedAt) สั่งผู้สร้าง T0.1 แล้ว · หนี้ภาพ: จอ 17 เขียนค่าอุทยานราชา "300 / 600" สลับกับจอ 16/01 (ผู้ใหญ่ 600 เด็ก 300) — แก้ภาพก่อน T1.1
- 2026-11-12 ~11:4xZ · T0.3 · ใบสั่ง+ข้อสอบ merge · คอลัมน์เพิ่มใน migration T0.1: TripSchedule pausedAt + dateTo nullable · TripDeparture cancelReason/cancelledAt · unique บางส่วน (scheduleId, localDate) · หนี้เอกสารสัญญา: §G ไม่มีผังสถานะรอบ · `trips.minPaxCheck` ย้ายจาก T1.2 มา T0.3 (15 นาที) · `jobs.ts` ย้ายจาก T0.4 มา T0.3 · หนี้ภาพจอ 11: รายการ "ต้องตัดสินใจ" ไม่มี พีพี จ. 16 (9/30 ต่ำกว่าขั้นต่ำ 10) · จอ 11 รถตู้ 2 คัน vs จอ 16 3 คัน
- 2026-11-12 ~12:3xZ · T0.1 · ผู้สร้างส่งงาน (94/96 · fitness 53/53 ×2 · tsc src สะอาด) · ORACLE-EDIT t0.1 **T-4** (regex `Minor$` จับ `isMinor` Bool) · **F-1** (`null ?? "ไม่มีช่อง"` ไม่มีทางผ่าน) · p0.1 บรรทัด 98 cast env (TS2769) · ⚠️ `migrate diff` จะเสนอ DROP INDEX ของ unique NULLS NOT DISTINCT 3 ตัว (TripDeparture · TripPrice · TripLinkStat) ทุกครั้ง — ห้ามรับ (จดในใบสั่งของ A1.1/K1.1/L1.1) · b.0 แดง 4 (M-1 · G-7 · G-8 · G-9) ต้องรันเทียบฐานก่อนแก้ตอนรับใบ
- 2026-11-12 ~12:3xZ · T0.4 · ใบสั่ง+ข้อสอบ merge · มติ: เพิ่ม CHECK sold+held+reserved ≤ capacity (กลับมติ T0.1 §7 ข้อ 16) + ของ TripWaitlist/TripHold/guaranteedAt เข้า migration T0.1 รอบแก้
- 2026-11-12 ~13:1xZ · T0.1 · ผู้ตรวจ FIX FIRST (0 BLOCKER · 4 MAJOR · 14 MINOR) + นักล่า FIX FIRST (1 MAJOR: หน้าค่าตั้ง/settingsDiff/RESET_ALL ล้มเมื่อหน่วยมี ~16,400 รอบ — เกินเพดานพารามิเตอร์ของ Postgres · RESET_ALL ไม่ reset จริง) · ที่ยืนแล้ว: กติกาหอ/โรงแรมไม่ถดถอยบนฐานจริง · กฎทัวร์ไม่บล็อก/ไม่ล้ม (2,650 + 154 ค่าแปลก · 20,000 ขั้นบันไดสุ่ม) · tenantDb 33 ตารางแยกร้าน · SellCounter 200 ขนาน ไม่ซ้ำไม่ขาด · รอบแก้ r2 ส่งผู้สร้างแล้ว (รายการ A1–C ในข้อความ · รายงาน `wo-notes/trips-T0.1-review.md` `-hunt.md`) · มติ: ขยาย unique ของ TripPrice (weekdayMask · bookFrom · travelFrom) · CHECK sold+held+reserved ≤ capacity · T22/T23 ปฏิเสธ CREDIT ตอนบันทึก · คีย์เงินใช้สิทธิ์ `trips.settings.money`
- 2026-11-12 ~13:4xZ · T0.5 · ใบสั่ง+ข้อสอบ merge · เข้า migration T0.1 รอบแก้: TripPriceRule usedCount/bookFrom/bookTo · ตารางใหม่ TripPromoRedemption (รวมเป็น 34 ตาราง — ORACLE-EDIT ถ้าข้อสอบตรึง 33) · หยุดเขียนใบสั่งล่วงหน้าที่ T0.5 (T0.6+ ต้องอิงโค้ดจริง) · เลน l2 ว่าง รอ T0.1 merge → ผู้สร้าง T0.2 (l2) ∥ T0.3 (l1)
- 2026-11-12 13:1xZ · T0.1 ✅ · ด่านผู้คุม @0ef49c129 เขียวทั้งชุด (รายละเอียด wo-notes) · merge 836080029 · migrate deploy ฐานหลัก + l2 (l1 ลงแล้วตอนสร้าง) · oracle 96/96 บนฐานหลัก · ORACLE-EDIT รวมของใบนี้: T-4 F-1 U-1 M-4 R-9 RS-4 S-12 + p0.1 cast · ปล่อยผู้สร้าง T0.2 (l2) ∥ T0.3 (l1) — merge T0.2 ก่อน แล้ว T0.3 ตาม (ทั้งคู่แตะ seed + trips/index.ts)
- 2026-11-12 14:1xZ · T0.2 ✅ · ด่านผู้คุม @08764070a เขียว · merge 171b9ebc8 · seed + oracle 84/84 บนฐานหลัก · ORACLE-EDIT: t0.2 P-11 · p0.1 C-2 · t0.1 S-12 (เอา seed/ฟิกซ์เจอร์ออก) · t0.5 BigInt · fitness F5 baseline 50→51 (trips/jobs.ts ของ T0.3 · อยู่บนเลน l1)
- 2026-11-12 14:1xZ · T0.3 · มติรอบแก้: (ก) สินค้า ARCHIVED/ตัวเลือกปิด ⇒ ปฏิเสธ ผ่าน `assertProductSellableInTx` ใน tx ก่อนล็อกอื่น (ข) งานตามเวลา: try/catch ต่อร้าน/ต่อกฎ + รายงาน failed (ค) GUARANTEED ไม่ถอย: ใช้ `guaranteedAt` ในสูตรสถานะ (T0.4 ใช้สูตรเดียวกัน) (ง) สร้างรอบเป็นชุดวัน commit ทีละชุด + อ่านกฎ/สินค้า/ค่าตั้งใหม่หลังได้ล็อก (จ) ทรัพยากรปิดใช้งาน: ล็อก FOR SHARE เรียง id + ตรวจซ้ำตอนสร้างรอบ (ฉ) ค่าตั้งต่อรอบ: ห้ามสร้าง ref ต่อรอบ (เพดานพารามิเตอร์ที่ ~20,000 รอบ) (ช) ตัวเลขเกิน int4 ⇒ INVALID_INPUT
- 2026-11-12 15:2xZ · T0.3 ✅ · ด่านผู้คุม @cefb366fe เขียว · merge 8e9b616dd · seed ฐานหลัก (ทรัพยากร 10 · กฎ 3 · รอบ 21) · t0.3 116/116 · ปล่อยผู้สร้าง T0.4 (l1) · T0.5 รอบแก้ r2 (l2 · 13 ข้อ · มติ R1–R5 ใน wo-notes เมื่อรับใบ)
- 2026-11-12 16:3xZ · T0.5 ✅ · ด่านผู้คุม @dc43fac2e เขียวทั้งชุด · merge 571eba461 · seed ฐานหลัก (ฤดูกาล 3 · ราคา 5 · รอบ 31 ธ.ค.) · t0.5 130/130 · ORACLE-EDIT t0.5 X1-1 Q-1 · มติ 8 ข้อใน wo-notes · T0.4: ผู้ตรวจยืนยันอ่าน `used = sold + held` (ไม่รวม reserved) ถูกตามใบสั่ง — doc comment ของ T0.3 ผิด ต้องแก้ในรอบแก้ T0.4 · จอต้องตัดสิน "เต็ม" จากจำนวนที่ว่าง ไม่ใช่สถานะ (ใส่ใบสั่ง W1.2/T1.2)
- 2026-11-12 16:5xZ · T0.4 · นักล่า FIX FIRST: ไม่ขายเกิน/ตัวนับไม่เพี้ยน/ไม่ deadlock (พายุ 5×300 คำสั่ง×40 worker · แข่ง 10 แบบ ~5,000 ครั้ง · ล่า 60 วิ 5,375 คำสั่ง) แต่ **BLOCKER: 4 ฟังก์ชัน `*InTx` ใช้การเชื่อมต่อเส้นที่สองใน tx ⇒ 10 ผู้เรียกพร้อมกัน = pool ค้าง 30 วิ ทุกตัวล้ม P2028** (ผู้ตรวจ M1 ตรงกัน) · รอบแก้ r2 14 ข้อ + รวม T0.5 ส่งผู้สร้างแล้ว · มติ: PUBLIC/AGENT เห็นและถือได้เฉพาะสินค้า ACTIVE + ตัวเลือกเปิด (DRAFT/ARCHIVED ⇒ NOT_FOUND) · idempotency key ผูก tenant+unit · เพดานถือที่นับทั้งร้าน · sweeper ต้องกวาดได้แม้ค่าตั้งของร้านเสีย
- 2026-11-12 16:5xZ · แก้บันทึก: "หนี้ภาพ จอ 17 ค่าอุทยานราชา 300 / 600 สลับ" **ไม่ใช่ข้อผิด** — หัวคอลัมน์ของตารางในจอ 17 คือ "เด็ก/ผู้ใหญ่" (จอ 16 เขียน ผู้ใหญ่/เด็ก) · ตัวเลขตรงกัน (ผู้ใหญ่ 600 เด็ก 300)
- 2026-11-12 17:3xZ · T1.1 · ใบสั่ง+ข้อสอบ merge · มติ: จุดรับส่งเก็บช่องเพิ่มเป็น JSON v1 ในคอลัมน์ `polygon` ชั่วคราว (**หนี้ migration A1.1: แตกคอลัมน์ TripPickupZone — nameEn · areas · pickup window · selfArrival · active**) · หนี้ส่งต่อ: `pricing.ts:181` โหลดโซนโดยไม่ตรวจ active (W1.2/T0.6) · `systems.ts` ไม่มีรายการ TRIPS (ไอคอนเมนูข้าง) · ป้ายชื่อค่าตั้งเป็นไทยอย่างเดียว (หน้าค่าตั้งภาษาอังกฤษยังเห็นป้ายไทย)
- 2026-11-12 ~18:1xZ · **ON_MAIN** · เจ้าของแจ้ง: งานโรงแรมขึ้น main แล้ว (6b991f34d) production ปกติ → `git merge origin/main` เข้า session/trips = bb45ac749 (main = release/svc-to-main + 4 commit: ย้ายตัวรับ night-audit/OTA เข้าทะเบียนหลัก · `hotel/booking-sale.ts` · ตัวสลับภาษาหน้าร้านโรงแรม · ปรับข้อสอบ 13 ไฟล์) · ชน 1 ไฟล์ `outbox-consumers.ts` (เก็บทั้งสองฝั่ง: บล็อกโรงแรมของ main แล้วตามด้วยบล็อก trips) · ไม่มี migration ใหม่ (`migrate status` ฐานหลัก up to date) · ด่านหลังรวม: unit `trips-gate-main` → `/root/trips-runs/gate-mainmerge/` · เลน l1 (T0.4) และ l2 (T1.1) จะได้ main ตอนรวม session/trips รอบถัดไป · หมายเหตุ: `origin/session/svc` ไม่ใช่บรรพบุรุษของ main (มี commit เอกสารเพิ่ม) — ใช้ `origin/release/svc-to-main` เป็นตัวตรวจแทน
- 2026-11-12 ~18:4xZ · ด่านหลังรวม main @bb45ac749 (ทรีหลัก · ฐานหลัก · `/root/trips-runs/gate-mainmerge/`): seed ×2 ไม่เขียน · t0.5 130 · t0.3 116 · t0.2 84 · t0.1 96 · p0.1 56 · SVC r0.3 94 · r0.4 45/46 (VIS-2) · d.1 122 · smoke 6 · fitness 53/53 ×2 · typecheck 0 · **แดงที่รู้จัก (ข้อตรวจขอบเขตของใบที่ปิดแล้ว เทียบ git/migration — ไม่ใช่พฤติกรรม · ไม่แก้ข้อสอบของ RUN อื่น)**: b.0 M-1 G-7 G-8 G-9 (มีก่อน TRIPS) · h.0 PC-7 M-6 M-8 S-2 R-10 RP-6 P-4 G-8 (จับ migration/ตาราง/สิทธิ์/defs/trips.ts/ระบบค่าตั้งที่ T0.1 เพิ่ม · G-8 = qc-svc-d.0 M-1 N-1 เหตุเดียวกัน) — ไม่ได้รัน h.0 บน main ล้วนเทียบ
- 2026-11-12 18:2xZ · T0.4 ✅ · ด่าน @0ccdc048f เขียวยกเว้น typecheck 3 error ในข้อสอบ → ORACLE-EDIT (fnTx ส่ง policies ต่อ · t0.1 S-12 ไม่นับไฟล์จาก main) @281452fa1 เขียว · merge 8008b2280 · ฐานหลัก: seed ×2 · t0.4 110/110 · t0.5 130/130 · t0.3 116/116 · t0.2 84/84 · t0.1 96/96 · T1.1: ผู้ตรวจ FIX FIRST (BLOCKER ค่าความเป็นส่วนตัวรั่วในจอค่าตั้ง · 3 MAJOR · 11 MINOR) → รอบแก้ r1 ที่ผู้สร้าง · 8/72
