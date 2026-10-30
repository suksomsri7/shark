## ⏸ HANDOVER 30 ต.ค. ~11:0xZ (weekly 98% · เจ้าของสั่งเตรียมย้ายบัญชี)
**31/53 (58%)** · `session/svc` push แล้ว (tip = D.9 merge 950565b6 + ledger) · ✅ ล่าสุด: D.11 · B.10 · B.8 (รายละเอียด SVC-RUN §3/§4)
- **ด่านค้าง:** gate-k (D.9 merged 950565b6) `/root/svc-runs/gate-k.sh` → ผล `/root/svc-runs/gate-k.txt` · ที่เห็นแล้ว: d.9 86/89 0 failed · probe-d9-b 28/0 · ถ้าค้างกลาง/ไม่มี DONE ⇒ รันใหม่ `setsid nohup bash /root/svc-runs/gate-k.sh > /root/svc-runs/gate-k.txt 2>&1 < /dev/null & disown` · เขียวทั้งหมด ⇒ mark D.9 ✅ (32/53) commit ledger + push + tg
- **เลน (งานอยู่บนดิสก์ ยังไม่ commit · agent เก่าตายตอนย้ายบัญชี ⇒ เปิด builder ใหม่ให้ "ทำต่อจากสถานะทรี" + อ่านใบสั่ง/รายการแก้):**
  - **l1 D.12** ย้ายออก/คืนประกัน · oracle be3f2a37 (121 ข้อ · มติ R1–R7 ท้ายใบสั่ง) · builder เริ่มแล้ว (merge 950565b6 เข้า l1 ก่อน) → ต่อ: builder → 2 ผู้ตรวจ → fix → commit → merge → gate
  - **l2 D.10** ตรวจสลิป/รับเงินหอ · oracle 67cab545 (79 ข้อ · มติ R1–R11) · builder เริ่มแล้ว → เหมือนกัน
  - **l3 D.4** นำเข้า Excel · builder แก้ X1–X20 ตาม `/root/svc-runs/fix/d4.md` (2 ผู้ตรวจเสร็จแล้ว · probe `scripts/probe-d4-b.mts` ต้อง 0 BREACH · log ใหม่ `/tmp/svc-d4-probe-2.log`) · l3 มี node_modules แยก `/root/projects/shark-svc-nm-l3` (มี DormImportBatch · migration svc_d4 ลง QC DB แล้ว) ⚠️ ทรีหลัก/l1 ใช้ client ของทรีหลัก — **หลัง merge D.4 ต้อง `pnpm exec prisma generate` ในทรีหลัก**
- **ถัดไป:** B.12 ปิด B1 (ผู้คุมรันด่านเต็ม · B.5–B.11 ครบแล้ว) · D.15 ปิด D1 หลัง D.3 D.4 D.10 D.11 D.12 D.13 · B.13 หลัง B.12
- **ค้างผู้คุม:** (1) pos.sale.paid P2002 `accountJournalEntry.create` (gl.ts) ที่ probe B.8 เห็นตอนระบายคิว — ตรวจตอน B.12 (2) d.6 S-5 (กล่องเงิน D.8 ในจอมิเตอร์) + G-2 r0.2 (ข้อมูล seed บาร์เบอร์) แดงบนฐาน — ORACLE-EDIT ตอน B.12/D.15 (3) d.13 S-8 ใช้ git status ⇒ แดงเมื่อใบหลังแตะ prisma/meter.ts ระหว่างทำ (เสนอเทียบ base commit) (4) ฉาก b.7 กับ b.10 วันเดียวกัน ⇒ ด่านต้อง `svc-qc-done-pos-scene --clear` ก่อน b.7 (5) ภาพเทียบแบบ (QC_BASE) ยังไม่ได้ถ่ายรวม (6) ส่งชุดคำถามกฎหมาย `ledger/wo-notes/svc-legal-questions.md` ให้เจ้าของ (7) ลบ Neon branch wo-svc-qc ตอนจบ RUN
- **บทเรียนใหม่วันนี้:** ฉากบน svcqc ห้ามตั้งค่าระดับร้าน/หน่วยที่ชุดอื่นพึ่ง (D.9 ตั้ง payments.receiver ⇒ r0.6 แดง) · เลนที่แตะ schema ต้องมี node_modules แยกก่อน generate (D.4 ทำ client ร่วมพัง 5 นาที) · ORACLE-EDIT ต้องคงความเข้ม + ติดป้ายผู้คุม
- **วิธีทำงาน/สคริปต์ด่าน:** `/root/svc-runs/gate-*.sh` (แบบ run() ลอง 4 ครั้ง) · รายการแก้ `/root/svc-runs/fix/*.md` · กติกาเดิมทั้งหมดใน SVC-RUN §1–2 · ตอบเจ้าของเป็นภาษาไทย · tg สั้น % เท่านั้น

