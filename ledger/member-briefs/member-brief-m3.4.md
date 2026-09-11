คุณคือ builder ของ WO **M3.4** ระบบสมาชิก v2 (SHARK) — รีวิว: MemberReview · requestReview (journey/consumer หลัง booking.completed/pos.sale.paid · ส่ง LINE ลิงก์ LIFF token) · submit (ลูกค้า · rating 1–5 · รูป ≤ 3 · แต้มตาม settings · 1 ครั้ง/ref) · reply · hide · escalate rating ≤ N → `kanban.createCardFromExternal` (sourceType REVIEW · มอบหมายตาม role) · AI summary/draft (prompt อังกฤษ ไม่ส่ง PII · SHARK_AI_MOCK) · inbox UI ภาพ 23 + settings · แท็บรีวิวใน 360 (ภาพ 08 ขวา) · LIFF `/m/[slug]/review/[token]` · migration `member_v2_h` (`prisma/migrations/20261028000000_member_v2_h/`)

อ่านก่อนเริ่ม (ตามลำดับ):
1. `ledger/member-briefs/member-builder-common.md` — กติกาตายตัว + วิธีส่งมอบ · และ `ledger/member-briefs/member-brief-parallel-note.md` — **รอบนี้มี builder อีก 2 ตัว (M3.5 referrals · M3.6 notifications) ทำงานพร้อมกันบน worktree เดียว**
2. `ledger/MEMBER-RUN.md` §0.1 · §2 M3.4 · §4 (มติล่าสุด)
3. **ข้อสอบ `scripts/qc-member-m3.4.mts` = สัญญาฉบับเต็ม** (หัวไฟล์ = schema/API/deps/ไฟล์/testid/ป้าย) — อ่านทุกข้อ · SKIP guard บอกชื่อ migration/ไฟล์
4. `ledger/wo-notes/member-M3.3.md` (journeys: action REQUEST_REVIEW เรียก requestReview ของใบนี้ — ถ้า M3.3 ทำ stub ไว้ให้ต่อให้จริง) · M3.2 (ตัวส่ง LINE ผ่าน `chat/index.ts pushToContact` + consent) · M2.9 (LIFF `/m/[slug]/…` แบบแผน + customer-session) · M2.2 (ให้แต้ม) · kanban facade `createCardFromExternal` (สกิลอยู่ `.claude/skills/shark-kanban-api/`)
5. ภาพ `ledger/design-member/23-*.png` (inbox รีวิว) · `08-*.png` ขวา (แท็บรีวิวใน 360) · LIFF ตามภาพที่ oracle/harness ระบุ — UI ต้องตรงภาพ · `MemberIcon` · กริดยุบบนมือถือ

ขอบเขตไฟล์: `prisma/schema/member.prisma` + `kanban*.prisma` (เฉพาะ enum เพิ่มค่า · additive) + migration ด้านบน · `src/lib/modules/member/{reviews.ts, reviews-actions.ts, reviews-shared.ts}` · หน้า `src/app/app/sys/[id]/member/reviews/page.tsx` · `src/app/m/[slug]/review/[token]/page.tsx` (+ client component) · `src/components/member/Review*.tsx` · แท็บใน Member360 (Edit เฉพาะจุด) · Edit เฉพาะจุด: `member/index.ts` · `member/nav.ts` (reviews → ready) · `outbox-consumers.ts` · `automation/labels.ts` · `webhooks/labels.ts` · `core/scope.ts` · AI ผ่าน `src/lib/ai/*` แบบเดิม (ดู M3.1/M3.2 ว่าใช้ mock อย่างไร)

regressions ต้องผ่านเท่าเดิม: `qc-member-m3.3` · `m3.2` 27/27 · `m2.9` · `m2.2` · `qc-kanban-k2.x` ที่เกี่ยวการ์ดจากภายนอก (ใช้ QC env เท่านั้น) · fitness 2 โหมด · grep 'use client' ก่อนส่งมอบ

ส่งมอบตาม common.md (wo-notes `ledger/wo-notes/member-M3.4.md` · ตอบสั้น: ไฟล์ · ผลข้อสอบ x/y · ข้อค้าง+เหตุผล) · ห้าม build/commit/push · ห้ามรัน suite ที่ชี้ `.env` (ตอนนี้ทุก qc-*.mts มีด่านหยุดเองแล้ว — ถ้าเจอข้อความ "🔴 หยุด!" ให้ export env ของ .env.qc ตามที่มันบอก)
