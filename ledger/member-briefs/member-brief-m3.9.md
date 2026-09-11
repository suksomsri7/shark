คุณคือ builder ของ WO **M3.9** ระบบสมาชิก v2 (SHARK) — เทมเพลตกิจการ 16 ชุด + ทั่วไป (D7 · พิมพ์เขียว §10): `member/templates/` 17 ไฟล์ข้อมูลล้วน (ส่วน/ฟิลด์ · ระดับ · สแตมป์ · journey) · `templates-service.ts` (validateTemplate · previewTemplate · applyTemplate ทุกส่วน ไม่ทับของเดิม · idempotent) · FieldDesigner (M1.3) เพิ่มแผงตัวอย่าง + เลือกส่วนที่นำเข้า + ตัวอย่างมือถือ (ภาพ 03) · **ไม่มี migration**

อ่านก่อนเริ่ม (ตามลำดับ):
1. `ledger/member-briefs/member-builder-common.md` — กติกาตายตัว + วิธีส่งมอบ · และ `ledger/member-briefs/member-brief-parallel-note.md` — **รอบนี้มี builder อีก 1 ตัว (M3.8 รายงาน) ทำงานพร้อมกันบน worktree เดียว**
2. `ledger/MEMBER-RUN.md` §0.1 · §2 M3.9 · §4 (มติล่าสุด) · พิมพ์เขียว `docs/modules/06-member-v2.md` §10 (ตาราง 16 แถว)
3. **ข้อสอบ `scripts/qc-member-m3.9.mts` = สัญญาฉบับเต็ม** (หัวไฟล์ = 17 key ตามลำดับ · รูปร่าง MemberTemplate · กติกาต่อชุด · validate/preview/apply · testid) — อ่านทุกข้อ
4. `ledger/wo-notes/member-M1.2.md` (applyTemplate เดิม · onlyFieldKeys · รูปแบบเดิม `applyTemplate(ctx, key)` ต้องยังใช้ได้) · `member-M1.3.md` (FieldDesigner) · `member-M1.9.md` (tiers.createTierDef + benefits) · `member-M2.3.md` (stamp createCard · ruleKind/rewardKind) · `member-M3.3.md` (JOURNEY_PRESETS · JOURNEY_TRIGGERS · createJourney)
5. ภาพ `ledger/design-member/03-field-designer.png` (kbar เทมเพลต + ตัวอย่างมือถือ) — `MemberIcon` · ห้าม hex · มือถือไม่ล้น

ขอบเขตไฟล์: `src/lib/modules/member/templates/*.ts` (17 ไฟล์ + index.ts · **ห้าม import prisma/facade ในโฟลเดอร์นี้** — ข้อมูลล้วน) · `src/lib/modules/member/templates-service.ts` · Edit เฉพาะจุด: `member/fields.ts#applyTemplate` (ขยาย parts) · `member/index.ts` · `src/components/member/FieldDesigner.tsx` + ไฟล์ใหม่ `src/components/member/TemplatePreview*.tsx` · server action ใน `fields-actions.ts` (Edit เฉพาะจุด · assertCan)
- เทมเพลตดำน้ำ/ทั่วไปเดิม (M1.2) ย้ายเข้ารูปใหม่ได้ แต่ key ส่วน/ฟิลด์เดิมต้องคงเดิม (seed QC และ oracle M1.2/M1.3 อ้าง)

regressions ต้องผ่านเท่าเดิม: `qc-member-m1.2` 27/27 · `m1.3` 14/14 · `m1.9` · `m2.3` · `m3.3` · fitness 2 โหมด · grep 'use client' ก่อนส่งมอบ (FieldDesigner เป็น client — แผงตัวอย่างต้องได้ข้อมูลจาก server action ไม่ใช่ import templates-service)

ส่งมอบตาม common.md (wo-notes `ledger/wo-notes/member-M3.9.md` · ตอบสั้น: ไฟล์ · ผลข้อสอบ x/y · ข้อค้าง+เหตุผล) · ห้าม build/commit/push · ห้ามรัน suite ที่ชี้ `.env` (ทุก qc-*.mts มีด่านหยุดเองแล้ว — เจอ "🔴 หยุด!" ให้ export env ของ `.env.qc`)
