# WO C1.7 — สิทธิ์ 51 คีย์ + การมองเห็น OWN/TEAM/ALL + หน้าทีมขาย

> RUN "CRM v2" · 19 ก.ย. 2569 · ผู้คุมงาน: Opus 5 · ข้อสอบ `qc-crm-c1.7` 57 ข้อ · probe 19/19 · ORACLE-EDIT ชุด (C1.3/C1.5/C1.6 fixture + regex async · CRM-RUN §4) · ALLOWED_EDGES `kanban→crm`

## 1. สิ่งที่ส่งมอบ
- `core/permissions.ts` (51 คีย์ ป้ายไทย · 3 พารามิเตอร์ · `CRM_OWNER_ONLY_KEYS`) · `crm/access.ts` (`crmCan` จุดเดียว · API key ไม่มี implicit read) · `crm/visibility.ts` (resolve · visibleWhere · canSee · policies · **ไม่มี cache** · ใช้เฉพาะระบบ uiVersion 2) · `where.ts` async ส่งต่อ visibility
- ตัวเช็คสิทธิ์ใน service ทุกตัว (มองไม่เห็น = 404 · มองเห็นแต่ไม่มีคีย์ = 403 ไทย) · reassign ข้ามทีม (คีย์ + เพดานรายวัน + คำขออนุมัติ + ย้าย teamId) · MANAGER ตาม §6.1 · เจ้าของเท่านั้นให้ 5 คีย์ต้องห้าม
- หน้า `/app/settings/teams` (OWNER/`crm.team.manage`) · `/crm/settings/visibility` (v2 + `crm.visibility.manage`) · ลิงก์ "ทีมขาย" เฉพาะคนมีสิทธิ์
- ลิงก์ CRM บนบอร์ดงานซ่อนเมื่อมองไม่เห็น (v2 เท่านั้น)

## 3. ด่าน
| # | ผล | หลักฐาน (`.qc-shots/crm/c17-verify2.log`) |
|---|---|---|
| D2 | ✅ | **57/57** |
| D3 | ✅ | X1 เมทริกซ์ 4 บทบาท · X2 API key · X3 policy ขนาน/เพดาน reassign · X9 · + probe 19/19 (B1 v1 · N+1 · 40,000 ผู้ติดต่อ · unit · reassign · สิทธิ์ต้องห้าม) |
| D4 | ✅ | C1.1–C1.6 ทุกใบเขียว · qc-crm · crm-activity · acc-v2-permissions 160 · nav · kanban · สมาชิก · probe C1.4/C1.5/C1.6 (C1.6 ปรับ fixture ตาม C1.7) · ประตู uiVersion 14/14 |
| D5/D6 | ✅ | typecheck · fitness 29/29 ×2 · build |
| D7 | ✅ | owner: ทีม/สิทธิ์/กระดาน 200 · thana/nok/manager: หน้าตั้งค่า 404 ตามแบบ · กระดาน 200 · **ร้าน uiVersion 1**: probe B1 + ประตู |
| D9 | ✅ | BLOCKER (ลิงก์ผู้ติดต่อบนบอร์ดงานของร้าน v1 กลายเป็น "ไม่มีสิทธิ์") + SHOULD-FIX 10 → แก้ครบ |
| D11 | ✅ | m1.9 26/26 |

**PARITY: ผ่าน** — หน้าทีมเทียบภาพ 10 ซ้าย: การ์ดทีม (ชื่อ · จำนวน · หัวหน้า · สาขา) · รายละเอียด (ชื่อ · หัวหน้า · สาขา · สมาชิก+รับลีด+เอาออก · เพิ่ม · เก็บถาวร) · ต่าง: ตารางสิทธิ์แยก CONTACT/COMPANY (เป็นคนละนโยบาย) · แผง Territory = C2.3

## 8. หนี้
| เรื่อง | เจ้าของ |
|---|---|
| ข้อความ AccessForm "ผู้จัดการทำได้ทุกอย่าง" ไม่ตรงสำหรับ CRM | **C1.10** |
| ประสิทธิภาพ: ไม่มี cache ⇒ 360 ≈ 100 query สำหรับ STAFF | **C5** |
| `fileWhere`/`recordWhere` ต้องมีเป้าหมาย — รายการใหม่ต้องใช้ EXISTS | กติกาถาวร |
