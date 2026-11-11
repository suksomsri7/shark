# P6.1 — บันทึกซ้อม deploy (W31 ค่าปริยาย) · ผู้คุม A · 2026-10-24 03:28Z

## 1. สภาพแวดล้อม
- worktree ซ้อม /root/pos-deploy @ `ae244c58` (session/pos · prisma/ เท่ากับ tip ผลิตภัณฑ์ c39b71fd) · `status --porcelain` = 2 ไฟล์ (allowlist role rehearsal เฉพาะ local · ไม่ commit) · ไม่มี .env · `pnpm install --frozen-lockfile` exit 0 ผ่าน iso.sh
- ฐานซ้อม: Neon branch `wo-pos-p61-rehearsal` คัดลอกจาก production (endpoint ep-square-wave) สร้าง 03:2xZ · **ลบแล้ว 03:3xZ วันเดียวกัน** · ไฟล์ URL shred แล้ว · ไม่ส่งออก/ถ่ายข้อมูลลูกค้า · ล็อกเก็บเฉพาะเครื่อง `/root/pos-runs/rehearsal-p61/`
- allowlist: เพิ่ม `{ mark: "ep-square-wave", role: "rehearsal" }` ใน `scripts/verify-prod-pos.mts` + `scripts/lib/pos-prod-writer-guard.mts` ใน worktree ซ้อมเท่านั้น (ลบพร้อม worktree)

## 2. ผลตามลำดับ runbook (ทุกขั้นผ่าน iso.sh · เวลาทั้งชุด 03:25:37Z → 03:26:01Z)
| ขั้น | คำสั่ง | ผล |
|---|---|---|
| GO-7 | `psql "$MIG" -Atc 'SHOW lock_timeout'` | `5s` ✅ |
| GO-7 | prisma db execute DO-block ตรวจ lock_timeout ผ่าน URL option | exit 0 ✅ (Prisma ใช้ option จริง) |
| GO-6 | verify-prod-pos --counts (role rehearsal) | 6/6 ✅ · PosSale 17 แถว · PosSaleLine 25 · ตารางตัดสินทุกตัว < 100,000 ⇒ **ทาง ก (index ใน migration = no-op)** · K2 registerV2On = 0 ⇒ ไม่ต้อง GO-11b · K4 โต๊ะซ้ำ = 0 |
| GO-6 | ธุรกรรมค้าง > 5 วิ | 0 ✅ |
| GO-9 | migrate status ก่อน | 188 ไฟล์ · **37 ยังไม่ apply** (exit 1 = ปกติเมื่อค้าง) |
| GO-9 | migrate deploy (URL + lock_timeout 5s) | **Applying ×37 · "All migrations have been successfully applied." · exit 0** · ไฟล์แรก 20261120000000_pos_v2_a · ไฟล์สุดท้าย 20261220100000_pos_p61_hand_indexes |
| GO-10 | migrate status หลัง | "Database schema is up to date!" ✅ |
| §5.1 | 14 CREATE INDEX CONCURRENTLY IF NOT EXISTS (autocommit) | exit 0 (no-op ตามทาง ก) |
| §5.2 | นับโต๊ะ OPEN ซ้ำ = 0 → CREATE UNIQUE INDEX CONCURRENTLY one_open_session_per_table | exit 0 |
| §5.3 | ตรวจ 15 index | **15/15 exists=t valid=t** ✅ |
| GO-10 | verify-prod-pos เต็ม (prod-audit · role rehearsal) | **23/23 · FAIL 0 · WARN 2 (S1 สต็อกติดลบ · S9 งานรายชั่วโมงยังไม่เคยรัน = ปกติก่อน merge)** · exit 0 |
| GO-13 | verify --crons (ไม่แตะ DB · โหมดก่อน merge) | 4/4 · WARN R2/R3 (checkout crontab ยังเป็น main เดิม = ปกติก่อน merge) · ด้วย --post-merge จะ FAIL R2/R3 จนกว่า main จะมี POS |
| §8 | pos-shift-required-off --all --dry-run | role rehearsal · registerV2On 0 · todo 0 |
| §8 | pos-backfill-catalog --all --dry-run | tenants 10 · invItem 6 · menuItem 0 · shopProduct 0 · skipped 0 |
| §8 | pos-backfill-web-prices --all --dry-run | tenants 10 · scanned 0 · conflict 0 |

## 3. สิ่งที่ซ้อมแล้ว / ยังไม่ซ้อม
- ✅ ลำดับ CD-P61-R1 ขั้น 1–3 (ก่อนกด → deploy → ด่าน GO-10) + §5 ครบ + writer guard บทบาท rehearsal (ปฏิเสธถ้าไม่มี ALLOW · dry-run เท่านั้น)
- ❌ ไม่ได้ซ้อม: §4.4 ล้มกลางทาง/ภาคผนวก ก (ไม่มีไฟล์ล้ม) · ขั้น merge/Vercel (W32 เจ้าของ) · backfill จริง (เจ้าของสั่ง GO-16)
- ข้อสังเกตสำหรับ PR body: prod เล็กมาก (PosSale 17) ⇒ ทาง ก · เวลา deploy ทั้ง 37 ไฟล์ < 25 วินาที บน branch (prod จริงใกล้เคียง)

## 4. หลักฐาน (เครื่องนี้)
`/root/pos-runs/rehearsal-p61/{SUMMARY.txt,go7-*.log,go6-*.log,go9-*.log,go10-*.log,s5*-*.log,go13-crons.log,s8-*.log}`
