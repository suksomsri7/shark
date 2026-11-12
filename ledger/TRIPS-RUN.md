# TRIPS-RUN — สถานะสด · บันทึกเหตุการณ์ (RUN "TRIPS" ตั๋ว · ทัวร์ · Liveaboard · เอเจนซี่ · ผู้ให้บริการ)

> สถานะ RUN: **▶️ ขั้นเตรียม (P0) — เริ่ม 12 พ.ย. 2569 06:57Z** · ผู้คุม = session ที่วาง `TRIPS-KICKOFF-PROMPT.md` · branch `session/trips` (ฐาน `origin/release/svc-to-main` fda23269c)
> แผน/ใบงาน = `ledger/TRIPS-MASTER-PLAN.md` · แบบ = `ledger/DESIGN-TRIPS-AGENCY.md` (TA) · ภาพ = `ledger/design-trips/` · กฎหมาย = `ledger/LEGAL-TRIPS-TH.md` (LG) · จุดต่อ = `ledger/TRIPS-RESUME.md` · คำถามเจ้าของ = `ledger/TRIPS-OWNER-QUESTIONS.md`
> กติกาเหล็กและวิธีทำต่อใบ = `ledger/SVC-RUN.md` §1/§2 ใช้ทั้งหมด (แทน "svc" ด้วย "trips") + กติกาเฉพาะด้านล่าง
> ไฟล์นี้ = ที่เดียวที่ผู้คุมแก้สถานะ (§2) และจดเหตุการณ์/มติเทคนิค (§4)

---

## 1. กติกาเฉพาะ RUN นี้ (เพิ่มจาก SVC-RUN §1)
1. ~~ห้ามเริ่มใบที่มี migration จนกว่า ON_MAIN~~ **ยกเลิก 12 พ.ย. ~10Z: เจ้าของอนุญาตเริ่ม T0.1 และใบถัดไปบน `session/trips` โดยไม่รอ ON_MAIN** (งานโรงแรมขึ้น main ช้ากว่าแผน · พบข้อแก้ 5 เรื่อง โรงแรม/CRM/POS) · เมื่อขึ้นแล้ว merge origin/main เข้ามาหนึ่งครั้ง (ตรวจ migration ชน/ลำดับ + `migrate deploy` ทุกฐาน) · เดิม: — ตรวจ: `git fetch -q origin main && git merge-base --is-ancestor origin/session/svc origin/main && echo ON_MAIN` · เมื่อ ON_MAIN: `git merge origin/main` เข้า `session/trips` หนึ่งครั้ง
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

## 2. สถานะสด (⬜ ยังไม่เริ่ม · 🔄 กำลังทำ · 🧪 รอผู้คุมรับ · ✅ รับแล้ว · ⏸ รอของภายนอก) — **3/72 = 4%**

| ใบ | สถานะ | หมายเหตุ |
|---|---|---|
| P0.1 | ✅ | ทรี + 2 เลน + ฐาน QC 3 ตัว + `qc-trips.sh` (e14585342) · ฟิกซ์เจอร์ `scripts/trips-fixture.mts` + `seed-trips-qc.mts` + ข้อสอบ 56/56 บนฐานหลัก (merge 5db329246) · บันทึก `ledger/wo-notes/trips-P0.1.md` |
| P0.2 | ✅ | `ledger/TRIPS-DEFAULTS.md` (122 ค่าตั้ง · 46 คำเตือน + ภาคผนวก ก 27 คีย์ที่สัญญาเพิ่ม) · ผู้ตรวจอิสระเทียบกับสัญญาแล้ว |
| P0.3 | ✅ | `ledger/TRIPS-CORE-CONTRACT.md` รอบ 2 (48b243186) · ผู้ตรวจอิสระ 2 รอบ: r1 FIX FIRST (3 BLOCKER) → r2 **READY** (ไม่เหลือ BLOCKER · N-1…N-11 = หนี้มีด่าน §3) · รายงาน `ledger/wo-notes/trips-P0.3-review-r1.md` `-r2.md` |
| T0.1 | 🔄 | ผู้สร้างเลน l1 (เริ่ม 12 พ.ย. ~10Z) · **ใบสั่ง `ledger/trips-briefs/T0.1.md` + ข้อสอบ `scripts/qc-trips-t0.1.mts` 96 ข้อ พร้อมแล้ว** (แดง 90 ก่อนสร้าง · ผู้คุมรันเอง) · มติคำถามเปิด 21 ข้อ = ท้ายใบสั่ง §8 |
| T0.2 | ⏸ | ใบสั่ง `ledger/trips-briefs/T0.2.md` (มติ §11–§12) + ข้อสอบ `scripts/qc-trips-t0.2.mts` 84 ข้อ (แดง 79) พร้อม · รอ T0.1 merge |
| ที่เหลือ 67 ใบ | ⬜ | ตาม MASTER-PLAN §3/§4 |

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
