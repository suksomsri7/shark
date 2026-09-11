# HANDOVER — ส่งต่อบทบาท "ผู้คุมงาน" RUN ระบบสมาชิก v2 จาก Fable 5.1 → Opus 5 (11 ก.ย. 2569 05:25 UTC)

> เหตุผล: Fable 5.1 ใกล้ถึง weekly limit · เจ้าของสั่งหยุด-บันทึก-ส่งต่อให้ Opus 5 คุมงานจนจบ · เมื่อ limit reset Fable จะกลับมา **ตรวจสอบ** (audit) ไม่ใช่ทำซ้ำ
> Opus อ่านไฟล์นี้ก่อน แล้วค่อยอ่าน `ledger/MEMBER-RUN.md` §0.1 (ขั้นตอนต่อใบ) §3.1 (ตารางสถานะ) §4 (บันทึกเหตุการณ์/มติ)

## 1. สถานะ ณ จุดส่งต่อ
- **24/34 ใบ ≈ 71%** · M1 12/12 ✅ · M2 10/10 ✅ (HANDOVER-2026-09-11-MEMBER-M2.md · qc:all 318/319) · M3.1 ✅ `cb1d397` · M3.2 ✅ `22d3ff2`
- main ล่าสุด = commit ของไฟล์นี้ (ดู `git log -1`) · Vercel READY `dbafd3a` · prod `_prisma_migrations` มี member_v2 a b b2 b3 c f d c2 d2 e f2 f2_identity_fk g **g2** (14 ใบ)
- worktree `/root/projects/shark-member` branch `session/member` · push main ทุกใบ (fetch + rebase origin/main ก่อน push เสมอ — session CRM push ledger คู่ขนาน)
- **M3.3 journeys — builder ถูกหยุดกลางทาง (ทำไป ~8 นาที)** ไฟล์ค้างบนดิสก์ ไม่ได้ commit:
  `prisma/schema/automation.prisma` (แก้) · `prisma/migrations/20261027000000_member_v2_g3/` · `src/lib/modules/member/journey-presets.ts` · `src/lib/modules/member/journeys-shared.ts`
  → ตรวจว่า migration g3 ถูก deploy ลง QC DB แล้วหรือยัง (`prisma migrate status` ด้วย env จาก .env.qc) · spawn builder M3.3 ใหม่ด้วย brief เดิม + บอกว่า "มีไฟล์ค้างจาก builder ก่อนหน้า อ่านและใช้ต่อได้ แต่ต้องตรวจกับข้อสอบ"

## 2. ลำดับงานที่เหลือ (10 ใบ + ปิดเฟส)
| ลำดับ | ใบ | builder | brief | migration |
|---|---|---|---|---|
| 1 | M3.3 journeys | Opus | `ledger/member-briefs/member-brief-m3.3.md` | `member_v2_g3` (20261027) |
| 2 (ขนาน 3 ตัว) | M3.4 reviews | Opus | `member-brief-m3.4.md` | `member_v2_h` (20261028) |
|   | M3.5 referrals | Opus | `member-brief-m3.5.md` | — |
|   | M3.6 notifications | Sonnet | `member-brief-m3.6.md` | `member_v2_h2` (20261029) |
| 3 | M3.7 history | Opus | เขียนใหม่ตามแบบ m3.x (oracle = สัญญา) | — |
| 4 (ขนาน) | M3.8 reports ∥ M3.9 templates | Opus ∥ Sonnet | เขียนใหม่ | — |
| 5 | M3.10 REST/AI ชุดสาม | Opus | เขียนใหม่ | — |
| 6 | M3.11 LIFF join + mobile | Opus | เขียนใหม่ | — |
| 7 | M3.F ปิดเฟส | ผู้คุมงานเอง | ดู §5 | — |
- ข้อสอบ (oracle) **เขียนครบทุกใบแล้ว** `scripts/qc-member-m3.3.mts` … `m3.11.mts` + spec ภาพ/TMP ใน `scripts/visual-member.mts` — หัวไฟล์ข้อสอบคือสัญญาฉบับเต็ม builder ต้องอ่าน
- brief ทุกใบต้องแนบ `ledger/member-briefs/member-builder-common.md` (กติกา) และเมื่อขนานแนบ `member-brief-parallel-note.md` · ส่ง prompt ให้ builder โดย **วางเนื้อหาไฟล์ brief ลงใน prompt ตรง ๆ** (ห้ามใช้ `$(cat …)` — ไม่ถูกแทนที่)

