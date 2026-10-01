# WO P0.3 · lane 3 — oracle `scripts/qc-pos-p1.1.mts` (single catalogue · P1.1a + P1.1b)

> RUN "POS ใหม่" · worktree `/root/projects/shark-pos-c` · branch `wip/pos-p0.3-catalog` · 1 ต.ค. 2569 · oracle writer: Claude Opus 5.5
> brief: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-P0.3.md` (Lane 3) + LANE-RULES + COMMON
> ไม่แตะ `src/` `prisma/` หรือสคริปต์เดิม — ส่งไฟล์ใหม่ 1 ไฟล์ + โน้ตนี้

## Checkpoint (อัปเดตทุกครั้งที่สถานะเปลี่ยน)
| # | ขั้น | สถานะ |
|---|---|---|
| 1 | อ่าน brief/สัญญา/โค้ดจริง | ✅ |
| 2 | เขียน `scripts/qc-pos-p1.1.mts` | ⏳ |
| 3 | A1 รันจริงผ่าน qc4 → SKIPPED exit 0 | ⏳ |
| 4 | A2 `--list` | ⏳ |
| 5 | A3 `QC_FORCE=1` → แดงถูกเหตุ ไม่ crash | ⏳ |
| 6 | A4 typecheck (ครั้งเดียว ท้ายงาน) | ⏳ |
| 7 | A5 row counts ก่อน/หลัง | ⏳ |
| 8 | commit + push | ⏳ |

ถ้าเริ่มใหม่: อ่านตารางนี้ → ดู `git log` ของ branch → ทำขั้นถัดไป
