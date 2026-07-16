# SHARK AI Business OS — Software Design Specification (SDS)

> **Living Documentation** — แก้ได้ตลอด แต่ทุกการแก้ต้อง commit พร้อมเหตุผล · อ้างอิงโดย AI agent ทุกตัวในโครงการ
> เจ้าของวิสัยทัศน์: user (ไฟล์ต้นทาง Blank_6) · สถาปนิก: Fable 5 · ผู้สร้าง: Builder Opus 4.8

## เจตนาของเอกสารชุดนี้
1. เป็น**คู่มือหลัก**ที่ AI ทุก session/ทุกตัว อ้างมาตรฐานเดียวกัน — ไม่ต้องเดา ไม่ต้องรื้อสถาปัตยกรรมซ้ำ
2. เป็น**ทรัพย์สินทางปัญญา** — เปลี่ยนทีม เปลี่ยนภาษา เปลี่ยน AI ก็สร้างต่อจากเล่มนี้ได้
3. เป็น**แผนเดินเครื่องรันยาว** — Master Queue ใน 10_MASTER_QUEUE.md คือคิวงานที่เครื่องหยิบเอง

## สารบัญ

| เล่ม | เนื้อหา | สถานะ |
|---|---|---|
| [01_VISION.md](01_VISION.md) | วิสัยทัศน์ + ยุทธศาสตร์ขึ้นอันดับ 1 + นิยามความสำเร็จ | ✅ |
| [02_ARCHITECTURE.md](02_ARCHITECTURE.md) | สถาปัตยกรรม 5 ชั้น + **ผังการเชื่อมต่อทุกโมดูล** + กติกา dependency | ✅ |
| [03_AI_LAYER.md](03_AI_LAYER.md) | ชั้น AI (ชี้ไป docs/AI_LAYER.md + ส่วนขยายอนาคต) | ✅ |
| [04_CORE_PLATFORM.md](04_CORE_PLATFORM.md) | kernel: tenant/scope/RBAC/outbox/**ความปลอดภัยทุกชั้น** | ✅ |
| [05 modules/](modules/) | สเปคต่อโมดูล — as-built 18 + future ~15 | ✅ |
| [06_DATABASE.md](06_DATABASE.md) | conventions ของ schema + migration + Neon | ✅ |
| [07_API.md](07_API.md) | Public API v1 (ออกแบบล่วงหน้า) | ✅ |
| [08_UI.md](08_UI.md) | ชี้ docs/UI_STANDARD.md (มาตรฐานบังคับเดิม) | ✅ |
| [09_OPERATIONS.md](09_OPERATIONS.md) | **โหมดรันยาว: Fable หัวหน้า/Builder Opus/QC/ชนลิมิต/การบันทึก/กู้คืน** | ✅ |
| [10_MASTER_QUEUE.md](10_MASTER_QUEUE.md) | **Master WO Queue เต็มวิสัยทัศน์ (WO-0035→0072) + dependency + จุดรอเจ้าของ** | ✅ |

## ลำดับการอ่านสำหรับ AI session ใหม่
`ledger/RESUME.md` (CHECKPOINT) → เล่ม 09 (วิธีทำงาน) → เล่ม 10 (หยิบงานถัดไป) → เล่ม 02+04 (ก่อนแตะโค้ด) → เล่มโมดูลที่เกี่ยว
