# SHARK — พิมพ์เขียวแก่น: "ทุกอย่างคือระบบ" (FINAL — override ทุกเอกสารก่อนหน้า)

> ยืนยันโดยเจ้าของ 2026-07-11: **ไม่มีการแยก "กิจการ" กับ "ระบบ" — ทุกอย่างคือ "ระบบ"**
> เอกสารนี้ override: BLUEPRINT.md §โมดูล, BLUEPRINT_BUSINESS_UNITS.md (ส่วน scope), RESOLUTIONS (ส่วนที่ขัด)
> สถานะ implement: โครง + 5 ระบบแรกทำงานแล้ว (BOOKING/MEMBER/POINT/POS/REWARD) บน shark.in.th

## 1. หลักการ

1. **ระบบ 14 ประเภท เท่าเทียมกันหมด** — ผู้ใช้เลือกสร้างระบบอะไรก็ได้ กี่ชุดก็ได้
2. **ทุกระบบเชื่อมถึงกันได้** — การเชื่อม (link) เป็นทางเลือก ไม่บังคับ ไม่ auto
3. **ระบบทำงานเดี่ยวได้เสมอ** — ไม่เชื่อม = ทำงาน standalone (เช่น จองคิวแบบ guest), เชื่อมแล้ว = ทำงานร่วมอัตโนมัติ
4. หลายระบบ business เชื่อมระบบ feature เดียวกัน = **แชร์ข้อมูล** (เช่น 2 ร้านแชร์สมาชิก/แต้มชุดเดียว)

## 2. ทะเบียนระบบ 14 (ตามพิมพ์เขียวเจ้าของ)

| # | ระบบ | kind | เก็บเป็น | สถานะ |
|---|---|---|---|---|
| 1 | Hotel โรงแรม | business | BusinessUnit | 🔜 |
| 2 | Restaurant ร้านอาหาร | business | BusinessUnit | 🔜 |
| 3 | Booking จองคิว/นัดหมาย | business | BusinessUnit | ✅ LIVE |
| 4 | Q บัตรคิว | business | BusinessUnit | 🔜 |
| 5 | Ticket ตั๋ว/อีเวนต์ | business | BusinessUnit | 🔜 |
| 6 | Member สมาชิก | feature | AppSystem | ✅ LIVE |
| 7 | Reward รางวัล | feature | AppSystem | ✅ LIVE |
| 8 | Coupon & Voucher | feature | AppSystem | 🔜 |
| 9 | Point แต้ม | feature | AppSystem | ✅ LIVE |
| 10 | **รวม Chat** (LINE, WhatsApp, Shopee, Lazada, Facebook, IG) | feature | AppSystem | 🔜 สเปคใหม่ → `modules/10-chat.md` |
| 11 | **Meeting** (แบบ Slack ภายในองค์กร) | feature | AppSystem | 🔜 สเปคใหม่ → `modules/11-meeting.md` |
| 12 | **Account** (บัญชีไทยเต็มรูป — ใบเสนอราคา→ใบกำกับ→งบ→DBD) | feature | AppSystem | 🔜 สเปคใหม่ → `modules/12-account.md` |
| 13 | Kanban | feature | AppSystem | 🔜 |
| 14 | POS ร้านค้า | feature | AppSystem | ✅ LIVE (ขาย/บิล; หน้าร้าน+สต็อก 🔜) |
| 15 | **AI พนักงานส่วนตัว** — สั่งงานทางแชท ทำงานแทนทุกระบบ (Claude API + tools, ไม่เทรนเอง) | feature | AppSystem | 🔜 สเปค → `modules/16-ai-employee.md` |
| 16 | **Knowledge Base** — คลังความรู้ร้าน ให้ AI/พนักงานตอบคำถาม (L1 in-context → L2 search → L3 vector) | feature | AppSystem | 🔜 สเปค → `modules/17-knowledge-base.md` |
| 17 | **พนักงาน (HR)** — เวลาเข้างาน ขาด/ลา/มาสาย กะ ใบลา-อนุมัติ (payroll P2 เชื่อมบัญชี) | feature | AppSystem | 🔜 สเปค → `modules/18-hr.md` |
| 18 | **คลังสินค้า/สต็อก (Inventory)** — สต็อกกลางชุดเดียว ทุกระบบตัดจากที่เดียว + แจ้งใกล้หมด | feature | AppSystem | 🔜 สเปค → `modules/19-inventory.md` |

- kind **business** = มีหน้างาน/ลูกค้า/storefront (slug) — ตาราง `BusinessUnit`
- kind **feature** = ระบบข้อมูล/บริการ — ตาราง `AppSystem`
- ทะเบียนใน code: `src/lib/systems.ts` (SYSTEM_DEFS)

## 3. การเชื่อม (Link)

> **ตารางเชื่อมรวมทั้ง 18 ระบบ + contracts C-1..C-5 (Inventory/HR/AI/Meeting/KB) → `BLUEPRINT_CONNECTIONS.md`** (2026-07-12)

- ตาราง `AppSystemUnit` (business ↔ feature): **1 ระบบ business เชื่อมได้ 1 ระบบต่อประเภท feature** (เช่น จองคิว A เชื่อมสมาชิกได้ 1 ชุด) — เปลี่ยน/ถอดได้ทุกเมื่อ
- feature ↔ feature เชื่อมผ่านการใช้งานร่วม (เช่น Reward หักแต้มจาก Point ชุดที่ระบุตอนแลก) — ถ้าระบบใดต้องการ link ตายตัวระหว่าง feature (เช่น Account รับข้อมูลจาก POS หลายชุด) ให้ใช้ตาราง link ของตัวเอง ระบุในสเปคโมดูล
- พฤติกรรมเมื่อเชื่อม (ตัวอย่างที่ implement แล้ว): Booking+Member→จองสร้างสมาชิก · Booking+POS→ปิดงานออกบิล · POS+Point→จ่ายได้แต้ม · Reward+Point→แลกหักแต้ม

## 4. UI หลัก (implement แล้ว)

- `/app` — "ระบบทั้งหมด": การ์ดทุกระบบเท่าเทียม + สถานะเชื่อมต่อ
- `/app/settings/systems` — "เพิ่มระบบ": grid 14 ประเภท (🔜 = disable "เร็วๆ นี้") + ตั้งชื่อ
- `/app/u/[slug]` — ระบบ business: งานของมัน + ส่วน "การเชื่อมต่อ" (เชื่อม/ถอดต่อประเภท)
- `/app/sys/[id]` — ระบบ feature: เนื้อหาตามประเภท + การเชื่อมต่อ
- Onboarding: สมัคร → ตั้งชื่อองค์กร → เลือกระบบแรกจาก 14 → ใช้งาน

## 5. ผลต่อสเปคโมดูลเดิม (docs/modules/*)

- สเปค 15 ไฟล์เดิมยังเป็น **แหล่งความจริงด้านฟีเจอร์ภายใน** ของแต่ละระบบ (ฟังก์ชัน/flow/edge cases)
- สิ่งที่ **เปลี่ยน**: scope จาก "unit-scoped/tenant-scoped" → **"system-scoped"** (`systemId` ของ AppSystem หรือ unitId ของ BusinessUnit) + การเชื่อมเป็น opt-in ไม่ auto + ไม่มี "โมดูลแชร์ทั้ง tenant อัตโนมัติ" อีกต่อไป
- Integration contracts (_CONVENTIONS v2) ยังใช้ signature เดิม เพิ่ม `systemId` ใน context
- สเปค 10/11/12 เขียนใหม่ตามความต้องการละเอียดของเจ้าของ (2026-07-11)
