# SVC RUN — จุดต่องานของผู้คุม (อ่านไฟล์นี้ก่อนเมื่อเปิด session ใหม่)

> อัปเดตล่าสุด: **27 ต.ค. 2569** · ผู้วางแผน RUN · branch ปัจจุบันของเอกสาร `session/svc-design` (worktree `/root/projects/shark-svc`)
> ลำดับอ่าน: ไฟล์นี้ → `ledger/SVC-RUN.md` §1 (กติกาเหล็ก) + §3 (สถานะ) + ท้าย §4 → `ledger/SVC-CORE-CONTRACT.md` → แถวใบที่จะทำใน `ledger/SVC-MASTER-PLAN.md` §4 → แบบ `ledger/DESIGN-BOOKING-QUEUE.md` / `ledger/DESIGN-DORM-HOTEL.md` (§ ที่ใบอ้าง)

---

## ▶️ RUNNING — สถานะตอนนี้ (27 ต.ค. 14:5xZ)

- R0.0 ✅ (ดู SVC-RUN §4) · วันแรกกำลังเปิด: เลน 3 = R0.1 · เลน 1 = B.2 · เลน 2 = D.1 (ขั้นใบสั่ง+ข้อสอบ)

## (เดิม) ⏸ PAUSE — สถานะก่อนเริ่ม

- **แผนเสร็จ · ยังไม่เริ่ม RUN** · 0/53 ใบ · ไม่มีเลน/agent/unit ใดของ SVC รันอยู่
- เอกสารที่มี: `ledger/SVC-MASTER-PLAN.md` (53 ใบ + เลื่อน 27) · `ledger/SVC-CORE-CONTRACT.md` (ชื่อชิ้นกลางที่เคาะแล้ว K1–K12) · `ledger/SVC-RUN.md` (กติกา + สถานะ ⬜ ทั้งหมด) · ไฟล์นี้ · `ledger/SVC-KICKOFF-PROMPT.md`
- ✅ เอกสารแผน commit แล้วบน `session/svc-design` (push origin แล้ว 27 ต.ค.)
- **รออะไร**: POS RUN ถึง 100% (ประเมิน ~1–2 วันจาก 27 ต.ค.) + เจ้าของอนุญาตเริ่ม SVC (J0) → เริ่มที่ **R0.0** (ผู้คุมทำเอง) แล้ว **R0.1 · B.2 · D.1** พร้อมกันวันแรก
- ลำดับ RUN ของเจ้าของ: POS → **SVC** → HR → ทีม AI · ลูกค้าจริงรอ: ร้านจองคิว (ตัดผม) + หอพัก
- ของที่ต้องขอเจ้าของระหว่างทาง (ไม่บล็อกการเริ่ม): J1 ข้อมูลร้านตัดผม (สัปดาห์ 3) · J2 ข้อมูลหอ + จด VAT ไหม + ผู้ให้บริการตรวจสลิป+คีย์ (สัปดาห์ 3–4) · J3 ที่ปรึกษากฎหมาย (ส่งชุดสัปดาห์ 2 · ต้องผ่านก่อน D.15) · J4 ผู้ตรวจบัญชี · J5 PDPA · J6 env `INTEGRATIONS_CREDENTIALS_KEY` + สั่ง deploy

## ▶️ RESUME STEPS (ทำตามลำดับ — วางซ้ำได้ทุกครั้งที่ session ใหม่)

1. **เช็กว่า POS จบจริง**: `git show session/pos:ledger/POS-RESUME.md | tail -60` (อ่านอย่างเดียวผ่าน git · ห้ามแตะ worktree POS) ว่า "55/55 · 100%" + tip สุดท้ายของ `session/pos` · ยังไม่ 100% = **หยุด ไม่เริ่ม SVC** (เพดานเลนเป็นของ POS)
2. เช็กเครื่อง: `systemctl list-units 'iso-*' 'svc-*' 'pos-*' --no-pager` · `ls /tmp/shark-gate*.lock` · `free -g` (swap ≥ 12G ตาม `reference_shark_pos_build_tsc_heap_7g`) · bind mount `node_modules` ของ worktree (หลังรีบูตหาย — `reference_shark_pos_bind_mounts_lost_on_reboot`)
3. `cd /root/projects/shark-svc && git status && git log --oneline -5` · commit เอกสารแผนถ้ายังไม่ commit (ข้างบน)
4. อ่าน `ledger/SVC-RUN.md` §3 หาใบแรกที่ไม่ใช่ ✅ · ใบที่ 🔄/🧪 = ทำต่อจากขั้นใน SVC-RUN §2 ที่ค้าง (ดู wo-notes «ledger/wo-notes/svc-<wo>.md» + `git diff --stat` ของเลน) · **ห้ามเริ่มใบที่เสร็จแล้วใหม่**
5. ถ้ายังไม่เริ่มเลย → ทำ **R0.0** ตาม MASTER-PLAN §4.R0 แถว R0.0:
   - เคาะฐาน branch: POS merge เข้า main แล้ว ⇒ แตก «session/svc» จาก main · ยังไม่ merge ⇒ แตกจาก tip `session/pos` สุดท้าย (จด SHA ใน SVC-RUN §4)
   - `git worktree add` เลน «/root/projects/shark-svc-l1» «-l2» «-l3» + bind mount `node_modules` · ทรีหลัก `/root/projects/shark-svc` เปลี่ยนเป็น «session/svc» (เอกสาร SVC-* ต้องตามมาด้วย — cherry-pick commit เอกสาร)
   - Neon branch «qc-svc» จาก QC4 (วิธี `reference_shark_pos_qc6_qcall_branch` · ระวัง `reference_shark_qc4_env_role_trap`) → «.env.qc-svc» → «scripts/qc-svc.sh» (`QC_ENV_FILE=.env.qc-svc` · `GATE_LOCK_FILE=/tmp/shark-gate-svc.lock`)
   - ทดลอง `CREATE EXTENSION btree_gist` บน qc-svc (แล้ว rollback) → จดผลใน SVC-RUN §4
   - baseline ชุดเดิม → «ledger/wo-notes/svc-baseline-<hash>.txt»
6. วันแรก (3 เลน): เลน 3 = **R0.1** (migration) · เลน 1 = **B.2** (ตัววางคิว pure) · เลน 2 = **D.1** (กฎหมาย+สูตร pure — ส่วน defs รอ R0.3) · ต่อด้วยตาราง MASTER-PLAN §5
7. ทุกใบ: วิธีทำ SVC-RUN §2 · ปิดใบแล้ว `tg "📊 SVC · NN% (x/53)"` · อัปเดต §3 ของ SVC-RUN + บล็อกนี้ (เปลี่ยนหัวเป็น ▶️ RUNNING + ใบที่กำลังเดิน + เลน)

## 📌 ข้อเคาะที่ค้าง (ทำตามค่าปลอดภัยไปก่อน · ดู CC §10)
- รหัสผังบัญชีเงินประกันผู้เช่า (D.2) · ค่าคอมฯ เมื่อผู้ให้บริการไม่มีบัญชีผู้ใช้ (B.0/B.10 — แจ้งผู้คุม POS) · btree_gist (R0.0) · ลิงก์เปิดแชท OA พร้อมรหัส (C.2) · ข้อความบริการ vs การตลาด (J5)
- ฐาน branch (R0.0) · ลำดับความสำคัญเลนถ้าเจ้าของอยากให้ "หอนำ" (MASTER-PLAN §8 คันโยก ก)
