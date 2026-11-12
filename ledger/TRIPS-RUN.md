# TRIPS-RUN — สถานะสด · บันทึกเหตุการณ์ (RUN "TRIPS" ตั๋ว · ทัวร์ · Liveaboard · เอเจนซี่ · ผู้ให้บริการ)

> สถานะ RUN: **▶️ ขั้นเตรียม (P0) — เริ่ม 12 พ.ย. 2569 06:57Z** · ผู้คุม = session ที่วาง `TRIPS-KICKOFF-PROMPT.md` · branch `session/trips` (ฐาน `origin/release/svc-to-main` fda23269c)
> แผน/ใบงาน = `ledger/TRIPS-MASTER-PLAN.md` · แบบ = `ledger/DESIGN-TRIPS-AGENCY.md` (TA) · ภาพ = `ledger/design-trips/` · กฎหมาย = `ledger/LEGAL-TRIPS-TH.md` (LG) · จุดต่อ = `ledger/TRIPS-RESUME.md` · คำถามเจ้าของ = `ledger/TRIPS-OWNER-QUESTIONS.md`
> กติกาเหล็กและวิธีทำต่อใบ = `ledger/SVC-RUN.md` §1/§2 ใช้ทั้งหมด (แทน "svc" ด้วย "trips") + กติกาเฉพาะด้านล่าง
> ไฟล์นี้ = ที่เดียวที่ผู้คุมแก้สถานะ (§2) และจดเหตุการณ์/มติเทคนิค (§4)

---

## 1. กติกาเฉพาะ RUN นี้ (เพิ่มจาก SVC-RUN §1)
1. **ห้ามเริ่มใบที่มี migration (T0.1 · A1.1 · K1.1 · L1.1) จนกว่า `ON_MAIN` และ production ปกติ** — ตรวจ: `git fetch -q origin main && git merge-base --is-ancestor origin/session/svc origin/main && echo ON_MAIN` · เมื่อ ON_MAIN: `git merge origin/main` เข้า `session/trips` หนึ่งครั้ง
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

## 2. สถานะสด (⬜ ยังไม่เริ่ม · 🔄 กำลังทำ · 🧪 รอผู้คุมรับ · ✅ รับแล้ว · ⏸ รอของภายนอก) — **0/72 = 0%**

| ใบ | สถานะ | หมายเหตุ |
|---|---|---|
| P0.1 | 🔄 | ทรี + 2 เลน + ฐาน QC 3 ตัว + `qc-trips.sh` ✅ (e14585342) · ฟิกซ์เจอร์ร้านตัวอย่าง = กำลังทำ (เลน l1) |
| P0.2 | 🔄 | ตารางค่าเริ่มต้นสุดท้าย + รายการ WARN → `ledger/TRIPS-DEFAULTS.md` (ภาคผนวกของ TA) |
| P0.3 | 🔄 | `ledger/TRIPS-CORE-CONTRACT.md` ร่าง → ผู้ตรวจอิสระ 1 รอบ |
| T0.1 | ⏸ | รอ ON_MAIN (กติกา §1 ข้อ 1) · ใบสั่ง + ข้อสอบเตรียมได้หลัง P0.3 |
| ที่เหลือ 68 ใบ | ⬜ | ตาม MASTER-PLAN §3/§4 |

ภาพที่ยังไม่วาด (TA §12.3 ชุด 4–10): 🔄 ชุดของ M1 ก่อน (จอสินค้า/ราคา/ฤดูกาล · จอค่าตั้ง · หน้าจองจอใหญ่ + อังกฤษ + ปฏิทินฝัง)

## 3. หนี้ (ข้อที่ผ่านไม่ได้ · เหตุผล · ใบที่จะปิด)
— ยังไม่มี

## 4. บันทึกเหตุการณ์ · มติเทคนิค · ORACLE-EDIT (ต่อท้ายเท่านั้น · `YYYY-MM-DD HH:MMZ · ใบ · เรื่อง`)
- 2026-11-12 06:57Z · เริ่ม · เจ้าของวาง kickoff · ตรวจ §0: 8 vCPU · 31 GB (ว่าง 21) · load 8.1 (HR 3 เลน + ด่าน release SVC `svc-rel-main-gate2/3`) · `NOT_ON_MAIN` (origin/main a242405dd) · `origin/release/svc-to-main` = fda23269c ⇒ แตกทรีจาก release ตาม kickoff §0 ข้อ 4
- 2026-11-12 07:00Z · P0.1 · ทรี `shark-trips` + เลน l1/l2 · Neon `wo-trips-qc` (แม่ wo-svc-qc-l1 เพราะเป็นฐานที่ด่าน release ใช้ = มี migration ของ main + svc ครบ) → `prisma migrate status`: 198 migrations · up to date · ลูก l1/l2 แตกจาก wo-trips-qc · Neon รวม 19 branch
- 2026-11-12 07:00Z · มติ · ตัวโหลด env ของ TRIPS ปฏิเสธ host ของ SVC/HR/POS/CRM/ACC ทุกตัว (ไม่มีทางปลด) · ชุดข้อสอบเก่าของ SVC/POS ที่ตรึง host ของตัวเองจะรันบนฐาน TRIPS ไม่ได้ — ถ้าใบใดต้องรัน regression ของโมดูลเดิม (rooms · ticket · pos) ให้ผู้คุมออก ORACLE-EDIT เพิ่ม host แบบที่ HR ทำ (d505755d8) เป็นรายชุด