## ⏸ CHECKPOINT 29 ต.ค. (โควตา 92% · รีเซ็ต ~45 นาที)
- 19/53 · B.11 (64e6c184) + D.5 (b79f2ef5) merged รอ gate รวม /root/svc-runs/gate-d5.txt เขียว ⇒ mark ✅ 21/53 + push + tg
- l1 B.5 builder (oracle 75eafc1a) กำลังรัน · l2 D.8 builder เริ่มแล้ว (oracle 6965f136 · มติ perf/paylink รอยืนยัน) · l3 D.13 oracle committing (98 ข้อ · builder เริ่มหลังรีเซ็ต · G-1 r0.9 + G-4 d.5 M-11 แดงตั้งแต่ฐาน ต้องรันเดี่ยวหลัง reseed ก่อนรับ)
- agent หยุดเพราะโควตา ⇒ SendMessage ปลุก (งานอยู่บนดิสก์ใน worktree)

# SVC RUN — จุดต่องานของผู้คุม (อ่านไฟล์นี้ก่อนเมื่อเปิด session ใหม่)

> อัปเดตล่าสุด: **27 ต.ค. 2569** · ผู้วางแผน RUN · branch ปัจจุบันของเอกสาร `session/svc-design` (worktree `/root/projects/shark-svc`)
> ลำดับอ่าน: ไฟล์นี้ → `ledger/SVC-RUN.md` §1 (กติกาเหล็ก) + §3 (สถานะ) + ท้าย §4 → `ledger/SVC-CORE-CONTRACT.md` → แถวใบที่จะทำใน `ledger/SVC-MASTER-PLAN.md` §4 → แบบ `ledger/DESIGN-BOOKING-QUEUE.md` / `ledger/DESIGN-DORM-HOTEL.md` (§ ที่ใบอ้าง)

---

## ▶️ RUNNING ต่อ 28 ต.ค. ~14:4xZ (เจ้าของสั่ง "Run งานยาวตามแผน") — เลน: l3 builder R0.6 · l1 ข้อสอบ R0.7 · l2 ข้อสอบ B.0

## (จบแล้ว) ⏸ PAUSE — 28 ต.ค. 2569 ~00:3xZ (เจ้าของสั่ง "จบงานพักก่อน · เตรียมย้ายบัญชี")

**สถานะ: 7/53 (13%)** · `session/svc` @ (ดู git log — commit นี้) push แล้ว · ไม่มี agent/unit รันอยู่ · gate lock /tmp/shark-gate-svc.lock ว่าง
- ✅ รับแล้ว: R0.1 · R0.2 · R0.3 · R0.5 · R0.8 · B.2 · D.1 (รายละเอียด/มติ = SVC-RUN §3 + §4 ท้ายไฟล์)
- 🔸 ค้างกลางทาง (หยุดก่อนมีไฟล์งาน — ไม่มี WIP ค้างในทรี):
  - **R0.6** ตรวจสลิปกลาง: ข้อสอบ 66 ข้อ + ใบสั่ง commit แล้ว `5608461a` บน `wip/svc-l3` (push แล้ว · rebase บน session/svc แล้ว) → ขั้นถัดไป = ปล่อย builder (ใบสั่งมีมติ 12 ข้อ + มติผู้คุม: autoApprove เริ่ม false · ใช้ TenantIntegration.onFailure แทน payments.slip.onVerifierDown · PII retention = หนี้ J5)
  - **R0.7** LINE: ยังไม่มีข้อสอบ → เริ่มขั้น 2–3 ใหม่ (เลน l1)
  - **B.0** migration จองคิว: ยังไม่มีข้อสอบ → เริ่มขั้น 2–3 ใหม่ (เลน l2) · ห้ามรันขนานกับ D.0 (schema)
