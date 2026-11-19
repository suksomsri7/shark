# ส่งไม้ HR V2 RUN → บัญชี A (19 พ.ย. 2026)

ผู้ส่ง: session ผู้คุมของบัญชี B (รอบ 17–19 พ.ย.) · เครื่อง: **VPS นี้** (เจ้าของ 19 พ.ย.: SHARK ทำบน VPS ต่อ · studio ยกเลิก · ห้ามทำ SHARK บน studio)
ไฟล์นี้อ่านจบแล้วเริ่มงานได้ · รายละเอียดเต็มอยู่ใน `ledger/HR-RESUME.md` ตั้งแต่บล็อก "▶️ กลับมาเดินต่อ — 2026-11-17" ถึงท้ายไฟล์

## 0. อ่านก่อนแตะอะไร
- ทรีผู้คุม: `/root/projects/shark-hr-merge` สาขา `session/hr` (ไม่มี node_modules — ใช้ merge + สมุดคุมงาน · commit ด้วย `--no-verify`)
- `session/hr` ในเครื่อง **นำ origin 164 commit · ยังไม่ผ่านด่านรวม → ห้าม push session/hr** · สำรองไว้ที่ป้าย `backup-1118/session/hr` บน origin (ภาพ 18 พ.ย. — หลังทำงานเพิ่มให้ย้ายป้ายหรือสร้างป้ายใหม่)
- กติกา RUN: `ledger/hr-briefs/hr-brief-COMMON.md` · ทุกคำสั่งฐานข้อมูลผ่านตัวห่อ: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<x>.mts` (ฐานเลน) · QC4 = `scripts/qc4.sh` (เฉพาะทรี shark-hr-c) · hotfix = `scripts/qc-hf.sh`
- งานหนักผ่าน `scripts/iso.sh` เสมอ · typecheck: `ISO_MEM=14000M NODE_OPTIONS=--max-old-space-size=12288` (8192 หมดหน่วยความจำ) · build: heap 14336 ดู `ledger/hr-ctl-scripts/walk_rewalk.sh` · ห้ามครอบ iso.sh ด้วย `timeout` · รอ MemAvailable ≥ 15 GB (typecheck) / 17 GB (build) · build ทีละเลน
- บทบาทแยก: ผู้เขียนข้อสอบ (ห้ามแตะ src/) → ผู้สร้าง (ห้ามแตะ scripts/qc-*, walker) → ผู้ตรวจ/ผู้ตรวจภาพอิสระ → ผู้คุม merge · ตัวแทนของ session เดิมเรียกต่อไม่ได้ ต้องเปิดใหม่ด้วยใบสั่ง (ตัวอย่างใบสั่งที่ใช้ได้ผล: ดู prompt ใน HR-RESUME / wo-notes ของแต่ละใบ)
- เจ้าของ: ตอบภาษาไทย · รายงาน Telegram (`tg`) สั้น ๆ เป็น % เป็นระยะ · คุณภาพ > ความเร็ว · UI ต้องตรงแบบที่อนุมัติ · ตอนพักไม่ tg รายชั่วโมง

## 1. สถานะ: 40/44 (91%) · ไม่มีตัวแทน/งานเบื้องหลัง/เซิร์ฟเวอร์ค้าง · ข้อมูลเดินหน้าจอถอนจากทุกฐานแล้ว
| ทรี | สาขา @ head | สถานะ | ต้องทำต่อ |
|---|---|---|---|
| shark-hr-merge | `session/hr` 46ab94b1d+ | มี PREPROD-1 · LEAVE-3 · PRIV-3 · **VIS-5b · VIS-5a** (merge ในเครื่อง 18 พ.ย.) | ยังไม่รันยืนยันบน QC4 → ทำในด่าน pm-full |
| shark-hr (เลน 1 · ฐาน ep-nameless-sea) | `wip/hr-vis-5bc` a62a61c5d | **VIS-5c รอบ 2 สร้างเสร็จ** · vis-5c 43/43 · walker ทุกกฎ 0 (296 ช่อง) · กดจริงผ่าน · ภาพ `/root/qc/hr-vis5c-r2/` | (1) ORACLE-EDIT re-gold `qc-hr-priv-3` P5 — เพิ่ม testid `hr-people-sched-toggle-*` + `hr-people-summary` · ชื่อพนักงานต้องตรง golden เดิม (ผู้เขียนข้อสอบแสดงส่วนต่างรายบทบาทก่อน) (2) ผู้ตรวจภาพอิสระรอบ 2 เทียบ mockup (ใบสั่ง + รอบ 1: `ledger/wo-notes/hr-VIS-5c-visual-r1.md` · บันทึกผู้สร้าง `hr-VIS-5c-build.md` ส่วน "Round 2" มีรายการต่างจากแบบ) (3) `qc-pos-p6.2` 13/16 — พิสูจน์ว่าแดงบนฐาน session/hr อยู่แล้วหรือไม่ (4) merge `session/hr` เข้าเลน (ตอนนี้ฐาน 7d532038e) แล้ว merge เข้า session/hr (5) จดหนี้: walker FIT-CLIP มองไม่เห็นตารางล้นกรอบใต้แผง |
| shark-hr-l3 (เลน 3 · ฐาน ep-ancient-truth ร่วมเลน 4) | `wip/hr-vis-5d` 426fc6839 (WIP) | VIS-5d: ข้อสอบ 28 ข้อ + เส้นฐาน 23 ชุด (`hr-VIS-5d-oracle.md`) · ผู้สร้างทำ §10 ขั้น 1–3 แล้ว **ถูกหยุดกลางทาง** · vis-5d 26/28 | ท้าย `ledger/wo-notes/hr-VIS-5d-build.md` มี 7 ขั้นถัดไป: รันข้อสอบ+fitness บนหัว WIP → build :3263 → seed down/up → เดิน 14/15/x7 (แท็บรอบจ่ายสูง 2653/2769 > 2400 ที่ 1440) → กดปุ่มจริงทั้ง 22 + การ์ด (สคริปต์ `hr-VIS-5d-press.mts.txt`) → seed down → รายงาน · ORACLE-EDIT 3 จุด: W2 รับ `hr-life-save` · I3 false positive (คำไทยจากข้อมูลเช็กลิสต์ของร้าน) · h4.4 S13.2 (ชนคำตัดสินข้อ 5) · h1.2 ยังไม่รันซ้ำ · แล้วผู้ตรวจภาพ → merge |
| shark-hr-hf (ฐาน `hf_tenant` บน host เลน 5) | `hotfix/hr-hf-tenant` 5bd828aa2 (ฐาน origin/main bda823d22) | **HF-TENANT เสร็จ 21/21** · ผู้ตรวจอิสระ 2 รอบ MERGE WITH NOTES · ตัวตรวจ 22 ปุ่ม + migration `20261229000000_hr_hf_tenant_unique_keys` | **รอ GO เจ้าของ 2 ขั้น**: (1) SQL อ่านอย่างเดียวบน prod (ใบสั่งข้อ 3 A–E + คำสั่ง R2-2 ในรายงานผู้ตรวจรอบ 2) (2) push main นอกเวลาทำเงินเดือน · ก่อน push: ตรวจว่า origin/main ยังเป็น bda823d22 ถ้าขยับต้อง rebase + รันข้อสอบซ้ำ · 5 บรรทัดรอบ 3 ยังไม่มีผู้ตรวจอิสระดู |
| shark-hr-c (QC4) | `tmp/walk-vis5b` 594b109a4 | สาขาถ่ายภาพ ทิ้งได้ · ใช้ทรีนี้ (checkout `session/hr`) สำหรับด่านรวม/เดินทั้งระบบ | — |
| shark-hr-b / l4 / l5 | leave-3 / preprod-1 / priv-3 | merged แล้ว · เลนว่าง (ฐานเลน 2/5 ร่วมกัน ep-orange-dust · มีฐาน `hf_tenant` อยู่บน host นี้ — อย่าลบ branch Neon นี้) | — |
ทุกฐานทดสอบ HR (เลน 1, 2/5, 3/4, QC4) ลง migration `20270112000000` แล้ว

## 2. ลำดับงานที่เหลือ
1. ปิด VIS-5c (ตาราง) → 2. จบ VIS-5d (ตาราง) → 3. VIS-5e: ใบสั่ง `ledger/hr-briefs/hr-brief-VIS-5e.md` 75 รายการ · เลน C0 → A ∥ B ∥ C → D (ถ้าตัดสินให้ทำ) · ตัวเลข walker หลายหน้าเก่า (เดิน 14 พ.ย.) ให้เดินใหม่ก่อนเปิดเลน
4. รวม `origin/main` เข้า `session/hr` (merge-base 4d6ef6ee7 — main มี migration `20261228000300…001000` ที่ session/hr ยังไม่มี) + แก้ migration V2 `20261202…` / `20270112…` ตามใบสั่ง HF-TENANT ข้อ 4 + ORACLE-EDIT `qc-hr-priv-3` S6 (ค่าตรึงเนื้อหา 95fb5ad171abc2e3 + นับโฟลเดอร์ hotfix)
5. ด่าน pm-full บน QC4: `seed-hr-walk --down` ก่อน · `MIGRATE=1` · EXTRA="qc-hr-preprod-1b qc-hr-preprod-1c qc-hr-leave-3 qc-hr-leave-3b qc-hr-priv-3 qc-hr-priv-3b qc-hr-vis-5a qc-hr-vis-5b qc-hr-vis-5c qc-hr-vis-5d qc-hr-hf-sso qc-hr-money-2 qc-hr-priv-2 qc-account-cpa" → HANDOVER-H4 → push session/hr → **41/44**
6. เดินหน้าจอทั้งระบบ (build ใหม่ · seed ใหม่ · press probe เปิดเป็นค่าเริ่ม) + ดูภาพคู่กับแบบ → **42/44** — ต้องดูในรอบนี้: VIS-5a r4b B-4 (เหตุผลใต้ป้ายตอนเปิดลิ้นชัก) · B-2 (ตารางเลื่อนในกรอบเมื่อยอดใหญ่) · คู่ภาพลิงก์ "กรอกยอดยกมา" เจ้าของ/เงินเดือนสาขา · ทางสำเร็จของ "ดึงชั่วโมง" (ร้านทดสอบปิดกฎหักสาย) · ลิ้นชักที่ 1024/390
7. H5.3 production: GO ทีละ migration + นักบัญชี 85 ข้อ + ยืนยัน ปกส. 17,500 → **43/44 จบจริง** (H4.7 ตัด)

## 3. รอเจ้าของตัดสิน (ถามซ้ำเมื่อถึงจุดที่ขวางงาน)
- GO HF-TENANT (2 ขั้น) · hotfix ไม่ลบแถวใด — ถ้า SQL เจอแถวแปลกปลอม เจ้าของตัดสิน
- ตารางรอบจ่ายตอนเปิดลิ้นชัก: (ก) รับ 5 คอลัมน์ที่ 1280–1366 / 7 ที่ 1440–1536 [เดินด้วยข้อนี้อยู่] หรือ (ข) ตัวเลขย่อแบบ mockup (`32,000` แทน `฿32,000.00`)
- หลัง VIS-5c บทบาทเงินเดือนไม่เห็นเลขบัตร/ปกส./บัญชีเต็มจากหน้าโปรไฟล์ (เดิมเห็นผ่านฟอร์มที่บันทึกไม่ได้) — ถ้าต้องใช้ = ปุ่ม "เปิดดูเลขเต็มแบบมี audit" (รายการเจ้าของ)
- VIS-5c: ท้ายแผงข้างเป็นลิงก์ (ไม่มี บันทึก/ยกเลิก/สิ้นสุดการจ้าง ในแผง) · ป้าย "ลาวันนี้" (ไม่มีชนิดการลา) · ไม่มีวันหมดอายุเอกสาร · ตัวนับ "ยืมตัวมา N"
- VIS-5d: 6 องค์ประกอบไม่มีหลังบ้าน (แผง AI · ประวัติแก้ตารางกฎหมาย · คอลัมน์ "ในร้านตอนนี้" ฯลฯ) · สามคอลัมน์ตามแบบได้เฉพาะ ≥1536
- VIS-5e คำถาม 10 ข้อท้ายใบสั่ง (รูปแบบเงิน · พ.ศ./24 ชม. · ค.ศ. บนหน้าอังกฤษ + แปลข้อความเซิร์ฟเวอร์ ~60 ไฟล์ · "—" แทน "0 วัน" ฯลฯ) + คำถามผู้คุม 7 ข้อ (เช่น แก้ `cancelLeaveAction` ที่ throw ในชุดนี้หรือแยกใบ)
- ยืนยัน ปกส. 17,500 (HF-SSO ห้าม prod จนยืนยัน) · GO production ทีละ migration

## 4. คำตัดสินและบทเรียนของรอบนี้ (อย่าทำซ้ำ)
- **ข้อสอบระดับฟังก์ชันจับ runtime crash ไม่ได้** — พบปุ่มรอบจ่าย 7 + แก้เวลา 4 ตัวกดแล้วหน้าพังบน session/hr ตั้งแต่ H3.4/H2.6 (inline `"use server"` จับฟังก์ชัน) → ทุกใบ UI ผู้สร้างต้อง build + **กดปุ่มจริงในเบราว์เซอร์** ก่อนรายงาน · ข้อสอบ `qc-hr-vis-5a` A1/A2 สแกนทุกหน้า HR · walker มี PAGE-CRASH / FIT-CLIP / press probe
- **ห้ามเปลี่ยนคำหรือใส่คอมเมนต์/ข้อความตายเพื่อให้ข้อสอบผ่าน** (VIS-5c รอบ 1 ถูกตีกลับ) — ข้อสอบชนข้อมูล = แก้ข้อสอบ (ORACLE-EDIT) ไม่ใช่แก้ UI
- golden ที่แดงเพราะหน้าแยกมุมมอง: **ไม่ re-snapshot เฉย ๆ** → เรนเดอร์ทุกมุมมองแล้วเทียบ union กับ golden เดิม (priv-3 P7, P5) · ค่าตรึงที่ขึ้นกับวันที่ต้อง normalise (priv-3 N3)
- ชุดเก่าที่มองไฟล์ของใบใหม่เป็นของแปลกปลอม: ข้อยกเว้นแคบเท่านั้น (เฉพาะ hunk ที่มีป้ายของใบ · ไฟล์ใหม่มีป้ายใน 3 บรรทัดแรก · กุญแจข้อความใต้ block ของใบ) — ยังไม่มี negative control
- ปุ่มที่ action จะปฏิเสธผู้ดู = ไม่แสดง · ปุ่มสีเทาต้องมีเหตุผล
- priv-3 S4 เขียวได้เฉพาะบนทรีสะอาดของ session/hr (นับไฟล์ไม่ติดตาม + commit ของเลน) — แดงบนเลนเป็นปกติ
- ถ่ายภาพก่อนกดปุ่มทดสอบ (seed สะอาด) · `seed-hr-walk --down` ถ้ารายงานแถวฐานเปลี่ยน → `seed-hr-qc` ใหม่
- เครื่องนี้ `grep` = ugrep ล้มกับ regex ยาว — สแกนความลับด้วย python · `pkill -f` ระวังจับคำสั่งตัวเอง · งานยาวเกิน 2 ชม. ใช้ `systemd-run`
- หนี้ส่งต่อ session อื่น: `qc-nav-functions` S5 แดงบนฐาน (เมนู HOTEL ขาด 14 route · BOOKING 2) · `pnpm drift` แดงบน main (DormUtilityRate) · `qc-hf-hr-privacy` L-5 (ชื่อ fixture มีเลข 13 หลักโดนตัวปิดบังของ AI)

## 5. เอกสารอ้างอิง
ใบสั่ง: `ledger/hr-briefs/hr-brief-{COMMON,VIS-5a,VIS-5b,VIS-5c,VIS-5d,VIS-5e,HF-TENANT,PRIV-3}.md` · บันทึกต่อใบ: `ledger/wo-notes/hr-VIS-5*-{oracle,build,remerge*}.md` (บนสาขาของเลนนั้น) · ผู้ตรวจภาพ: `hr-H5.1-visual-review-r1..r4.md` `hr-VIS-5a-visual-r4b.md` `hr-VIS-5c-visual-r1.md` · HF-TENANT: ทรี shark-hr-hf `ledger/wo-notes/hr-HF-TENANT-{oracle,build,review}.md` · สำรอง/ย้ายเครื่อง: `ledger/HANDOFF-1118.md` · สคริปต์ผู้คุม: `ledger/hr-ctl-scripts/` (ต้นฉบับ `/tmp/hr-ctl/` หายเมื่อรีบูต) · แบบ: `ledger/design-hr/` · ภาพ: `/root/qc/`
ความจำของบัญชี B (ถ้าอยากอ่านเพิ่ม): `/root/.claude-b/projects/-root/memory/project_shark_hr_run.md`
