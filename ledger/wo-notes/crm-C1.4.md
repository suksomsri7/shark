# WO C1.4 — ผู้ติดต่อ v2 (service + รายการ + 360 + แปลง lead + ความยินยอม)

> RUN "CRM v2" · branch `session/crm` · 18 ก.ย. 2569 · ผู้คุมงาน: Opus 5
> ข้อสอบ: `scripts/qc-crm-c1.4.mts` (110 ข้อ · commit `6d30d33`) · ORACLE-EDIT 1 จุด (S1.5 ลำดับคีย์ JSONB) · probe การแก้ตามผู้ตรวจ 23/23

## 1. สิ่งที่ส่งมอบ
- `crm/contacts.ts` (~2,000 บรรทัด): §5.2 ครบ · `contacts-shared.ts` · `contacts-actions.ts` · `consents.ts` (append-only · ผู้ติดต่อที่ผูกสมาชิกใช้ `MemberConsent` แหล่งเดียว · `canContact`) · `assignment.ts` (stub → C2.3)
- **แปลง lead ในธุรกรรมเดียว** (สมาชิก + บริษัท + ดีล) ด้วย `idempotencyKey` — กดซ้ำ/ขนานข้ามโปรเซส = ชุดเดียว · ผู้ใช้คนที่สอง = CONFLICT ภาษาไทย
- ส่วนเพิ่มแบบไม่เปลี่ยนพฤติกรรมเดิม: `member.createMember(…, tx?)` · `member.getConsents/setConsent(…, tx?)` · `listAccessLog` กรอง `page LIKE 'crm.%'` · `companies.ts` บล็อก C1.4 (`createInTx` · `linkContactInTx` · `transferContactLinksInTx` · `liveCompanyRefs` — ผู้เขียน CrmCompany ยังมีที่เดียว) · `crm/rules.ts` CHURNED · wrapper v1 `service.ts#createContact` (ฟอร์ม/AI ใช้ต่อได้)
- หน้า `/crm/contacts` (v2) · `/contacts/new` · `/contacts/[contactId]` (360 ตามภาพ 05 + โมดัลแปลง 3 ติ๊ก + บล็อกความยินยอม)
- event `crm.contact.created/updated/assigned/converted/merged` × 3 ทะเบียน

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน (tree หลัก · `.qc-shots/crm/c14-verify.log`) |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด | ✅ | `6d30d33` |
| D2 | ผู้คุมงานรันเอง | ✅ | **110/110** บน reseed ใหม่ |
| D3 | กลุ่ม X | ✅ | ข้อสอบ X1/X3 (4 โปรเซส · setPrimary ∥ updateContact ไม่มี 40P01)/X4/X6/X8/X9 + probe 23/23 (เข้มสุดชนะตอนแปลง/ผูกสมาชิกเดิม/รวม · opt-out ของผู้ผูกสมาชิกถอนที่สมาชิก · ถอนล้ม = ย้อนทั้งก้อน · Party ใช้ร่วม · รวม Party ของสมาชิกคนละคน = ปฏิเสธ · race แปลง∥รวม · race ความยินยอม∥แปลง) |
| D4 | regression | ✅ | C1.3 89 · C1.2b 93 · C1.2a 91 · C1.1 50 · C0.2 27 · C0.3 88 · qc-crm 25 · crm-activity 12 · acc-v2 party/contacts/contact-merge · nav · form · forms-notify · ai-tools · สมาชิก m1.2/1.4/1.5/1.6/1.7/1.8/1.12/3.2/3.6/3.9/fix-s1/fix-s2/public — แดงเฉพาะภาพ (`.qc-shots/member` ไม่มี) · **m3.6 ERR → บั๊กเดิมของระบบสมาชิก แก้แล้ว (§7)** |
| D5 | typecheck + fitness | ✅ | exit 0 · 29/29 ×2 |
| D6 | build | ✅ | exit 0 (heap 4.5G) |
| D7 | ภาพ | ✅ | owner/thana/nok/manager × รายการ/สร้าง/360 × 1440/390 + โมดัลแปลง = 28 ภาพ · HTTP 200 · ไม่มี console error · ไม่ล้น |
| D8 | ทะเบียนปุ่ม | ✅ | +83 แถว · F14 เขียว |
| D9 | ผู้ตรวจ | ✅ | **BLOCKER 1 (PDPA: ความยินยอมถูกยกเลิกเงียบตอนแปลง/รวม)** + SHOULD-FIX 7 → แก้ครบ · ถอนที่สมาชิกอยู่ใน tx เดียว |
| D10 | ทะเบียน event | ✅ | 5 × 3 |
| D11 | คืนสภาพ QC | ✅ | m1.9 26/26 หลังข้อสอบ + หลังจบ |

