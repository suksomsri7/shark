# WO P0.2 — ทะเบียน op POS (โครง)

> RUN "POS" · lane 2 · worktree `/root/projects/shark-pos-b` · branch `wip/pos-p0.2` · 1 ต.ค. 2569 · builder: Opus 5.5
> ใบสั่ง `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-P0.2.md` (+ LANE-RULES + COMMON)

## 0. CHECKPOINT (ผู้รับช่วงอ่านตรงนี้ก่อน)
- [x] อ่าน brief + exemplar ครบ
- [x] baseline fitness (มี env QC4 / ไม่มี env) → `.qc-shots/pos/p0.2/fitness-before*.txt` = 33/33 ทั้งคู่
- [x] baseline oracle POS 6 ชุดบน QC4 (ก่อนแก้) — register 42/42 · account 16/16 · products 24/24 · coupon 8/8 · closeday 22/22 · inventory 25/25
- [ ] เขียน `src/lib/modules/pos/api/{op.ts,registry.ts,ops/*.ts}`
- [ ] `scripts/qc-pos-p0.2.mts`
- [ ] safety commit
- [ ] fitness after (2 แบบ) · oracle 6 ชุด after · typecheck (gate lock) · commit + push

## 1. ไฟล์ที่แตะ
(เติมตอนจบ)
