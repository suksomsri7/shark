# WO P0.1 — เครื่องมือ QC ของ POS (checkpoint · กำลังทำ)

> RUN "POS ใหม่" · worktree `/root/projects/shark-pos` (เลน 1) · branch `session/pos` · 1 ต.ค. 2569 · builder: Claude Opus 5.5
> ใบสั่ง `ledger/pos-briefs/pos-brief-P0.1.md` + LANE-RULES · ฐาน QC4 เท่านั้น

## สถานะ (อัปเดตทุกครั้งที่ของชิ้นหนึ่งเสร็จ)
| # | ของส่งมอบ | สถานะ |
|---|---|---|
| 0 | fitness ก่อนเริ่ม → `.qc-shots/pos/p0.1/fitness-before.txt` (qc4 env) + `fitness-before-noenv.txt` | ✅ 33/33 ทั้งสองโหมด · ไม่มีแดงเดิม |
| 6 | `ledger/wo-notes/TEMPLATE-pos.md` | ✅ |
| 1 | `scripts/pos-qc-env.mts` | ✅ |
| 2 | `scripts/seed-pos-qc.mts` + `scripts/pos-expected.json` | ✅ รัน 4 รอบบน QC4 · SEED_SUMMARY md5 เท่ากันทุกรอบ (ccbdc3dd…) · ลายนิ้วมือร้านอื่น 36 ค่าไม่เปลี่ยน · qc-pos-* 6 ชุดก่อน/หลัง seed เขียวเท่าเดิม (16/22/8/25/24/42) — log ใน `.qc-shots/pos/p0.1/` |
| 3 | `scripts/visual-pos.mts` | ⏳ |
| 4 | `scripts/pos-ui-inventory.json` | ⏳ |
| 5 | `scripts/fitness-pos.mts` + hook ใน fitness.mts + `scripts/pos-sale-contract.json` | ⏳ |
| 7 | notes ฉบับเต็ม | ⏳ |

## ถัดไป
ทำตามลำดับตาราง · commit `pos P0.1: …` หลังแต่ละชิ้นที่เขียว (ไม่ push)
