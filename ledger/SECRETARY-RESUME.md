# SECRETARY-RESUME — จุดต่องาน RUN "เลขา AI"

> เริ่มใหม่ = อ่านไฟล์นี้บล็อกบนสุด → `SECRETARY-RUN.md` §3 สถานะ + §4 เหตุการณ์ → ใบถัดไปใน `SECRETARY-MASTER-PLAN.md` §3 → `secretary-briefs/sec-brief-COMMON.md`
> ทรี `/root/projects/shark-sec` · branch `session/secretary` · ฐาน QC `.env.qc-sec` ผ่าน `scripts/qc-sec.sh` · หลังรีบูตเครื่อง: `mount --bind /root/projects/shark-svc/node_modules /root/projects/shark-sec/node_modules` แล้ว `[ -x node_modules/.bin/tsx ]`

## 4 พ.ย. 2026 — มติ 14 แชทลูกค้ารวมในแอป (เต็ม · ก่อน TestFlight) → แผน 55 ใบ · ชุด ฉ K1–K4 · แถบบนใหม่ทุกหน้า · ใบ S0.2 ต้องอัปเดตแถบบน (3 ซ้าย เลขา/ลูกค้า/ทีม · 2 ขวา ?/+) ก่อนปล่อย builder · ยังพักอยู่

## ⏸ PAUSE 3 พ.ย. 2026 ~15:0xZ — เจ้าของสั่ง "วางแผนบันทึกให้เรียบร้อย ยังไม่ต้องเริ่มงาน รอ weekly limit reset" · 0/55
สิ่งที่พร้อมแล้ว (ไม่ต้องทำซ้ำ): worktree ผู้คุม + branch · เลน b `/root/projects/shark-sec-b` (`wip/sec-s0.2` · node_modules ro) · ฐาน QC Neon `wo-sec-qc` + `.env.qc-sec` + `scripts/qc-sec.sh` · run pack ครบ · ใบสั่ง S0.1 (`sec-brief-S0.1.md` = พรอมป์ผู้สำรวจ) + S0.2 (`sec-brief-S0.2.md`) · baseline `scripts/sec-baseline.sh` → `ledger/qc-baseline/sec-baseline-2c2062c7.txt` (✅ จบแล้ว 3 พ.ย. ~15:3xZ: migrate up to date 195 migrations · 60 ชุดข้อสอบเดิม exit=0 ทั้งหมด · ไม่มี failed)
สิ่งที่ถูกหยุด: ผู้สำรวจ S0.1 (ถูกหยุดก่อนเขียนไฟล์ — ต้องสั่งใหม่ทั้งใบ)

### ▶️ RESUME STEPS (ทำตามลำดับตอนกลับมา)
1. `cd /root/projects/shark-sec && git status --short` (ต้องว่าง) · ถ้าเครื่องรีบูต: remount node_modules (บรรทัดบนสุด) ทั้ง shark-sec (rw จาก shark-svc) และ shark-sec-b (ro)
2. baseline ตรวจแล้ว (60/60 เขียว) — ข้ามได้
3. spawn ผู้สำรวจ S0.1 ด้วยพรอมป์ใน `sec-brief-S0.1.md` (background) → ระหว่างรอ: เขียน oracle `scripts/qc-sec-s0.2.mts` (static · ตาม Acceptance ในใบ S0.2) → spawn builder Opus บนเลน b ด้วย `sec-brief-S0.2.md`
4. รับ S0.1 → เขียน `sec-brief-RESOLUTIONS.md` → ออกใบ S0.3 (docs+seed · เลน c = สร้าง worktree `shark-sec-c` branch `wip/sec-s0.3`) และ S0.4 (pack.ts · ผู้คุมเขียน oracle แล้วให้เลน c ทำต่อจาก S0.3)
5. ปิด S0 → CP0 ส่ง TG (ภาพคู่ C3 สว่าง/มืด + ข้อขัดแย้งจาก REVIEW) → S1.1 migration

## ▶️ 3 พ.ย. 2026 ~14:3xZ — เปิด RUN · 0/55
- ทำแล้ว: worktree + branch · ledger (DESIGN-SECRETARY · SECRETARY-MASTER-PLAN · design-secretary/ · secretary-briefs/sec-brief-COMMON · SECRETARY-RUN · wo-notes/TEMPLATE-sec) · ผู้สำรวจ S0.1 กำลังเขียน `REVIEW-SECRETARY-DESIGN-2026-11-03.md`
- กำลังทำ: ฐาน QC Neon `wo-sec-qc` (ลูกของ `wo-svc-qc`) → `.env.qc-sec` + `scripts/qc-sec.sh` → baseline `qc-ai-*`
- ถัดไป: รับ S0.1 → เขียน RESOLUTIONS → ออกใบ S0.2 (เลน b · ธีม RN + shoot/parity) ∥ S0.3 (เลน c · docs + seed) ∥ S0.4 (ผู้คุมเอง pure)
- รอเจ้าของ (ไม่บล็อก): คีย์ SMS · คีย์ Anthropic "shark" · Play Console · W40 POS_DEVICE_KEY
- ⚠️ ภาพ S1/S2 ในแบบยังเขียน "รหัสทางอีเมล" — มติ 13 เปลี่ยนเป็น SMS · แก้ใน gen_sec.py ตอน S2.12 (ไม่ต้องส่งเจ้าของใหม่)
