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
- **~07:55 UTC · เลน 2 P0.2 builder ส่งงาน** (`wip/pos-p0.2` 02867f1b · 4 op จริง: sales.summary/byDay/create/void · `record_expense`/`financial_summary` ไม่ใช่ของ POS · qc-pos-p0.2 44/44 · fitness 33/33 สองโหมด · typecheck exit 0 · POS oracle 6 ชุดเท่าเดิม) → **ผู้ตรวจอ่านอย่างเดียว (Opus) กำลังเดิน** · ยังไม่รับ · มติค้าง D1–D5 ใน `shark-pos-b/ledger/wo-notes/pos-P0.2.md` §4 · ข้อค้นพบโค้ดเดิม 7 ข้อ (AI tool `pos_create_sale`/`void_sale` ไม่ตรวจ unit↔ระบบ POS) รอผู้ตรวจยืนยัน → เข้าคิว P1/P5
- 🔴 typecheck ต้อง `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (ค่าเริ่มต้น 3584 MB = OOM exit 134 บน main ปัจจุบัน)

## 0.2 ▶️ 1 ต.ค. ~08:10 UTC — เจ้าของสั่ง "เปิดเพิ่ม 3 เลน" ⇒ POS เดิน 5 เลน (CRM อีก 4 เลนบนเครื่องเดียวกัน)
- worktree ใหม่ `shark-pos-c` / `-d` / `-e` (ฐาน session/pos d0e6e514 · bind mount node_modules ของ shark-crm · `.env.qc`=QC4) — รีบูตแล้วต้อง mount ใหม่ทุกตัว
- **เลน 3 = P0.3 ผู้เขียนข้อสอบ catalog** `qc-pos-p1.1.mts` (Opus · shark-pos-c · `wip/pos-p0.3-catalog`)
- **เลน 4 = P0.3 ผู้เขียนข้อสอบ register** `qc-pos-p1.3.mts` (Opus · shark-pos-d · `wip/pos-p0.3-register`)
- **เลน 5 = SURVEY-P1 ผู้สำรวจอ่านอย่างเดียว** → `ledger/REVIEW-POS-DESIGN-2026-10-01.md` (`wip/pos-survey-p1`) — ชื่อจริงในโค้ด · call graph createSale · ยืนยันข้อค้นพบ 7 ข้อของ P0.2 · ใช้เขียน brief P1
- ยังเดินอยู่: เลน 1 P0.1 builder (ส่งมอบครบแล้วตาม commit d0e6e514 · น่าจะรอ typecheck) · ผู้ตรวจ P0.2
- brief: `pos-briefs/pos-brief-P0.3.md` · `pos-brief-SURVEY-P1.md`
- ถ้าเครื่องอืด (swap >30% หรือ load >6 ค้าง) ⇒ ไม่เปิดเลนใหม่แทนเลนที่จบ จนกว่าจะลด
- **~08:25 UTC · ผู้ตรวจ P0.2 ส่งรายงาน**: 1 BLOCKER (คีย์กันซ้ำของ `sales.create` ผูกต่อระบบ ไม่ใช่ต่อคีย์ API ⇒ 2 integration ชนกัน บิลหาย) + SHOULD-FIX 4 (เช็กสาขา · เพดานเงิน Int32 + Σจ่าย=ยอด ใน schema · void เฉพาะบิลของ POS · ข้อสอบที่แดงไม่ได้) → **ส่งกลับ builder รอบ 2 แล้ว** (เลน 2) · มติ D1–D5 เคาะแล้ว (อยู่ในข้อความรอบ 2 / wo-notes §4)
- 🔴 **ข้อค้นพบโค้ด prod เดิม (ผู้คุมงานเปิดโค้ดยืนยันเองแล้ว · ยังไม่แก้ · รอเจ้าของเคาะ)**: route เก่า `/api/v1/{sales,customers,inventory/items,appointments,queue/tickets,reservations,shop/orders,tickets/orders}` ใช้ `authenticateApiRequest` แล้ว **ไม่ตรวจ scope และไม่ตรวจระบบที่คีย์ผูก** ⇒ คีย์ API ใดก็ได้ของร้าน (เช่นคีย์บอร์ดงานอย่างเดียว) อ่านยอดขาย/ลูกค้าของร้านตัวเองได้ทั้งหมด (ไม่ข้ามร้าน) · อาจซ้ำกับงานนักล่า CRM C5.5 เลนส์ "authorization across surfaces" ⇒ ต้องถามเจ้าของว่าให้ session ไหนแก้ + ต้อง deploy prod
- ข้อค้นพบ AI tool เดิม (ผู้ตรวจยืนยัน): `pos_create_sale` ลงบิลผิดระบบ/สาขาที่ไม่ผูก POS (MED-HIGH) · `void_sale` ผ่าน AI ไม่ตรวจสาขา+ไม่มีเหตุผล (MED) ⇒ เข้า brief P1 (ใบที่แตะ createSale/void) หรือ hotfix ตามเจ้าของสั่ง
- **✅ ~08:50 UTC · P0.2 รับแล้ว (1/55)** — merge `wip/pos-p0.2` (e4b26fff) เข้า session/pos · ผู้คุมงานรันซ้ำ `qc-pos-p0.2` 55/55 (SKIP S6.7) ทั้งใน shark-pos-b และหลัง merge · fitness เขียว (pre-commit) · ด่านที่ไม่เกี่ยว: build/ภาพ/ทะเบียนปุ่ม (ไม่มี UI/route) · หนี้ → P2.13: query ช่วงวันรวม (93 query) · `pos.sale.read` · path `reports/summary` + void ไม่อยู่ใน POS-API §3 · bundle คีย์ API · เลน 2 ว่าง
- **~08:45 UTC · เลน 1 P0.1 ส่งงาน** (f6f3308b · fitness 38/38 สองโหมด · seed ×4 เหมือนเดิม · ร้านอื่น 36 ค่าไม่เปลี่ยน · typecheck 0) → ผู้คุมงานรันซ้ำ seed + fitness ไร้ env เอง = ตรง → **ผู้ตรวจ P0.1 กำลังเดิน** · CONTROLLER-RUN ค้าง = visual จริง (ต้อง build)