## 3. กติกาของผู้คุมงาน (Opus ต้องทำเหมือน Fable · ข้อที่ต่างจากงานทั่วไป)
1. **ห้ามลดความเข้มข้อสอบ** — ถ้าเชื่อว่าข้อสอบผิด (builder แย้งมีหลักฐาน) แก้ได้ แต่ต้องบันทึกใน MEMBER-RUN §4 ขึ้นต้นบรรทัดด้วย **`ORACLE-EDIT Mx.y-Sn.n:`** + เหตุผล + หลักฐาน — Fable จะ audit ทุกบรรทัดนี้ตอนกลับมา · ห้ามแก้เพื่อให้ผ่านโดยไม่มีเหตุผลเชิงสัญญา
2. **ด่าน parity ผ่านด้วยตา** — เปิดภาพใน `.qc-shots/member/<wo>/` เทียบ `ledger/design-member/NN-*.png` ทุกหน้า desktop+mobile · เขียน "### ตรวจภาพ" ใน wo-notes ระบุจุดที่ตรง/ต่าง แล้วปิดด้วยบรรทัด `- **PARITY: ผ่าน**` (regex ของข้อสอบจับเฉพาะรูปแบบนี้) · ต่างชัด → ตีกลับ builder (SendMessage ตัวเดิม) ไม่ผ่านให้เอง
3. **มติธุรกิจถามเจ้าของทาง Telegram (`tg`) เท่านั้น** · เรื่องเทคนิคตัดสินเองแล้วบันทึก §4 ("ข้อตัดสิน")
4. **งานหนักทีละ 1** (`bash scripts/with-gate-lock.sh …`) · QC server `bash scripts/acc-v2-serve.sh` **ห้ามห่อ gate lock** และ `stop` ก่อนทุกครั้ง (ไม่งั้นข้าม build) · build+ถ่ายภาพรันแบบ `setsid nohup script.sh & disown` เขียน log แล้วรอด้วย until-loop (tool timeout 10 นาที · container เคยรีสตาร์ทกลาง build)
5. **qc:all เต็มชุดรันตอนไม่มี builder ทำงานเท่านั้น** (`pnpm qc:all` + env จาก .env.qc ผ่าน grep|cut · detached) — 318/319 คือฐาน (ตัวเดียวที่แดง = k3.3 ภาพอยู่ worktree อื่น)
6. prod: `.env` = production · ห้าม `source .env` (ค่ามี `&`) · ตรวจ migration บน prod ด้วย `node scripts/prodmig.cjs "$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')"` (อ่านอย่างเดียว) · backfill prod ต้อง `ALLOW_PROD_BACKFILL=1 … --dry-run` ก่อน · ทุก `qc-*.mts` มีด่าน `loadLegacyQcEnv` หยุดเองถ้าชี้ prod (ตั้งแต่ `dbafd3a`)
7. รายงาน Telegram ทุกใบ: ฟีเจอร์ที่ผู้ใช้ได้ (ภาษาคน) + บั๊กที่จับได้ + % (n/34)
8. Vercel: poll `https://api.vercel.com/v6/deployments?teamId=team_73xWxzvBBScACJuG4TXet6Uw&app=shark&target=production&limit=3` (token ใน memory `reference_vercel_credentials`) — เทียบ commit sha ล่าสุด ไม่ใช่ตัวแรกเสมอ (push ซ้อนกันได้)
9. บทเรียนที่ต้องกันซ้ำ: `"use server"` ห้าม export type (หน้า 500) · `'use client'` ห้าม import โมดูลถึง prisma (build พัง) → `*-shared.ts` · builder เขียน "PARITY: ผ่าน" ในโน้ตเองไม่ได้ · seed: gold ทุกคนอยู่กะตะ · `source` ของ createMember ไม่ใช่ "STAFF" · reseed m1.1 ห้ามรันกลาง qc:all · harness รายงาน `overflowEl` เมื่อมือถือล้น (ดู summary-<user>.json)

## 4. หนี้ที่ค้าง (ทำใน M3.F หรือใบที่เกี่ยว)
- `qc-pos-register` MEM-2 คาด pointEarned>0 ทันที (แต้มย้ายไป consumer ตั้งแต่ M2.8) → แก้ suite
- UI เล็ก: ปุ่มบันทึกร่าง/ส่งแคมเปญอยู่ใต้หัวเรื่อง (M3.2) · ชิปมือถือ nowrap (M2.4) · ชิปบริการชื่อซ้ำต่อชื่อสาขา (M2.3/M2.5)
- รอเจ้าของตั้ง env: LINE OA · Resend · SMS provider · LINE_LIFF_ID · backfill prod ต่อ tenant (dry-run ก่อน)
- 3 ชุดเก่า (`qc-chat-member-autolink` `qc-point` `qc-member-tier`) ตอนนี้ผ่านด่าน loadLegacyQcEnv แล้ว แต่ยังไม่ได้ย้ายไป loadQcEnv เต็มรูป
- brief.spent12m อ่าน cache ที่ cron ยังไม่ refresh (M3.9)

## 5. M3.F (ปิดเฟส) — ผู้คุมงานทำเอง
qc:all เต็มรอบสะอาด → prod verify migration a–h2 → backfill prod ต่อ tenant dry-run → เขียน `HANDOVER-2026-09-xx-MEMBER-M3.md` (แบบเดียวกับ M2) → Telegram สรุปทั้งระบบ 34/34 → memory `project_shark_member_run.md`

## 6. รายการตรวจสำหรับ Fable เมื่อกลับมา (audit ไม่ทำซ้ำ)
1. `git log --oneline <hash ไฟล์นี้>..main` — ทุกใบมี commit + ledger row + hash ตรง
2. `git diff <hash ไฟล์นี้>..main -- scripts/qc-member-*.mts scripts/visual-member.mts scripts/qc-all.mts scripts/seed-member-qc.mts scripts/fitness.mts scripts/member-expected.json` — **ทุก hunk ต้องมีบรรทัด `ORACLE-EDIT` ใน §4 อธิบาย** · ไม่มี = ผิดกติกา
3. รัน `pnpm qc:all` รอบสะอาดเอง 1 รอบ (ไม่เชื่อตัวเลขในโน้ต) + สุ่ม `qc-member-m3.x` 3 ใบ
4. เปิดภาพ `.qc-shots/member/3.3…3.11` เทียบ mockup เอง (โดยเฉพาะหน้าที่มี "PARITY: ผ่าน" แต่ไม่มีคำอธิบายจุดต่าง)
5. `node scripts/prodmig.cjs …` → มี g3 h h2 · ตรวจ orphan/backfill log ใน §4
6. ตรวจว่า builder ไม่เคยรัน suite บน prod (grep ledger "ละเมิด") และ `.env` ไม่ถูกแก้ (`git log -p -- .env` ต้องว่าง — ไฟล์ไม่อยู่ใน git อยู่แล้ว ดู mtime)
