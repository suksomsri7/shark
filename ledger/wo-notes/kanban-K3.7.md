# K3.7 — การ์ดสะท้อน (Mirror) · โน้ต (builder Sonnet ถูก container รีสตาร์ทระหว่าง build 10 ก.ย. ~06:40 · Fable รับจบเอง)

> สถานะ: **oracle 14/14 · tsc 0 · fitness 23/23 · regressions k1.1/k1.4/k1.5/k1.6/k1.7/k1.8/k1.9/k1.13/k2.1/k2.6/k3.1/k3.5 เขียว · ภาพ 5 ใบ Fable ดูแล้ว** · migration `kanban_v2_t` (KanbanCard.mirrorOfId + index)

## ไฟล์ที่แตะ (builder)
- ใหม่ `src/lib/modules/kanban/mirror.ts` (`mirrorCard`/`resolveMirror`/`listMirrors` · EDITOR ทั้ง 2 บอร์ด · ห้ามซ้อน · บอร์ดเดิม throw · cardNo ของบอร์ดปลายทาง D14 · sync title) · `src/components/kanban/MirrorPicker.tsx`
- แก้ `cards.ts` `checklists.ts` `comments.ts` `attachments.ts` `labels.ts` `fields.ts` (resolve ไปต้นฉบับ · ต้นฉบับ ARCHIVED → throw ไทย) · `service.ts`/`types.ts` (DTO `mirror`/`mirrors`) · `api/ops/cards.ts` (op `cards.mirror` → REST 88) · `actions.ts` · `Card.tsx` (ชิป "สะท้อนจาก {บอร์ด} #n" ไอคอน SVG) · `CardBack.tsx` (แถบบน "นี่คือการ์ดสะท้อน — แก้ที่นี่ = แก้ต้นฉบับ" + ลิงก์ไปต้นฉบับ · ต้นฉบับแสดง "สะท้อนอยู่ที่ …") · `limits.ts` (mirrorsPerCard 5) · `visual-kanban.mts` spec "3.7"

## ภาพ (`.qc-shots/kanban/3.7/`)
- `mirror-picker-desktop` — แถบขวา "สะท้อนการ์ดไปบอร์ดอื่น" เลือกบอร์ด + ปุ่มสะท้อน/ยกเลิก · ต้นฉบับแสดง "สะท้อนอยู่ที่ ซ่อมบำรุงอุปกรณ์ #209"
- `mirror-chip-on-board-desktop/mobile` — การ์ดสะท้อนบนบอร์ดปลายทางมีชิป "สะท้อนจาก งานร้าน — สาขาป่าตอง #28" + ผู้รับผิดชอบจากต้นฉบับ
- `mirror-card-back-banner-desktop/mobile` — แถบบนสีเทา + ลิงก์ "ไปต้นฉบับ #28" · เนื้อหา (รายละเอียด/ผู้รับผิดชอบ) มาจากต้นฉบับ

## สิ่งที่ Fable แก้/ทำเพิ่มตอนรับงาน
- ข้อสอบ k3.7: จำ `cardNoSeq` ทุกบอร์ดแล้วคืนใน finally (ตัวสะท้อนกิน cardNo ปลายทาง → k1.1-S2.5 แดง)
- QC data drift สะสม (position ≠ sortOrder · cardNoSeq > max cardNo) → re-seed `seed-kanban-qc.mts` (เฉลยใหม่) → k1.1 30/30
- `docs/api/KANBAN-API.md` stale (F13.5) → รัน `gen-kanban-api-docs.mts` (88 op)

## หนี้
- ไม่มี REST op สำหรับ "ถอดตัวสะท้อน" (ใช้เก็บเข้าคลังแทน) · ตัวสะท้อนบนตาราง/ปฏิทิน แสดงจากต้นฉบับแต่ยังไม่มีชิปในมุมมองตาราง