- 🖼️ ค้าง: ภาพเทียบแบบ R0.2 (V-6) + R0.5 (P-4) — build QC รวมครั้งเดียว (ทรี d heap/ISO_MEM ตาม memory reference_shark_pos_build_tsc_heap_7g) พร้อมใบ UI ถัดไป (R0.4)
- 📌 หนี้/carry: `ledger/wo-notes/svc-r0.8-carry.md` (R0.9 งานเก็บกวาด occupancy · setRoomTypeRent affected · D.0 ดัชนี · backfill --apply ทุกร้านก่อนเปิด DORM) · หนี้ SVC-D1 (allowlist ทดสอบ POS ให้รับ ep-mute-scene ก่อนใช้ชุด POS เป็น regression ใน B.8/B.10) · คำถามที่ปรึกษากฎหมาย J3 ใน §4 · หนี้ R0.4 (สรุปข้อเสนอในหน้าอนุมัติ · ปิดค่า PRIVACY · ซ่อน payments.slip.onVerifierDown)
- ชุดแก้หลังผู้ตรวจที่ใช้ไปแล้ว: `/root/svc-runs/fix/*.md` (อ้างอิง)

### ▶️ RESUME STEPS (บัญชีใหม่)
1. อ่านไฟล์นี้ → `ledger/SVC-RUN.md` §1 (กติกา) §2 (วิธีต่อใบ) §3 (สถานะ) + §4 ท้ายไฟล์ (มติล่าสุด) → `ledger/SVC-CORE-CONTRACT.md` (+ภาคต่อท้ายไฟล์)
2. เช็กเครื่อง: `systemctl list-units 'iso-*'` ว่าง · bind mount node_modules ของ `/root/projects/shark-svc-l{1,2,3}` (เป็น symlink แล้ว — ไม่ต้อง mount · l2 ใช้ /root/projects/shark-svc-nm-l2) · `[ -x .../node_modules/.bin/tsx ]` · ทรีหลัก `cd /root/projects/shark-svc && pnpm exec prisma generate` ถ้า client เก่า
3. `git -C /root/projects/shark-svc pull`/log ให้ตรง origin/session/svc · เลน: `git -C /root/projects/shark-svc-lN reset --hard session/svc` (ยกเว้น l3 ใช้ `wip/svc-l3` ที่มีข้อสอบ R0.6 → `git rebase session/svc`)
4. เปิด 3 เลน: l3 = builder R0.6 · l1 = ข้อสอบ R0.7 · l2 = ข้อสอบ B.0 → ต่อตาม MASTER-PLAN §5 (สัปดาห์ 2: R0.7→B.1→B.3 · D.0→D.2→D.5 · R0.4→B.11→D.6)
5. ทุกใบเข้ม: ผู้ตรวจ 2 ตัว + เมื่อข้อสอบใหม่เขียนหลังโค้ดแก้ ให้ผู้ตรวจรันฉากเดิมยืนยันซ้ำก่อน merge · รัน tsc ด้วย `ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168`
6. tg เฉพาะ % หลังปิดใบ · ห้าม push main · ห้าม deploy

## (เก่า) ▶️ RUNNING — สถานะตอนนี้ (27 ต.ค. 14:5xZ)

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
