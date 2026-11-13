# T2 lane 1 · Job A — งบ query กลับเข้ากรอบ + บั๊กหน้าจอเล็ก 2 จุด

## A1 งบ query (ไม่ขยับงบสักตัว)
ต้นเหตุ: T0.2/T0.4 เพิ่มการโหลดตารางค่ากฎหมาย (SettingValue 1 คำสั่ง) ใน `getSettings`/`getPolicy` · ภาพรวมรายได้ไล่ครอบครัวใบลดหนี้ทีละชั้น.
ใน suite แต่ละ "หน้า" โหลดตารางค่ากฎหมายแค่ครั้งเดียว ⇒ memo ต่อคำขออย่างเดียวไม่ลด SQL ของ suite — ต้องตัดคำสั่งซ้ำจริงของหน้า:

| หน้า | ก่อน | หลัง | ทำอะไร |
|---|---|---|---|
| หน้าหลัก | 20/19 | ≤19 | `getSettingsLite` (vatRegistered+orgName 1 คำสั่ง) แทน getSettings ทั้งก้อน — หน้าใช้แค่ 2 ค่านี้ |
| ภาพรวมรายได้ | 13/9 | ≤9 | family walk = recursive CTE คำสั่งเดียว (เดิม 1+ชั้น) · ชื่อผู้ติดต่อ 2 บล็อกรวมเป็นคำสั่งเดียว (`batchedContactNames`) · `getSettingsLite` |
| ภาพรวมค่าใช้จ่าย | 9/8 | ≤8 | ชื่อผู้ติดต่อรวม · `getSettingsLite` |
| รายการขาย/ซื้อ | 12/11 · 11/10 | ≤ งบ | `skipStatusCounts` — หน้า V2 นับแท็บด้วย `computeListTabCounts` (ตัวกรองเดียวกัน) อยู่แล้ว ตัว groupBy+count ใน listDocumentsPaged ไม่มีใครอ่าน |
| ตั้งค่าเอกสาร | 8/7 | ≤7 | doc settings มาจาก `getSettings().doc` (แถวเดียวกัน) ส่งต่อให้ `documentPaymentChannels` + `docNumberingRows` |
| ตั้งค่านโยบาย | 5/4 | 4 | `getPolicyWithDocConfig` — นิยามลูกค้าประจำอ่านจาก docConfig ของแถวเดียวกับนโยบาย |
| โปรไฟล์ 360° Q8 | 14·13/12 | ≤12 | family walk คำสั่งเดียว + แท็บเอกสาร `skipOverdueCount` (ไม่ได้ใช้) |

memo ต่อคำขอ: `loadBookLegalForRequest` = React `cache` (เอกสาร Next `02-guides/caching-without-cache-components.md` §ORM) คีย์ (tenantId, systemId) —
ขอบเขต = การเรนเดอร์ RSC หนึ่งรอบ · นอกเรนเดอร์ = เรียกตรง ⇒ ข้ามร้าน/สมุด/คำขอไม่ได้ · ใช้ใน `getSettings` (อ่าน) เท่านั้น เส้นทางเขียนเรียก `loadBookLegal` ตรง.
ORACLE-EDIT (qc-acc-v2-perf): เคสหน้าเปลี่ยนตามหน้าจริง (ตั้งค่าเอกสาร · นโยบาย · รายการ · ภาพรวม) — งบเดิมทุกตัว.
familyCreditByInvoice เป็น raw ⇒ มิเตอร์ตามโมเดลไม่เห็น: dashboard บวก 1 เอง.

## A2 schema drift
`qc-acc-v2-schema` S6 เรียก `pnpm drift` ตรง ๆ — **ไม่มีกลไก allow-list** ⇒ ปล่อยแดงตามคำสั่ง (ดัชนีหอพัก NULLS NOT DISTINCT · ไม่ใช่บัญชี).
(ดัชนี `AccountDocument_taxinvoice_source_uniq` เป็น partial index — prisma diff ไม่รายงาน)

## A3 หน้าใบกำกับภาษีซื้อ
PTX เป็นทะเบียนภาษีซื้อ: หัว subTotal 0 · บรรทัดเดียว = ยอดภาษีซื้อ ⇒ หน้ารายละเอียดของชนิดนี้: หัวคอลัมน์ "ภาษีซื้อ" · ยอดรวม "ยอดภาษีซื้อ" (ไม่โชว์ "รวมเป็นเงิน"/"ยอดที่ต้องชำระ").
"1—": คอลัมน์จำนวน (ชิดขวา) ติดคอลัมน์หน่วย (ชิดซ้าย "—") ⇒ เว้นช่อง + ไม่มีหน่วย = ว่าง (ทุกชนิดเอกสาร).

## A4 สถานะภาษีซื้อเมื่อเปลี่ยนผู้ขาย — ตรวจบนจอตอนท้าย (สคริปต์ combobox)
