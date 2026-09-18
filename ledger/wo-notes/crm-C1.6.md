# WO C1.6 — กิจกรรม v2 + ปฏิทิน + โน้ต/ไฟล์/คอมเมนต์ + ลิงก์บอร์ดงาน

> RUN "CRM v2" · branch `session/crm` · 19 ก.ย. 2569 · ผู้คุมงาน: Opus 5
> ข้อสอบ: `scripts/qc-crm-c1.6.mts` (79 ข้อ) · ORACLE-EDIT X3.4 (C1.5 ประทับ lastActivityAt = now ทุกการย้ายดีล) · probe 17/17 · ประตู uiVersion 14/14

## 1. สิ่งที่ส่งมอบ
- `crm/activities.ts` (บันทึก/ปิด/เลื่อน/แก้/ปักหมุด/ลบ · รายการ ค้าง/วันนี้/สัปดาห์/เกิน/เสร็จ · ปฏิทิน · โน้ต · เปิดการ์ดงาน · consumer `kanban.card.completed`) · `activities-shared.ts` · `crm/files.ts` (ไฟล์ส่วนตัวเท่านั้น · ลิงก์ลงชื่อต่อผู้ดู 15 นาที · ตัดอักขระล่องหน/ย้อนทิศ)
- `lastActivityAt` ของผู้ติดต่อ/ดีล/บริษัท = GREATEST (บริษัทผ่าน `companies.touchLastActivityInTx` — ปิดหนี้ C1.3) · ลำดับล็อก บริษัท → ผู้ติดต่อ → ดีล
- mention แจ้งเฉพาะคนที่มองเห็นเรคคอร์ด · บอร์ดงานผ่าน `kanban/links.visibleBoardOptions` (ปิด BLOCKER ผู้ตรวจ: ชื่อบอร์ดส่วนตัวรั่ว) · resolver DEAL/COMPANY/CUSTOM_RECORD ของบอร์ดงาน (23 ชนิดลิงก์)
- หน้า `/crm/activities` (v2 · v1 ทุกไบต์เมื่อ uiVersion ≠ 2) · `/crm/calendar` (วัน/สัปดาห์/เดือน · v2 เท่านั้น) · บล็อกกิจกรรม/ไฟล์/การ์ดงานใน 360 ทั้งสาม

## 3. ด่าน
| # | ด่าน | ผ่าน? | หลักฐาน (`.qc-shots/crm/c16-verify.log`) |
|---|---|---|---|
| D2 | ผู้คุมงานรันเอง | ✅ | **79/79** |
| D3 | X | ✅ | ข้อสอบ + probe 17/17 + ประตู 14/14 |
| D4 | regression | ✅ | C1.1–C1.5 · C0.2–C0.4 · qc-crm · crm-activity · acc-v2 · form · ai-tools · บอร์ดงาน k1.5/k1.9/k3.1/k3.3/k3.7/notify · สมาชิก — แดงเฉพาะภาพ/skill · ⚠️ m1.4 แดง ×2 ในรอบนี้ ทำซ้ำไม่ได้หลัง reseed (21 ครั้ง) — CRM-RUN §4 |
| D5/D6 | typecheck · fitness · build | ✅ | exit 0 · 29/29 ×2 · build exit 0 · `gen-kanban-api-docs` ใหม่ |
| D7 | ภาพ | ✅ | owner/thana/nok/manager × กิจกรรม/ปฏิทินสัปดาห์/เดือน/Deal 360 × 1440/390 · HTTP 200 · ไม่ล้น · ปฏิทินถ่ายซ้ำพร้อมรายการชั่วคราว 4 รายการ · ร้าน uiVersion 1 = probe ประตู |
| D9 | ผู้ตรวจ | ✅ | BLOCKER 1 (ชื่อบอร์ดส่วนตัวรั่ว) + SHOULD-FIX 10 → แก้ครบ |
| D11 | m1.9 | ✅ | 26/26 |

**PARITY: ผ่าน** — ปฏิทินเทียบภาพ 08: ตารางสัปดาห์ช่องชั่วโมง · รายการมีเวลา/ชนิด/ชื่อ · สลับ วัน/สัปดาห์/เดือน · ของฉัน/ทีม · วันนี้เน้นสี · (ภาพแรกไม่มีรายการเพราะ seed ไม่มีกิจกรรมในสัปดาห์ → เพิ่มข้อมูลชั่วคราวในสเปคภาพ · สูตร "00:00 ไทยวันนี้" ของผู้คุมงานผิดก่อน 07:00 → แก้แล้ว ปฏิทินถูก)

## 8. หนี้
| เรื่อง | เจ้าของ |
|---|---|
| enum `CrmActivitySource.KANBAN` (ตอนนี้อยู่ใน payload/audit) | **C2.0** |
| m1.4 snapshot เมื่อแดง | **C5** |
| resolver บอร์ดงาน + mention ต้องผ่าน visibility จริง | **C1.7** |

## 3.2 D12 — push/deploy
✅ push `9b971e3` (+ `d34f90f`) → session/crm + main · deploy ใหม่ `dpl_7qTLD…` ขึ้นจริง (ช้า ~36 นาทีจาก push — build คิว/ช้า ไม่ล้ม) · health ok · หน้าแรก 200 · ไม่มี migration · หน้า activities ของร้าน uiVersion 1 = v1 ทุกไบต์ (probe ประตู)
