# WO P1.1a — แคตตาล็อกเดียว: ตาราง + backfill (ไม่มี UI · จอเดิมไม่เปลี่ยนพฤติกรรม)

> RUN "POS ใหม่" · worktree `/root/projects/shark-pos-p11` · branch `wip/pos-p1.1a` (base `origin/main` 04d2ade9 + P0.3 oracle commits) · 1 ต.ค. 2569 · builder: Claude Opus 5.5
> สัญญา: `ledger/pos-briefs/pos-brief-P1.1a.md` (R1–R8 + addendum 12:20 UTC) · `ledger/wo-notes/pos-P0.3-catalog.md` "Ratified names" · LANE-RULES
> ข้อสอบ: `scripts/qc-pos-p1.1.mts` (82 ข้อ · P1.1a 54 · P1.1b 28) — read-only
> ฐาน QC: **QC4 เท่านั้น** (`ep-frosty-lab`)

## 0. Checkpoint (อัปเดตทุกขั้น — ผู้รับช่วงเริ่มจากตรงนี้)
| # | ขั้น | สถานะ |
|---|---|---|
| 0 | git clean · `migrate status` QC4 (read-only) | ✅ 147 migrations · "Database schema is up to date!" · log `.qc-shots/pos/p1.1a/migrate-status-before.log` |
| 1 | A4 regression ก่อนแก้ (17 ชุด) | ✅ เขียวทั้งหมด · logs `.qc-shots/pos/p1.1a/before/` |
| 2 | schema + migration SQL → QC4 → generate | ✅ `20261120000000_pos_v2_a` deploy QC4 · generate |
| 3 | catalog.ts + facade + permission + scope | ✅ |
| 4 | backfill script | ✅ |
| 5 | oracle P1.1a เขียว | ✅ run1 exit 0 · ผ่าน 54/54 · S2 ข้าม 28 (guard) · log `.qc-shots/pos/p1.1a/oracle-run1.log` |
| 6 | A2/A3/A4-after/A5/A7 | ☐ |
| 7 | typecheck | ☐ |
| 8 | notes · commit · push | ☐ |

### เบี่ยงจากคำสั่ง (ต้องให้ผู้คุมงานรับทราบ)
- `scripts/qc-prisma.sh` ด่าน host รับเฉพาะ QC1–3 (`ep-plain-art|ep-cool-shadow|ep-weathered-river`) → กับ `.env.qc` (=QC4) ได้ `exit 4 "URL ไม่ใช่ branch QC"`. ไฟล์นี้ไม่อยู่ในรายการที่ใบนี้เป็นเจ้าของ ⇒ ไม่แก้ · ใช้ `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec prisma <cmd>` แทน (qc4.sh ตั้ง DIRECT_URL/DATABASE_URL จาก `.env.qc4` + ด่าน host `ep-frosty-lab` + กัน prod/QC1-3 — กลไกเดียวกับ qc-prisma; ไม่มี `.env` ในเวิร์กทรีนี้ ⇒ prisma.config.ts ไม่โหลด prod) · ใช้เฉพาะ `migrate status` / `migrate diff --script` / `migrate deploy` / `generate` (ไม่ใช้ dev/reset/db push/resolve)

## A4 ก่อนแก้ (QC4 · `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<s>.mts`)
| ชุด | exit · สรุป |
|---|---|
| qc-pos-register | 0 · ผ่าน 42/42 |
| qc-pos-account | 0 · ผ่าน 16/16 |
| qc-pos-products | 0 · ผ่าน 24/24 |
| qc-pos-coupon | 0 · ผ่าน 8/8 |
| qc-pos-closeday | 0 · ผ่าน 22/22 |
| qc-pos-inventory | 0 · ผ่าน 25/25 |
| qc-pos-p0.2 | 0 · ผ่าน 55/55 · SKIP 1 (P0.2-S6.7) |
| qc-restaurant-money | 0 · ผ่าน 6/6 |
| qc-restaurant-void | 0 · ผ่าน 11/11 |
| qc-shop-refund | 0 · ผ่าน 12/12 |
| qc-account-cpa | 0 · ผ่าน 107/107 |
| qc-restaurant | 0 · 🎉 Restaurant dine-in loop ผ่าน |
| qc-restaurant-pay | 0 · ผ่าน 19/19 |
| qc-shop | 0 · ผ่าน 15/15 |
| qc-inventory | 0 · ผ่าน 12/12 |
| qc-inventory-item | 0 · ผ่าน 11/11 |
| qc-inventory-account | 0 · ผ่าน 23/23 |
