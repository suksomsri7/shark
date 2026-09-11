คุณคือ builder ของ WO **M3.8** ระบบสมาชิก v2 (SHARK) — รายงานสมาชิก: `reports.ts` 7 ชุด (overview · rfm (ควินไทล์ + กติกาจัดกลุ่มตายตัวในหัวข้อสอบ) · tiers · points (หนี้สินแต้ม = outstanding × burnRateSatang) · promotions (ROI + holdout uplift จาก journeyStats/campaignStats) · sources · cohort) · exportCsv (BOM + header ไทย) · ตั้งเวลาส่งอีเมล (settings.member.reports.schedule + cron `memberReportsEmail` รายชั่วโมง) · หน้า `/member/reports?tab=` ภาพ 25 · **ไม่มี migration**

อ่านก่อนเริ่ม (ตามลำดับ):
1. `ledger/member-briefs/member-builder-common.md` — กติกาตายตัว + วิธีส่งมอบ · และ `ledger/member-briefs/member-brief-parallel-note.md` — **รอบนี้มี builder อีก 1 ตัว (M3.9 เทมเพลตกิจการ) ทำงานพร้อมกันบน worktree เดียว**
2. `ledger/MEMBER-RUN.md` §0.1 · §2 M3.8 · §4 (มติล่าสุด)
3. **ข้อสอบ `scripts/qc-member-m3.8.mts` = สัญญาฉบับเต็ม** (หัวไฟล์ = รูปคืนค่าทุกฟังก์ชัน · สูตร · { now? } ทำให้ผลนิ่ง · testid) — อ่านทุกข้อ · ตัวเลขตรวจกับ seed/DB สด
4. `ledger/wo-notes/member-M3.3.md` (journeyStats · holdout) · `member-M3.2.md` (campaignStats สูตร ROI) · `member-M1.8.md` (sourcesReport) · `member-M2.1.md` (PointLedger/PointSettings · burnRateSatang) · `member-M1.9.md` (tier defs) · อีเมลผ่านตัวส่งเดิม (M3.2 · Resend · ข้อสอบฉีด deps.email)
5. ภาพ `ledger/design-member/25-reports.png` — แท็บ 7 · KPI 6 · กราฟแท่ง div ล้วน (ห้ามเพิ่มไลบรารีกราฟ) · RFM 3×3 สีเฉด token (ห้าม hex) · `MemberIcon` · กริด `grid-cols-1 md:grid-cols-…` + `min-w-0`

ขอบเขตไฟล์: `src/lib/modules/member/{reports.ts, reports-actions.ts, reports-shared.ts}` · หน้า `src/app/app/sys/[id]/member/reports/page.tsx` · `src/components/member/Report*.tsx` · Edit เฉพาะจุด: `member/index.ts` · `member/nav.ts` (reports → ready) · `platform/cron.ts` (step `memberReportsEmail`)
- ใช้ aggregate/groupBy · ห้าม N+1 · เดือน/วัน = เวลาไทย (ระวังกับดัก getDay/getMonth บน UTC — ใช้ helper วันที่ไทยที่มีอยู่)

regressions ต้องผ่านเท่าเดิม: `qc-member-m3.3` · `m3.2` · `m1.8` · `m2.1` · `m3.1` · fitness 2 โหมด · grep 'use client' ก่อนส่งมอบ

ส่งมอบตาม common.md (wo-notes `ledger/wo-notes/member-M3.8.md` · ตอบสั้น: ไฟล์ · ผลข้อสอบ x/y · ข้อค้าง+เหตุผล) · ห้าม build/commit/push · ห้ามรัน suite ที่ชี้ `.env` (ทุก qc-*.mts มีด่านหยุดเองแล้ว — เจอ "🔴 หยุด!" ให้ export env ของ `.env.qc`)
