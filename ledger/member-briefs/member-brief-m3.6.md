คุณคือ builder ของ WO **M3.6** ระบบสมาชิก v2 (SHARK) — การแจ้งเตือนสมาชิก: เทมเพลต 8 เหตุการณ์ × 4 ช่องทาง (LINE/อีเมล/SMS/push) · ตัวแปร · send (เคารพยินยอมต่อช่องทาง · transactional ยกเว้น · quiet hours 21:00–08:00 เลื่อนเช้า · รวมรายวัน digest) · SMS ไม่มี provider = ปิด · stats · UI ภาพ 30 `/member/settings/notifications` + ทดสอบส่งหาตัวเอง · migration `member_v2_h2` (`prisma/migrations/20261029000000_member_v2_h2/` · ตาราง MemberNotification — Fable ตัดสินแล้ว ดู oracle)

อ่านก่อนเริ่ม (ตามลำดับ):
1. `ledger/member-briefs/member-builder-common.md` — กติกาตายตัว + วิธีส่งมอบ · และ `ledger/member-briefs/member-brief-parallel-note.md` — **รอบนี้มี builder อีก 2 ตัว (M3.4 reviews มี migration `member_v2_h` · M3.5 referrals) ทำงานพร้อมกันบน worktree เดียว**
2. `ledger/MEMBER-RUN.md` §0.1 · §2 M3.6 · §4 (มติล่าสุด)
3. **ข้อสอบ `scripts/qc-member-m3.6.mts` = สัญญาฉบับเต็ม** (หัวไฟล์ = schema/ทะเบียน NOTIF_EVENTS/API/deps/ไฟล์/testid/ป้าย) — อ่านทุกข้อ · SKIP guard บอกชื่อ migration/ไฟล์ · ข้อสอบฉีด deps ตัวส่ง ⇒ ตัวส่งจริงต้องเป็นค่าปริยายที่แทนที่ได้
4. `ledger/wo-notes/member-M3.2.md` (**ตัวส่ง 4 ช่องทาง + consent มีแล้ว — ใช้ซ้ำ ห้ามเขียนใหม่**: `chat/index.ts pushToContact` · `core/email` · `core/sms.ts` provider null · `MemberPushDevice`/`core/push.ts`) · M2.2 (event point.*) · M2.3/M2.4/M2.5 (stamp/tier/voucher events) · `outbox-consumers.ts` (consumer แบบ withX)
5. ภาพ `ledger/design-member/30-*.png` — UI ต้องตรงภาพ · `MemberIcon` · กริดยุบบนมือถือ

ขอบเขตไฟล์: `prisma/schema/member.prisma` (additive · เฉพาะ MemberNotification) + migration ด้านบน · `src/lib/modules/member/{notifications.ts, notification-events.ts, notifications-actions.ts, notifications-shared.ts}` · หน้า `src/app/app/sys/[id]/member/settings/notifications/page.tsx` · `src/components/member/Notification*.tsx` · Edit เฉพาะจุด: `member/index.ts` · `member/nav.ts` · `outbox-consumers.ts` · `platform/cron.ts` (digest รายวัน + ส่งที่เลื่อนจาก quiet hours) · `core/scope.ts`

regressions ต้องผ่านเท่าเดิม: `qc-member-m3.2` 27/27 · `m2.2` · `m2.4` · `m2.5` 26/26 · `m1.12` 14/14 · fitness 2 โหมด · grep 'use client' ก่อนส่งมอบ

ส่งมอบตาม common.md (wo-notes `ledger/wo-notes/member-M3.6.md` · ตอบสั้น: ไฟล์ · ผลข้อสอบ x/y · ข้อค้าง+เหตุผล) · ห้าม build/commit/push · ห้ามรัน suite ที่ชี้ `.env` (ทุก qc-*.mts มีด่านหยุดเองแล้ว — เจอ "🔴 หยุด!" ให้ export env ของ .env.qc ตามที่มันบอก)
