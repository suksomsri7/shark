# AI TEAM RUN — จุดต่องานของผู้คุมงาน (อ่านไฟล์นี้ก่อนเมื่อ session ใหม่ · บล็อกล่าสุดอยู่ท้ายไฟล์)

> ผู้คุมงาน Fable 5.1 · tree `/root/projects/shark-ai` branch `session/ai-team` · แผน `ledger/AI-TEAM-MASTER-PLAN.md` (§12 สถานะ) · prompt เปิดงาน `ledger/AI-TEAM-KICKOFF-PROMPT.md` · เลน: `shark-ai-b` · `shark-ai-c` (branch `wip/pos-ai-<wo>[-oracle]`) · DB QC4 ร่วม POS/HR · เวลาใน ledger มาจาก `date -u`

## 0.0 — 2026-10-08 (เตรียม RUN · ยังไม่เริ่ม · ทำใน tree `shark-in-th` main ในเครื่อง ไม่ push)
- เขียนชุดเอกสาร RUN: `AI-TEAM-KICKOFF-PROMPT.md` (commit 7411dfde) · `AI-TEAM-MASTER-PLAN.md` · `ai-team-briefs/ai-brief-COMMON.md` · `ai-brief-RESOLUTIONS.md` · `wo-notes/TEMPLATE-ai.md` · `AI-TEAM-OWNER-QUESTIONS.md` · ไฟล์นี้ · `AI-TEAM-RUN.md` (§2 สัญญา) · brief รายใบ 47 ใบ · `REVIEW-AI-TEAM-DESIGN-2026-10-08.md` (ผู้สำรวจ Opus อ่านอย่างเดียว)
- เงื่อนไขเริ่มโค้ด (มติข้อ 10) ผ่านแล้ว: main f132ce21 (7 ต.ค.) มี CRM v2
- **ยังไม่มี**: tree `shark-ai` · branch `session/ai-team` · env QC4 ใน tree · baseline regression · heartbeat — ทำในขั้น §1 ของ KICKOFF เมื่อเจ้าของสั่งเริ่ม
- ถัดไปเมื่อเริ่ม RUN: KICKOFF §0 → §1 (สร้าง tree/env/baseline) → T0.0 ถือว่าเสร็จแล้วถ้า REVIEW มีอยู่และโค้ดไม่เปลี่ยนจาก hash ที่ REVIEW ระบุ (ไม่งั้นรันผู้สำรวจซ้ำเฉพาะส่วนต่าง) → T0.1 ∥ T0.2
- 2026-10-08T04:36Z ✅ ชุดเอกสาร RUN ครบ (commit 6855ec0f บน main ในเครื่อง · **ยังไม่ push**): MASTER-PLAN · RUN §2 สัญญา 47 ใบ · briefs 47 + COMMON + RESOLUTIONS (R-A…R-E · มติ C1–C35 จาก REVIEW) · REVIEW 527 บรรทัด (ฐาน main 7411dfde) · TEMPLATE-ai · OWNER-QUESTIONS Q1–Q5/O1–O7 · KICKOFF ปรับให้ข้ามขั้นสร้าง pack · ถัดไป = เจ้าของสั่งเริ่ม (บอกจำนวนเลน) → KICKOFF §0/§1 → T0.0 baseline → T0.1 ∥ T0.2
- 2026-10-08T04:48Z เจ้าของสั่ง: push GitHub ✅ (main f301e4b2) · ทำตามแผน/UI · เพิ่ม login+sign-up = T0.5/T2.13 (49 ใบ) · **เปิด 1 เลนใน session ใหม่** — session ผู้คุมงานต้องเปิดบน VPS (bridge env srv1403873) ด้วย prompt จาก `ledger/AI-TEAM-KICKOFF-PROMPT.md` + บรรทัดแรก "Lane cap = 1"

## 1.0 — 2026-10-08 (RUN เริ่ม · เจ้าของสั่ง "เปิด 1 เลน" · session ผู้คุมงานบน VPS srv1403873)
- 2026-10-08T05:03Z §0/§1: tree `/root/projects/shark-ai` branch `session/ai-team` ตัดจาก origin/main 71a1f363 · node_modules + prisma client ของตัวเอง · env QC4 สำเนาจาก `shark-pos/.env.qc4` (ตรวจ role neondb_owner + host ep-frosty-lab ด้วยการนับ ไม่พิมพ์ค่า) · heartbeat CronCreate */23 (session-only · สร้างใหม่ทุกครั้งที่ session รีสตาร์ท)
- เครื่องตอนเริ่ม: load ≈10 · swap 36% (POS/HR รันอยู่) ⇒ ถือ 1 เลนเคร่งครัด · งานหนักทุกอย่างอยู่ใน unit `ai-*`
- T0.0: REVIEW ยังสด (`git log 7411dfde..origin/main` บนเส้นทาง AI/มือถือ/prisma ว่าง) · baseline 21 ชุดรันใน unit `ai-baseline` (ตัวรัน `/tmp/ai-baseline/run.sh` · ผล → `ledger/wo-notes/ai-baseline-71a1f363.txt` · log รายชุด `/tmp/ai-baseline/<suite>.log`) — ถ้า session ตาย: ดูว่าไฟล์ผลมีบรรทัด `# finished` หรือยัง ถ้ายังให้รันต่อเฉพาะชุดที่ขาด
- T0.2: เลน B `/root/projects/shark-ai-b` branch `wip/pos-ai-t0.2-oracle` · ผู้เขียนข้อสอบ (Opus) กำลังเขียน `scripts/qc-ai-t0.2.mts` (ยังไม่ commit — ผู้คุมงานรันซ้ำแล้ว commit เอง) · ลำดับจริงเมื่อ 1 เลน: T0.0 → T0.2 → T0.1 (ต้องใช้ร้าน AT-1 ของ T0.2) → T0.3 → T0.4 → T0.5
- 🚫 push `session/ai-team` ครั้งแรกถูกตัวกั้นสิทธิ์ของ session ปฏิเสธ (05:1xZ) — commit อยู่ในเครื่อง · รอเจ้าของอนุญาต/สั่ง
- ถัดไป: รับข้อสอบ T0.2 → รันซ้ำ → commit `test(ai-team): t0.2` → builder บน `wip/pos-ai-t0.2` → reviewer → รับ
- 2026-10-08T06:06Z T0.2 🧪→🔨: ข้อสอบ `scripts/qc-ai-t0.2.mts` 41 ข้อ commit 008312d5 บน `wip/pos-ai-t0.2-oracle` (ผู้คุมงานรันซ้ำ: forced 2/41 exit 1 แดงถูกเหตุผล · unforced SKIP exit 0 · residue 0) · มติ OQ อยู่ท้าย brief T0.2 (ร่าง prisma อยู่ `prisma/drafts/` ไม่ใช่ schema/) · builder (Opus) ทำบน `wip/pos-ai-t0.2` ใน shark-ai-b — ถ้า session ตาย: ดู `git -C /root/projects/shark-ai-b status/log` แล้ว spawn builder ใหม่ให้ทำต่อจากไฟล์ · baseline 17/21 เขียว ยังรัน
