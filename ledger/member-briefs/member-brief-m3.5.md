คุณคือ builder ของ WO **M3.5** ระบบสมาชิก v2 (SHARK) — แนะนำเพื่อน: ReferralProgram (D6 · ร้านตั้งค่าได้) · โค้ด/ลิงก์/QR ต่อสมาชิก · attach ตอนสมัคร (source REFERRAL) · consumer member.created / pos.sale.paid → convert (SIGNUP | FIRST_PURCHASE ≥ min) · รางวัลสองฝั่ง (แต้ม/voucher ตาม program · idempotent) · กันโกง (เบอร์/device fingerprint) · reject · cap รายเดือน · leaderboard · UI ภาพ 24 + การ์ดใน 360 (ภาพ 08 ขวา) · LIFF `/m/[slug]/referral` (แชร์) · `/r/[code]` (ทางเข้าเพื่อน → LIFF join ?ref=) · **ไม่มี migration ใหม่** (ตาราง ReferralProgram/Referral มีตั้งแต่ M1.1)

อ่านก่อนเริ่ม (ตามลำดับ):
1. `ledger/member-briefs/member-builder-common.md` — กติกาตายตัว + วิธีส่งมอบ · และ `ledger/member-briefs/member-brief-parallel-note.md` — **รอบนี้มี builder อีก 2 ตัว (M3.4 reviews · M3.6 notifications) ทำงานพร้อมกันบน worktree เดียว** (สองใบนั้นมี migration · คุณไม่มี — ห้ามแตะ prisma/schema)
2. `ledger/MEMBER-RUN.md` §0.1 · §2 M3.5 · §4 (มติล่าสุด)
3. **ข้อสอบ `scripts/qc-member-m3.5.mts` = สัญญาฉบับเต็ม** (หัวไฟล์ = API/กติกา/ไฟล์/testid/ป้าย) — อ่านทุกข้อ · SKIP guard บอกชื่อไฟล์
4. `ledger/wo-notes/member-M1.4.md` (Customer.referralCode · source REFERRAL) · M2.2 (ให้แต้ม) · M2.5 (ออก voucher origin REFERRAL idempotent) · M2.9 (LIFF `/m/[slug]/…` + customer-session) · M3.2 (ตัวส่ง LINE) · `src/lib/modules/member/service.ts createMember` (payload member.created มี referrerId/sourceDetail อย่างไร)
5. ภาพ `ledger/design-member/24-*.png` · `08-*.png` ขวา · LIFF ตามที่ oracle/harness ระบุ — UI ต้องตรงภาพ · `MemberIcon` · กริดยุบบนมือถือ

ขอบเขตไฟล์: `src/lib/modules/member/{referrals.ts, referrals-actions.ts, referrals-shared.ts}` · หน้า `src/app/app/sys/[id]/member/referrals/page.tsx` · `src/app/m/[slug]/referral/page.tsx` · `src/app/r/[code]/route.ts` (หรือ page) · `src/components/member/Referral*.tsx` · การ์ดใน Member360 (Edit เฉพาะจุด) · Edit เฉพาะจุด: `member/index.ts` · `member/nav.ts` (referrals → ready) · `outbox-consumers.ts` · `automation/labels.ts` · `webhooks/labels.ts`

regressions ต้องผ่านเท่าเดิม: `qc-member-m1.4` · `m2.2` · `m2.5` 26/26 · `m2.9` · `m3.2` 27/27 · fitness 2 โหมด · grep 'use client' ก่อนส่งมอบ

ส่งมอบตาม common.md (wo-notes `ledger/wo-notes/member-M3.5.md` · ตอบสั้น: ไฟล์ · ผลข้อสอบ x/y · ข้อค้าง+เหตุผล) · ห้าม build/commit/push · ห้ามรัน suite ที่ชี้ `.env` (ทุก qc-*.mts มีด่านหยุดเองแล้ว — เจอ "🔴 หยุด!" ให้ export env ของ .env.qc ตามที่มันบอก)
