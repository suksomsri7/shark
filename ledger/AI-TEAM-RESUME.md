# AI TEAM RUN — จุดต่องานของผู้คุมงาน (อ่านไฟล์นี้ก่อนเมื่อ session ใหม่ · บล็อกล่าสุดอยู่ท้ายไฟล์)

> ผู้คุมงาน Fable 5.1 · tree `/root/projects/shark-ai` branch `session/ai-team` · แผน `ledger/AI-TEAM-MASTER-PLAN.md` (§12 สถานะ) · prompt เปิดงาน `ledger/AI-TEAM-KICKOFF-PROMPT.md` · เลน: `shark-ai-b` · `shark-ai-c` (branch `wip/pos-ai-<wo>[-oracle]`) · DB QC4 ร่วม POS/HR · เวลาใน ledger มาจาก `date -u`

## 0.0 — 2026-10-08 (เตรียม RUN · ยังไม่เริ่ม · ทำใน tree `shark-in-th` main ในเครื่อง ไม่ push)
- เขียนชุดเอกสาร RUN: `AI-TEAM-KICKOFF-PROMPT.md` (commit 7411dfde) · `AI-TEAM-MASTER-PLAN.md` · `ai-team-briefs/ai-brief-COMMON.md` · `ai-brief-RESOLUTIONS.md` · `wo-notes/TEMPLATE-ai.md` · `AI-TEAM-OWNER-QUESTIONS.md` · ไฟล์นี้ · `AI-TEAM-RUN.md` (§2 สัญญา) · brief รายใบ 47 ใบ · `REVIEW-AI-TEAM-DESIGN-2026-10-08.md` (ผู้สำรวจ Opus อ่านอย่างเดียว)
- เงื่อนไขเริ่มโค้ด (มติข้อ 10) ผ่านแล้ว: main f132ce21 (7 ต.ค.) มี CRM v2
- **ยังไม่มี**: tree `shark-ai` · branch `session/ai-team` · env QC4 ใน tree · baseline regression · heartbeat — ทำในขั้น §1 ของ KICKOFF เมื่อเจ้าของสั่งเริ่ม
- ถัดไปเมื่อเริ่ม RUN: KICKOFF §0 → §1 (สร้าง tree/env/baseline) → T0.0 ถือว่าเสร็จแล้วถ้า REVIEW มีอยู่และโค้ดไม่เปลี่ยนจาก hash ที่ REVIEW ระบุ (ไม่งั้นรันผู้สำรวจซ้ำเฉพาะส่วนต่าง) → T0.1 ∥ T0.2
- 2026-10-08T04:36Z ✅ ชุดเอกสาร RUN ครบ (commit 6855ec0f บน main ในเครื่อง · **ยังไม่ push**): MASTER-PLAN · RUN §2 สัญญา 47 ใบ · briefs 47 + COMMON + RESOLUTIONS (R-A…R-E · มติ C1–C35 จาก REVIEW) · REVIEW 527 บรรทัด (ฐาน main 7411dfde) · TEMPLATE-ai · OWNER-QUESTIONS Q1–Q5/O1–O7 · KICKOFF ปรับให้ข้ามขั้นสร้าง pack · ถัดไป = เจ้าของสั่งเริ่ม (บอกจำนวนเลน) → KICKOFF §0/§1 → T0.0 baseline → T0.1 ∥ T0.2
