# WO C<x>.<y> — <ชื่อใบ>

> RUN "CRM v2" · worktree `/root/projects/shark-crm` · branch `session/crm-codex` · <วันที่> · builder: Codex
> สัญญา: `ledger/CRM-RUN.md` §2 C<x>.<y> · พิมพ์เขียว `docs/modules/20-crm-v2.md` §… · ภาพ `ledger/design-crm/NN-*.png`
> ข้อสอบ: `scripts/qc-crm-c<x>.<y>.mts` (N ข้อ · commit test: <hash> · **แก้หลัง commit หรือไม่: ไม่/ใช่ (ดู §5)**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ (ใหม่/แก้) | ทำอะไร |
|---|---|---|

## 2. migration / seed / backfill (ถ้ามี)
- migration: ชื่อ · additive ล้วน (ยืนยันว่าไม่มี DROP/ALTER ทำลาย) · รันบน QC แล้ว
- seed: เพิ่มอะไร · crm-qc-env เปลี่ยนอะไร
- backfill: สคริปต์ · dry-run ผล · รันจริงผล · idempotent ยืนยันอย่างไร

## 3. ผลข้อสอบ (วาง JSON_SUMMARY จริง)
- `qc-crm-c<x>.<y>`: `JSON_SUMMARY {...}`
- regressions: `qc-crm-c1.*` ก่อนหน้า · `qc-member-m1.2` · `qc-member-m1.4` · `qc-member-m1.11` · `qc-kanban-k3.3` — JSON_SUMMARY แต่ละชุด
- `pnpm typecheck` · `pnpm fitness` (มี env) · `env -u DATABASE_URL pnpm fitness` · build (ถ้ามี UI)

## 4. ภาพ (ถ้ามี UI)
| หน้า | mockup | ภาพจริง (path) | ผู้ใช้ | จุดต่างที่เห็นเอง |
|---|---|---|---|---|

## 5. ข้อแย้ง / มติทางเทคนิค (พร้อมหลักฐาน)
- ข้อสอบ id … : เชื่อว่าผิดเพราะ … (อ้างพิมพ์เขียว §… / โค้ด file:line) · ปล่อยแดง / แก้ (เฉพาะกรณีที่ handoff §6 อนุญาต · แนบ diff)
- สเปกขาด: … → ตัดสินใจ … (ย้อนกลับได้อย่างไร)

## 6. หนี้ / สิ่งที่ยังไม่ทำ
-

## 7. คืนสภาพ QC
- ข้อสอบ finally ลบอะไร · seed ยังตรงเฉลยหลังรัน (ยืนยันด้วย seed ซ้ำหรือนับ)