**PARITY: ผ่าน** — 360 เทียบภาพ 05: หัว (ป้าย lifecycle · สถานะ lead · คะแนนร้อน) · โทร/แปลง lead · ข้อมูลติดต่อ · ฟิลด์เพิ่มเติม · ไทม์ไลน์ · แถบขวา AI/การเชื่อมต่อ/ดีล/ความยินยอม · โมดัล 3 ติ๊ก (ระบบสมาชิก · สร้าง/ผูกบริษัท · pipeline/ขั้น/มูลค่า) — ตรง · ต่าง: ไม่มีปุ่ม "ส่งอีเมล" (C2.5) · ชิปเหตุผลคะแนน (C2.x) · ป้าย "เป็นสมาชิก Gold" ข้างชื่อยังไม่มี (แสดงในการเชื่อมต่อแทน)

## 7. สิ่งที่เจอ/แก้/ตัดสิน
- ORACLE-EDIT `C1.4-S1.5` (JSONB เรียงคีย์ใหม่)
- C1.3 S0.3–S0.5 (ผู้เขียนคนเดียว) ขัด convert ใน tx เดียว → **ทาง A**: export แบบเข้าร่วม tx ใน companies.ts (ไม่แก้ข้อสอบ)
- 🔧 **ACCEPTANCE-FIX ของผู้คุมงาน — บั๊กเดิมบน prod ของระบบสมาชิก**: `notifications.runDue` เจอแจ้งเตือนค้างของสมาชิกที่ถูกลบ (เช่น ลบตาม PDPA) → `MemberNotFoundError` → **ทั้งรอบล้ม = ไม่มีใครในร้านได้รับแจ้งเตือนอีกเลย** · แก้: แถวของคนนั้น SKIPPED "ไม่พบสมาชิกคนนี้แล้ว" แล้วไปต่อ (11 บรรทัด) · หลักฐาน: m3.6 ERR ×2 ก่อนแก้ → 18/19 ×3 หลังแก้ (ที่เหลือ = ภาพ) · probe `scripts/pending/probe-m36-orphans.mts` เจอแถวค้าง 4 แถวของลูกค้าที่ไม่มีแล้ว · ข้อสอบชุดไหนลบลูกค้าแต่ทิ้งแจ้งเตือนค้าง → หนี้ C5
- `createMember(…, tx)` เทียบบรรทัดต่อบรรทัดโดยผู้ตรวจ: ไม่ส่ง tx = เหมือนเดิม

## 8. หนี้ / ส่งต่อ
| เรื่อง | เจ้าของ |
|---|---|
| ตัวดู access-log ของ CRM (ถูกกรองออกจากหน้าสมาชิกแล้ว) | **C3.9** |
| `briefFor` ต้องมี actor ก่อนใช้ · `member.merged` ต้องชี้ `memberCustomerId` ใหม่ | **C1.8** |
| หน้า contacts/companies ไม่มี `assertCan` ก่อน render | **C1.7** |
| ตารางงานนำเข้า (async) · inline ≤ 5,000 แถวชั่วคราว | **C2.0 / C2.x** |
| แปลง lead สร้างบริษัทชื่อซ้ำโดยไม่เตือน | **C1.9** |
| รวมผู้ติดต่อไม่ย้าย custom values | **C1.10** |
| ข้อสอบที่ลบลูกค้าแต่ทิ้ง `MemberNotification` QUEUED | **C5** |
