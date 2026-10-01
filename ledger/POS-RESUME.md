# POS RUN — จุดต่องานของผู้คุมงาน (อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> ผู้คุมงาน Fable 5.1 · บัญชี Claude **B** (Siamdive-B) · worktree `/root/projects/shark-pos` · branch `session/pos` · แผน `ledger/POS-MASTER-PLAN.md`

## 0.1 ▶️ 1 ต.ค. 2569 ~06:40 UTC — เริ่ม RUN (คำสั่งเจ้าของ: "ทำส่วนที่ไม่กระทบ CRM · Fable คุม · sub agent 2 เลน") · 0/55
- **ขอบเขตที่ทำได้ตอนนี้ = P0 (3 ใบ) + brief P1.1–P1.3 เท่านั้น** · ⛔ P1.1a/b (migration/ตารางกลาง) รอ CRM ขึ้น main (CRM เลน N มี migration `20261104000000_account_journal_no_sequence` ค้างอยู่) · ⛔ ไม่ push main · ไม่ build · ไม่แตะพอร์ต 3215
- **แยกจาก CRM อย่างไร** (กติกาเต็ม `ledger/pos-briefs/pos-brief-LANE-RULES.md`):
  - worktree: `shark-pos` (เลน 1 · session/pos) · `shark-pos-b` (เลน 2 · wip) · ฐาน origin/main 04d2ade9 · `node_modules` = **bind mount ของ `/root/projects/shark-crm/node_modules`** (รีบูตแล้วต้อง `mount --bind` ใหม่ · ห้าม prisma generate/pnpm install)
  - ฐานข้อมูล: **QC4 = Neon branch `wo-pos-qc4`** (parent `wo-acc-v2-qc` · host `ep-frosty-lab`) · ใน worktree POS ทั้ง `.env.qc` และ `.env.qc4` ชี้ QC4 · ตัวห่อ `scripts/qc4.sh` · lock `/tmp/shark-gate-qc4.lock` · 🔴 ห้ามรัน `pnpm neon:gc` (จะลบ branch `wo-*` ที่เก่ากว่า 24 ชม. รวม QC ทุกชุด)
  - typecheck ต่อคิว lock เครื่องร่วมกับ CRM (ช้าได้ ไม่ชน)
- **เลน 1 = P0.1 builder** (Opus · shark-pos) brief `pos-briefs/pos-brief-P0.1.md` · notes `wo-notes/pos-P0.1.md` · commit บน session/pos ไม่ push
- **เลน 2 = P0.2 builder** (Opus · shark-pos-b) brief `pos-brief-P0.2.md` · notes ใน worktree ของมัน · push `wip/pos-p0.2`
- **ผู้คุมงานถัดไป**: รับงานแต่ละเลน → ผู้ตรวจอ่านอย่างเดียว (Opus) → รันซ้ำเองบน QC4 (seed ×2 · fitness 2 โหมด · typecheck) → รวม P0.2 เข้า session/pos (patch --fuzz อ่านทุก hunk) → P0.3 ผู้เขียนข้อสอบ `qc-pos-p1.1` + `qc-pos-p1.3` (ต้องมี pos-qc-env จาก P0.1 ก่อน) ∥ เขียน brief P1.1a (ตรวจกับโค้ดจริง) → push `session/pos` (ไม่ใช่ main)
- **CONTROLLER-RUN ค้าง**: `visual-pos.mts` ถ่าย 4 หน้าเดิมจริง (ต้อง build + server พอร์ตของ POS เอง เช่น `ACC_V2_PORT=3225` · build กิน lock ทั้งเครื่อง ⇒ ทำตอน CRM ว่าง/ถามเจ้าของ)
- คำตัดสินผู้คุมงาน: F15.4 = `pos.*` ครบ th/en (แผนไม่ได้นิยาม) · F15 แยกไฟล์ `scripts/fitness-pos.mts` (ลดชนกับ CRM ที่แก้ fitness.mts) · F15.1 เป็น ratchet + baseline writer เดิม · P0.2 ไม่เปลี่ยนพฤติกรรม AI tool เดิม ("6 op" ให้โค้ดตัดสินว่าตัวไหนเป็นของ POS จริง)
- รายงาน tg = % อย่างเดียว (`📊 POS · N% (x/55)`)
