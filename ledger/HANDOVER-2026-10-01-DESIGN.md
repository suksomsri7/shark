# HANDOVER — งานออกแบบ POS · คลัง V2 · HR V2 (ปิดกะ 1 ต.ค. 2569 ~11:30 BKK)

> เจ้าของย้ายเครื่อง/บัญชี Claude · ทุกอย่างอยู่บน `origin/main` (commit หลัง `ef389bc5`) · **ยังไม่ coding** · เริ่มใหม่บนเครื่องไหนก็ได้: `git clone` → อ่านไฟล์นี้ → `ledger/RESUME.md` บล็อกบน

## 1. สิ่งที่ส่งมอบ (ทั้งหมดใน `ledger/`)
| ไฟล์ | คืออะไร |
|---|---|
| `DESIGN-POS.md` | แบบ POS ใหม่ 14 โมดูล · เทียบ Wongnai/Odoo/Choco/Loyverse · เชื่อม 18 ระบบ · §9 เจ้าของเคาะ 4/8 |
| `POS-CONTRACTS.md` | สัญญาการเชื่อม C-6…C-13 + event/consumer ทั้งหมด |
| `POS-API.md` | API ส่วนเพิ่ม + REST v1 + AI tool manifest |
| `POS-MIGRATION-PLAN.md` | ยุบสินค้า 3 ต้นฉบับเป็น 1 แบบ 3 ขั้น + กับดัก migration |
| `POS-MASTER-PLAN.md` | RUN POS 55 ใบ 7 เฟส · เลน A/B/C · ด่าน DoD · X1–X12 · งบเวลา · งานเจ้าของ · ค่าใช้จ่ายร้าน · ความเสี่ยง |
| `pos-briefs/` | brief กลาง + P1.1a (แม่แบบ ใบอื่นเขียนตอนถึง) |
| `design-pos/` | ภาพ 21 จอ + README (วิธี render) |
| `DESIGN-INVENTORY-V2.md` + `design-inventory/` | แบบคลัง/จัดซื้อ V2 (28 ใบ → เหลือ 22 หลังย้ายใบซ้อนเข้า POS) + ภาพ 8 จอ |
| `DESIGN-HR-V2.md` + `design-hr/` | แบบ HR V2 (29 ใบ → 28) + ภาพ 8 จอ |

## 2. ข้อที่เจ้าของเคาะแล้ว (รวม)
- POS: แคตตาล็อกเดียว · ทำครบวงจร RUN เดียว (P1+P2 = 32 ใบ 3 เลน) · ออฟไลน์ P3 · แท็บเล็ต+เครื่องพิมพ์ BT/USB
- คลัง: ยุบ PO เข้าคลัง · ถัวเฉลี่ย+FIFO ตัวเลือก · ผลิตเอา/ซีเรียลเลื่อน · PO ทาง LINE = I3
- HR: บัญชี SHARK STAFF · GPS เปิด/รูปปิด · ไฟล์ธนาคาร 4 แห่ง
- **ลำดับ RUN: CRM (เหลือ ~9 ใบ · session อื่น) → POS → คลัง V2 → HR V2**

## 3. ยังรอจากเจ้าของ (ไม่บล็อกการเริ่ม RUN POS)
Beam creds · partner API LINE MAN/Grab/Shopee · ร้านทดลอง + เครื่องพิมพ์ BT · ชื่อที่ปรึกษาตรวจสูตร ปสส./ภงด.1 · ไฟล์ตัวอย่างโอนเงินเดือน 4 ธนาคาร

## 4. วิธีเริ่ม RUN POS (เมื่อสั่ง)
1. `git pull` · อ่าน `POS-MASTER-PLAN.md` §0–§4 · `pos-briefs/pos-brief-COMMON.md`
2. ทำ P0 (3 ใบ เดี่ยว) → P1.1a/b (เดี่ยว · migration) → 3 เลน
3. กติกาเครื่อง/ด่าน/prompt ใช้ของ `CRM-MASTER-PLAN.md` §1–§5, §11 · เพดาน ≤3 เลน (เครื่อง 4 vCPU/15 GB — ขยายได้ถ้า swap < 30%)

## 5. วิธี render ภาพใหม่ (ทุกโฟลเดอร์ design-*)
`./mk.sh NN-x.body.html "ชื่อ" && node render.mjs NN` — ต้องมี chromium + puppeteer-core (บน VPS เดิมอยู่ที่ `/root/dive3d/node_modules`; เครื่องใหม่ `npm i puppeteer-core` แล้วแก้ path ใน `render.mjs` บรรทัด import + `executablePath`) · ฟอนต์ไทย Noto Sans Thai/Sarabun ต้องติดตั้ง
