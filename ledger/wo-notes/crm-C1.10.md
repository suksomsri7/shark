# WO C1.10 — REST 63 op + เครื่องมือผู้ช่วย AI 14 ตัว + หน้าตั้งค่า CRM / API และ webhook

> RUN "CRM v2" · 19 ก.ย. 2569 · ผู้คุมงาน Opus 5 · ข้อสอบ `qc-crm-c1.10` 66 ข้อ · probe-c110-review 13/13 · builder ทำบน QC2 (worktree `shark-crm-c110`) · ผู้คุมงานตรวจซ้ำบน QC1 seed ใหม่
> ORACLE-EDIT: C1.10 S0.4/S5.3/X1.1/X1.2/S4.3 (ก่อนเริ่ม) · **C1.9-S7.2** (เปลี่ยน key วัตถุที่ LOOKUP ชี้ = ได้ + เขียน LOOKUP ตาม · ขัดกับ C1.10 S11.5 · ใบหลังชนะ) · **C0.2-S1.4** (namespace `crmApi` เทียบทีละตัวกับ `crm/api`) — CRM-RUN §4

## 1. สิ่งที่ส่งมอบ
- `/api/v1/crm/*` 63 op (contacts/companies/deals/activities/objects/teams/settings) · `/api/v1/teams/*` · `/api/v1/crm/openapi.json` · `docs/api/CRM-API.md` (gen + `--check`)
- ชุดสิทธิ์คีย์ 3 ชุด (`crm.readonly` / `crm.operate` / `crm.admin`) + ตัวกรองทีม/เจ้าของ · readonly ปิดบังเบอร์/อีเมลทั้งตามชื่อฟิลด์และตามรูปแบบในทุกข้อความ · ส่งออก = admin เท่านั้น · เพดาน body 1 MB (นำเข้า 10 MB)
- สกิล AI `crm` 14 เครื่องมือ (เขียน = ข้อเสนอรอคนยืนยัน) · ผู้ช่วยถูกปฏิเสธค่าอ่อนไหวที่ engine (`evaluateSensitiveAccess` · ไม่เขียน access log)
- **ร้าน v1 (ทุกร้านบน prod)**: เครื่องมือ `crm_create_lead` รุ่นเดิมคงเดิมทุกไบต์ (ชื่อ/สคีมา/note/ชนิดข้อเสนอ) รวมคีย์ scope ว่าง · ข้อเสนอค้างก่อน deploy ยังทำงาน
- หน้า `/crm/settings` (การ์ดรวม) + `/crm/settings/api` (คีย์ · curl · เครื่องมือ AI · webhook · การส่งล่าสุด) — v2 เท่านั้น · OWNER/ผู้มีคีย์ตั้งค่า
- จ่ายหนี้: รวมผู้ติดต่อ/บริษัทย้ายค่าฟิลด์กำหนดเอง (C1.3/C1.4 S11.6) · เปลี่ยน key วัตถุเขียน LOOKUP ตาม (C1.2b S11.5)

## 2. ผู้ตรวจ
BLOCKER 1: ผู้ช่วย AI ได้ค่าฟิลด์อ่อนไหวเมื่อเจ้าของถาม → แก้ที่ engine · ถอยหลัง prod ร้าน v1: คีย์ AI เดิมเสีย `crm_create_lead` → คืนเดิม · SHOULD-FIX: operate ส่งออกได้ · ตั้งสมาชิกทีมไม่ atomic · ไม่มีเพดาน body · ปิดบังเบอร์เฉพาะชื่อฟิลด์ · คีย์กรองทีมเขียนนอกทีม · convert ผ่านคีย์ข้าม scope สมาชิก → แก้ครบ (probe 13/13)

## 3. ด่าน
| # | ผล | หลักฐาน |
|---|---|---|
| D2 | ✅ | 66/66 บน QC1 seed ใหม่ (`c110-verify.log`) และซ้ำหลัง ORACLE-EDIT (`c110-verify2.log`) |
| D3 | ✅ | probe-c110-review 13/13 · X-series ในข้อสอบ |
| D4 | ✅ | C0.2–C1.9 · ai-tools · account-api-keys/core/webhooks/write-docs · form · member m1.4/fix-s1/fix-s2/public · chat autolink · approval · automation · webhook · probe c17–c19 + ประตู 14/14 · qc-acc-v2-permissions เขียวหลัง seed ร้านบัญชีใหม่ (ข้อมูล seed ของร้านบัญชีหายจาก QC1 ระหว่างรัน — ไม่เกี่ยว C1.10) · K3.1-S6.3 แดง = ไม่มีภาพ `.qc-shots/kanban/3.1` (สิ่งแวดล้อม) |
| D5/D6 | ✅ | typecheck · fitness 32/32 ×2 · gen-crm-api-docs --check · build |
| D7 | ✅ | `.qc-shots/crm/1.10/` owner desktop/mobile (+ฟอร์มสร้างคีย์) · manager = 404 ตามแบบ |
| D11 | ✅ | m1.9 26/26 |

## 4. PARITY ภาพ 14 (ขวา)
คีย์ 3 ชุด · curl · ตารางเครื่องมือ · webhook + การส่งล่าสุด ✅ ตามโครง · seed ไม่มีคีย์/ปลายทาง จึงเห็นตารางว่าง (ฟอร์มสร้างคีย์ถ่ายแยก) · ฝั่งซ้ายของภาพ = แชทผู้ช่วย AI เดิม ไม่อยู่ในใบนี้ · มือถือ: ตารางกว้างเลื่อนในกล่องตัวเอง (หน้าไม่ล้น — แก้ `md:min-w` ที่ builder C1.11 พบ)

## 8. หนี้
| เรื่อง | เจ้าของ |
|---|---|
| ทีม = ทั้งร้าน (R-C.7) · recordCount ของคีย์ที่มีตัวกรอง · F13.10 อ่อน | C5 |
| ส่งออกบริษัท/ดีล (ยังไม่มี op) | C2.x |
