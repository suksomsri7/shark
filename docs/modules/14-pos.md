# โมดูล 14 — POS (ขายหน้าร้าน) · V2 as-built · scope = **unit**

> **V2 as-built** (24 ต.ค. 2569 · POS P6.2) — เอกสารนี้อธิบายของที่สร้างจริง ณ `session/pos` `6c2352f7` · ส่งมอบฉบับสุดท้าย (ใบงาน 55 ใบ · บั๊ก · ORACLE-EDIT · หนี้ · ของเจ้าของ W1… · ถอยกลับ · วิธีรัน · ดัชนีหลักฐาน) = ledger/HANDOVER-2026-10-POS.md (ไฟล์ของผู้คุม) · โครงข้อมูล/อีเวนต์/facade = `docs/sds/modules/pos.md`
> **P3 as-built: see HANDOVER-P3** (22 ต.ค. 2569 · POS P3.12) — ของที่สร้างจริงถึงปิดเฟส 3 สรุปใน `ledger/HANDOVER-2026-10-22-POS-P3.md` (§1 ใบงาน · §2 ข้อสอบไขว้ · §3 parity · §4 triage)
> **P2 as-built: see HANDOVER-P2** `ledger/HANDOVER-2026-10-16-POS-P2.md` · P1 `ledger/HANDOVER-2026-10-10-POS-P1.md` · P5 `ledger/HANDOVER-2026-10-23-POS-P5.md` · คู่มือในแอปสำหรับเจ้าของร้าน/แคชเชียร์ = หน้า `/app/sys/[id]/pos/help`
> สเปกเดิมก่อนสร้าง (v1 · ก.ค. 2569) ย้ายไปภาคผนวก "v1 design notes" ท้ายไฟล์ — เมื่อขัดกัน หมวด V2 ข้างล่างและโค้ดชนะ

POS ใหม่ = ระบบขายหน้าร้านที่เป็น **จุดตัดเงินกลาง** ของ SHARK: ทุกบิลเกิดที่ `createSale` (`src/lib/modules/pos/service.ts` · facade `src/lib/modules/pos/index.ts`) แล้วผลข้างเคียงทั้งหมด (บัญชี แต้ม สมาชิก คลัง CRM แชท บอร์ดงาน ค่าคอมฯ) วิ่งผ่าน outbox `pos.*` 17 คีย์ (`src/lib/outbox-consumers.ts` · ตาราง `ledger/POS-CONTRACTS.md`) — POS ไม่ import ระบบปลายทางตรง (composition root `src/lib/pos-*-bridges.ts`)
หน้าพนักงาน 8 แท็บ (`src/lib/modules/pos/tabs.ts` `POS_NAV_PATH`): หน้าขาย · สินค้า/บริการ · สต็อก · บิลวันนี้ · กะ · ปิดวัน · รายงาน · ตั้งค่า + หน้าที่เปิดจากแท็บ (โต๊ะ · ออเดอร์ออนไลน์ · จอครัว · โปรราคา · พิมพ์รายงาน · คู่มือ) · หน้าสาธารณะ `/r` (ใบเสร็จออนไลน์) `/q` (QR สั่ง/จ่ายก่อน) `/d` (จอลูกค้า) `/developers/pos` (สัญญา REST)
ทุกสตริงผ่าน `src/messages/{th,en}/pos.json` · เงินเป็นสตางค์ (จำนวนเต็ม) ทุกที่ · ทุก mutation มี idempotency key · สิทธิ์ตัดสินต่อสาขา (`src/lib/modules/pos/access.ts` + `src/lib/core/rbac.ts`) · ตารางสิทธิ์ทุกพื้นผิว (หน้า · action · route · REST op) = `scripts/pos-authz-matrix.json`

## 1. Register · pay · tenders (หน้าขาย · จอชำระ · วิธีจ่าย)
- หน้าขาย 3 ขนาด (1440 · 1024 · 390): กริด/หมวด/ค้นหา/สแกนบาร์โค้ด (keyboard-wedge + กล้อง · บาร์โค้ดน้ำหนัก/ราคา EAN-13 prefix 2x) · ตัวเลือก/variant/สินค้าชั่ง · ตะกร้า + ส่วนลดรายบรรทัด/ท้ายบิลตามเพดานสิทธิ์ · ราคาเปิด (`pos.sale.priceOverride`) — ตัวคิดราคาเดียว `quoteRegisterCart` ใน `src/lib/modules/pos/register.ts` (หน้า + REST `sales.quote` ใช้ตัวเดียวกัน)
- สมาชิกที่ตะกร้า (ค้นเบอร์/QR/สมัครใหม่ + consent · `src/lib/modules/pos/register-member.ts`) · คูปอง/ว่อชเชอร์/แต้ม/รางวัล/สแตมป์ quote สดแล้ว redeem ใน tx ของบิล · พักบิล/เรียกคืน (ทุกเครื่องในสาขา · คิดราคาใหม่ตอนเรียกคืน · หมดอายุตามค่าตั้ง · `src/lib/modules/pos/held-cart.ts`)
- จอชำระ: แบ่งจ่ายหลายวิธีในบิลเดียว (Σ = ยอดสุทธิระดับสตางค์) · เงินทอน · ค่าบริการ % · ปัดเศษเงินสด · ทิป (บัญชีพักทิป `src/lib/modules/pos/tip-ledger.ts`) · ใบกำกับเต็มรูปตอนชำระหรือทีหลัง (`src/lib/modules/pos/tax-invoice.ts`)
- วิธีจ่าย (`PosPayType`): CASH · TRANSFER · PROMPTPAY · CARD · DEPOSIT (มัดจำ `src/lib/modules/pos/deposit.ts`) · ROOM_CHARGE (โรงแรม) · PLATFORM (แพลตฟอร์มเก็บแทน) · GIFT_CARD/STORE_CREDIT (`src/lib/modules/pos/tender.ts`) · ON_ACCOUNT (วางบิลลูกค้าองค์กร · `src/lib/modules/pos/credit.ts`)
- PromptPay/บัตร: ใบขอรับเงิน (`PosPaymentIntent` · `src/lib/modules/pos/payment-intent.ts`) — QR ไดนามิก · Beam webhook ยืนยันอัตโนมัติ (`src/lib/modules/pos/payment-webhook.ts`) · ยืนยันเองมี audit (ค่าตั้ง "ยืนยันเองต้องผู้จัดการ") · สลิปโอนแนบเป็นหลักฐาน + ตรวจสลิปตามผู้ให้บริการ (`src/lib/modules/pos/payment-slip.ts` · `src/lib/modules/pos/slip-verify.ts`)
- PIN พนักงาน 4–6 หลัก (scrypt · ล็อก 15 นาทีหลังผิด 5 ครั้ง) สลับคนขายโดยไม่ logout · เกินสิทธิ์ = PIN ผู้จัดการ หรือคำขออนุมัติ POS_VOID/POS_REFUND/POS_DISCOUNT_OVER ผ่าน approval core (`src/lib/modules/pos/staff-pin.ts` · `src/lib/modules/pos/pos-approval.ts`)
- จอสำเร็จ → ใบเสร็จ 58/80 มม. (พิมพ์จากเบราว์เซอร์ · ESC/POS ผ่าน USB/Bluetooth/ตัวช่วยพิมพ์ LAN · ลิ้นชักเด้ง · ใบกำกับอย่างย่อเมื่อจด VAT) + QR ใบเสร็จออนไลน์ `/r/<token>` (`src/lib/modules/pos/public-receipt.ts`)

## 2. Bills · refund (บิลวันนี้ · ยกเลิก · คืนเงิน)
- บิลวันนี้ `/pos/sales` (`src/lib/modules/pos/bills.ts`): ตาราง + ลิ้นชักบิล (รายการ · วิธีจ่าย · ไทม์ไลน์ · พิมพ์ซ้ำ = "สำเนา" + audit) · ขอบเขตสาขาตาม `posSalesReadScope` (`pos.sale.read` หรือ `pos.sale.create`)
- ยกเลิกทั้งบิล (`voidSale` · `pos.sale.void`): เฉพาะก่อนปิดกะของบิล และบิลที่ยังไม่มีใบคืน · outbox `pos.sale.voided` กลับรายการบัญชี/แต้ม/คูปอง/สต็อก/บัตร/มัดจำ/ค่าคอมฯ/ออเดอร์/รอบครัว
- คืนเงินบางส่วน/ทั้งบิล (`src/lib/modules/pos/refund.ts` · `pos.sale.refund`): เลือกบรรทัดจากยอดที่เหลือ · เหตุผลบังคับ · ใบคืน `PosSale` docType REFUND เลข CN ต่อสาขา/เดือน (`PosDocCounter`) · คืนตามวิธีจ่ายเดิมหลายช่อง (`src/lib/modules/pos/refund-tenders.ts`)
- ผลของการคืน = outbox `pos.sale.refunded` → ใบลดหนี้ + JV ตามสัดส่วน · รับของคืนที่ต้นทุนเดิม · ดึงแต้ม/ยอดสะสม/ตรา (`src/lib/modules/pos/refund-consumer.ts`) · คืนเงินสดต้องเปิดกะบนเครื่องนั้น
- ใบเสร็จออนไลน์ให้ลูกค้าแจ้งปัญหาบิล (`pos.receipt.issue_reported` → การ์ดบอร์ด) และขอใบกำกับเต็มรูป (`PosTaxInvoiceRequest` → ร้านอนุมัติ/ปฏิเสธ · `src/lib/modules/pos/receipt-issue.ts`)
- บิลออฟไลน์ที่ยังไม่ซิงก์ ยกเลิก/คืนเงินไม่ได้จนกว่าจะซิงก์ (§11)

## 3. Shifts (กะ · ลิ้นชัก · ปิดวัน)
- กะต่อเครื่อง (หลายกะพร้อมกันต่อสาขาได้) · เปิดกะ = เงินตั้งต้น + พนักงาน PIN · เครื่องที่เปิดกะอ่านจากคุกกี้เครื่องที่ลงนาม (`POS_DEVICE_KEY` · §11) · ผู้เขียนเดียว `src/lib/modules/pos/shift.ts`
- ระหว่างกะ: เงินเข้า-ออกลิ้นชัก (`PosCashMovement`) · รายงาน X สด · ปิดกะ = นับแจกแจงแบงก์ · ปิดแบบไม่เห็นยอดได้ · ผลต่างเกินเกณฑ์ต้องมีเหตุผล · Z แช่แข็ง (`PosShiftCounter`) · กะค้างถูกปิดอัตโนมัติแล้วผู้จัดการนับย้อนหลังได้ครั้งเดียว (`PosShiftRecount`)
- ค่าตั้ง: บังคับเปิดกะก่อนขาย (หน้าขาย / บิลจากระบบอื่น แยกกัน) · เงินสดนอกกะแยกรายงาน · เข้ากะตามตารางงาน HR + ถามลงเวลา (`src/lib/modules/pos/hr-link.ts`)
- outbox `pos.shift.opened` / `pos.shift.closed` → การ์ด "ตรวจเงิน" ในบอร์ด + โพสต์ Z ห้องทีม (`src/lib/pos-board-bridges.ts` · ปิดอยู่โดยปริยาย)
- ปิดวัน `/pos/close`: สรุปทุกกะของวันธุรกิจ (ตัดวันตามค่าตั้งของระบบ) · กระทบยอดเงินสด · CSV · ขอบเขตสาขาตาม `posSalesScope`

## 4. Products · prices · channels (แคตตาล็อกเดียว · ราคา · ช่องทางขาย)
- แคตตาล็อกเดียว `PosProduct` (ระดับระบบ POS · `unitId` null = ทุกสาขา · ผูก `InvItem` 1:1 เมื่อเป็นสินค้าคลัง · ชนิด PRODUCT/SERVICE/MENU/BUNDLE) — ผู้เขียน/ผู้อ่านเดียว `src/lib/modules/pos/catalog.ts` (`catalog.*` ใน facade) · backfill จาก MenuItem/ShopProduct = `scripts/pos-backfill-catalog.mts`
- ตัวเลือก/variant (กลุ่มตัวเลือกร้านอาหารใช้ซ้ำ) · ชุด/คอมโบ · สูตร/BOM ตัดวัตถุดิบในคลังตอนขาย + ส่วนต่างต่อตัวเลือก + ต้นทุนตามสูตร (`src/lib/modules/pos/recipe.ts`)
- ราคาเป็นชั้น: ฐาน → สาขา → ช่องทาง (`PosProductChannelPrice` · บวก % ทั้งช่องทางแล้วเขียนเป็นราคาตายตัว) → กติกาเวลา/โปร happy hour (`PosPriceRule` · `src/lib/modules/pos/price-rule.ts`) — ตัวคิดเดียว `resolvePrices` (`src/lib/modules/pos/price.ts`) ที่หน้าขาย/โต๊ะ/QR/เว็บร้าน/แชทใช้ร่วม
- ของหมด (86) ต่อสาขา จากหน้าสินค้า/จอครัว/สต็อก (`PosAvailabilityMark` · outbox `pos.product.availability` → ทุกช่องทาง)
- ช่องทางขายต่อสาขา (`SalesChannel` · `src/lib/modules/pos/channel.ts`): builtin STORE/QR_TABLE/WEB/CHAT/QR_ORDER · แพลตฟอร์ม LINEMAN/GRAB/FOODPANDA/SHOPEE/LAZADA/TIKTOK · ช่องทางของร้านเอง · ค่าคอมฯ สำเนาลงบิล → ค่าใช้จ่ายในบัญชีอัตโนมัติ (payout PLATFORM = ลูกหนี้แพลตฟอร์ม · DIRECT = ค่าคอมฯ ค้างจ่าย)
- หน้าสินค้า `/pos/products` ของผู้จัดการสาขาเดียว = โหมดสาขา (ตั้งราคาเฉพาะสาขาตัวเอง) · แคชเชียร์ = การ์ดปฏิเสธ

## 5. Tables · KDS · orders · QR (โต๊ะ · จอครัว · ออเดอร์ทุกช่องทาง · QR)
- โหมดโต๊ะ `/pos/tables` (`src/lib/modules/pos/table.ts` บนตารางร้านอาหารเดิม): ผังโซน/โต๊ะ · สถานะ · โต๊ะจองจากระบบจองแสดงบนผัง · สั่งเพิ่ม/ส่งครัว · ย้าย/รวมโต๊ะ · ใบรายการ · เช็คบิลเข้าจอชำระเดียวกัน
- แยกบิล 3 แบบ ITEM/EQUAL/SEAT (`src/lib/modules/pos/table-split.ts` · `PosTableSplit*`)
- จอครัว `/pos/kds` (`src/lib/modules/pos/kds.ts`): สถานี · ใหม่/กำลังทำ/พร้อม · เวลา/เร่ง · ช่องทาง · ตัวนับทั้งวัน · 86 จากครัว · ใบครัวพิมพ์ต่อสถานีเมื่อไม่ใช้จอ
- จอออเดอร์ทุกช่องทาง `/pos/orders` (`PosOrder*` · ผู้เขียนเดียว `src/lib/modules/pos/order.ts` · `orders.*` ใน facade): NEW → ACCEPTED → PREPARING → READY → COMPLETED (+ REJECTED/CANCELLED) · เวลาเตรียม · พักรับต่อช่องทาง · รับอัตโนมัติ · ออเดอร์เว็บร้านเข้าทางประตูระบบใน tx ของเว็บร้าน
- แพลตฟอร์มภายนอก: adapter MANUAL (พนักงานคีย์จากแท็บเล็ตแพลตฟอร์ม) ใช้ได้วันนี้ · โครง adapter จริง (`src/lib/modules/pos/platform/registry.ts` · credentials เข้ารหัส `src/lib/modules/pos/integration-creds.ts`) รอสิทธิ์ partner API ของเจ้าของ (`docs/pos/PLATFORM-SETUP.md`)
- QR: สั่งที่โต๊ะ `/q/t/<qrToken>` (เรียกพนักงาน `src/lib/modules/pos/qr-staff.ts`) · ลิงก์สั่งล่วงหน้าจ่ายก่อน `/q/<linkToken>` → สถานะ `/q/o/<orderToken>` (`src/lib/modules/pos/qr-order.ts`) — จ่ายก่อน = สถานะชำระของออเดอร์ PENDING_PAYMENT → PREPAID → PAID · เลยเวลาจ่าย = ออเดอร์ CANCELLED (ไม่มีบิลค้างรอเงิน)

## 6. Customer display (จอลูกค้า · จอที่ 2)
- หน้า `/d` (`src/app/(store)/d/page.tsx`) บนแท็บเล็ตหันหาลูกค้า (1280×800 · 1024×768) — ผู้เขียนเดียว `src/lib/modules/pos/display.ts` (`PosCustomerDisplay`)
- จับคู่จากตั้งค่า › เครื่อง: รหัส 8 ตัว Crockford อายุ 10 นาที + QR → โทเคน 32 ไบต์ในคุกกี้ httpOnly ของหน้า `/d` (เก็บแต่ sha256 · เพดาน 10 ครั้ง/นาที/IP)
- หน้าขาย publish ภาพบิล (ตะกร้า · ยอด · แต้มที่จะได้ · QR ใบขอรับเงินของเครื่องนี้ · ลิงก์ใบเสร็จ) — ของที่เกี่ยวกับเงินเซิร์ฟเวอร์สร้างเอง ไม่เชื่อ client
- ค่าตั้งจอ: แสดงแต้ม · ข้อความหน้าพัก · ภาษา · ยกเลิกการจับคู่ (ยืนยันก่อน)
- ข้อสอบ = `scripts/qc-pos-p2.10.mts`

## 7. Multi-branch (หลายสาขา)
- ระบบ POS หนึ่งระบบผูกหลายสาขา (BusinessUnit) · ทุกคิวรีกรอง tenantId + systemId + unitId · คนจำกัดสาขาเห็นเฉพาะสาขาของตัวเอง (`src/lib/modules/pos/access.ts` · deciders `posSalesScope` `posRegisterView` `posOrdersView` `posKdsView` `posCanSetTenantPrice`)
- แคตตาล็อกใช้ร่วมทั้งระบบ · ราคา/ช่องทาง/86 ต่อสาขา · สต็อกต่อสาขาผ่านคลังของสาขา · กะ/เลขใบเสร็จ/เลข CN ต่อสาขา
- ข้อมูลสาขาบนใบเสร็จ (สาขาที่ 00001 · ที่อยู่/โทร · พร้อมเพย์ของสาขาก่อนของร้าน) — แก้ได้เฉพาะ OWNER หรือคนที่เข้าได้ทุกสาขา (`src/lib/modules/pos/receipt-settings.ts`)
- รายงานรวม/แยกสาขา + เปรียบเทียบสาขา · ผู้จัดการสาขาเดียวได้โหมดสาขาที่หน้าสินค้า
- ข้อสอบ = `scripts/qc-pos-p2.11.mts` · สิทธิ์หน้า = `scripts/qc-hf-pos-page-authz.mts`

## 8. Reports (รายงาน)
- `/pos/reports` (`src/lib/modules/pos/reports.ts` · `REPORT_KINDS` 13 ชุด): daily · products · staff · payments · margin · shifts · tax · channels · branches · hourly · anomalies · commission (ผู้ดูเงินเดือนเท่านั้น) · credit (ลูกหนี้วางบิล)
- ภาพรวม KPI/กราฟ/สาขา/ขายดี/วิธีจ่าย/พนักงาน (`src/lib/modules/pos/report-overview.ts`) · ตัดวันตามเขตเวลา/เวลาตัดวันของร้าน · ช่วงสูงสุด 92 วัน
- ส่งออก CSV (ตัวเลขเดียวกับ JSON) · แบบพิมพ์ `/pos/reports/print` (`src/app/app/sys/[id]/pos/reports/print/page.tsx`)
- จุดผิดปกติของพนักงาน (ส่วนลดสูง · ยกเลิก/คืนบ่อย · พิมพ์สำเนาซ้ำ ฯลฯ ตามเกณฑ์ที่ร้านตั้ง) ต้องมี `pos.report.anomaly` คู่ `pos.report.view` (PDPA)
- REST เปิด 12 ชุดผ่าน `/reports/*` (commission/credit ไม่เปิด) · ข้อสอบ `scripts/qc-pos-p1.17.mts` · `scripts/qc-pos-p2.12.mts`

## 9. REST API `/api/v1/pos`
- สัญญาที่สร้างจากทะเบียน = `docs/api/POS-API.md` (generator `scripts/gen-pos-api-docs.mts` · `--check` ในด่าน) · OpenAPI `GET /api/v1/pos/openapi.json` · หน้าคนอ่าน `/developers/pos`
- ทะเบียน op 49 ตัว 9 กลุ่ม (`src/lib/modules/pos/api/registry.ts` · `src/lib/modules/pos/api/ops/*`): /units · /sales · /products · /channels · /orders · /shifts · /devices · /reports · /sync — ทุก op ประกาศผ่าน `definePosOp` (`src/lib/modules/pos/api/op.ts`) พร้อม scope · input zod · ป้ายไทย
- คีย์ API ของร้าน 3 ชุดซ้อนกัน `pos-read` ⊂ `pos-operate` ⊂ `pos-admin` (`src/lib/api-keys/scopes.ts`) · ไม่มีชุดไหนถือ pos.settings.* / PIN / กะ — งานพวกนี้ทำบนจอเท่านั้น
- กติกา: เงินสตางค์ · `Idempotency-Key` ทุก write (replay 24 ชม.) · อันตราย (void/refund/archive/cancel) ต้อง `confirm: true` + เหตุผล · คำตอบผิดพลาดมี `error.code` + `message_th` · เพดานต่อคีย์ 300 อ่าน / 60 เขียน / 30 รายงาน ต่อนาที
- ผู้ช่วย AI ใช้ op เดียวกัน (`src/lib/modules/pos/api/tools.ts` — อ่านรันทันที · เขียน = ข้อเสนอให้คนยืนยัน) · สกิล `skills/shark-pos-api/SKILL.md` (คัดไปบ้านด้วย `scripts/sync-skills.sh`)

## 10. Integrations (การเชื่อม 13 การ์ด)
- หน้า ตั้งค่า › การเชื่อมต่อระบบ SHARK แสดงการ์ด 13 ใบจาก `src/lib/pos-integrations.ts` (`POS_INTEGRATION_CODES`) · สถานะ LINKED/OFF/NO_SYSTEM/PLANNED + ข้อเท็จจริงสด · ไม่เชื่อมก็ขายได้ · ผลข้างเคียงวิ่ง outbox
- MEMBER (ยอดสะสม · ระดับ · ไทม์ไลน์ · สมัครจากหน้าขาย) · POINT (ได้แต้ม/ใช้แต้มใน tx/ย้อนตอนคืน) · COUPON (คูปอง/ว่อชเชอร์) · REWARD (แลกรางวัลที่จอชำระ)
- ACCOUNT (บิล/คืน/ยกเลิก → GL · ใบกำกับอย่างย่อ/เต็มรูป · ค่าคอมฯ แพลตฟอร์ม · ทิป · บัตร · วางบิล → ใบแจ้งหนี้ · `src/lib/modules/pos/account-bridge.ts`) · INVENTORY (ตัดสต็อก/BOM · คืนสต็อก · ตรวจนับ · ข้อเสนอสั่งซื้อ)
- HR (ตารางงาน → ใครเปิดกะได้ · ชั่วโมงจากกะ · ค่าคอมฯ พนักงานขาย → งวดเงินเดือน · `src/lib/modules/pos/staff-commission.ts`) · CRM (บิลผูกดีล · บริษัท/วางบิล · `src/lib/modules/pos/crm-link.ts`)
- CHAT (ใบเสร็จ/คืนเงิน/สถานะออเดอร์ในแชท · ขอชำระในแชท · `src/lib/pos-chat-bridges.ts`) · KANBAN (ตรวจเงินกะ · ของหมดนาน · ออเดอร์ต้องคืนเงิน · บิลยกเลิก · `src/lib/pos-board-bridges.ts`)
- MARKETING (โปร/happy hour · ผลแคมเปญจากบิล) · BOOKING (ปิดงานจองออกบิล · โต๊ะจองบนผัง) · AI (สรุปเช้า · ข้อเสนอสั่งซื้อ · tool ของผู้ช่วย — §12)
- e-Tax/ตรวจสลิป/แพลตฟอร์ม = ผู้ให้บริการภายนอกที่เจ้าของเลือก (credentials เข้ารหัส AES-256-GCM `src/lib/modules/pos/secret-box.ts` · W-items ใน `ledger/POS-OWNER-PENDING.md`)

## 11. Offline · sync · devices · print relay
- ขายออฟไลน์ (P3.4): เจ้าของเปิดที่ ตั้งค่า › ออฟไลน์และการซิงก์ (`src/lib/modules/pos/offline-shared.ts`) · เน็ตหลุดขายต่อด้วยเงินสด/โอน · เลขชั่วคราว `OFF-<เครื่อง>-<n>` · ห้ามแต้ม/คูปอง/บัตรของขวัญตอนออฟไลน์ · อย่าปิด/รีเฟรชหน้าขาย
- ซิงก์ (`src/lib/modules/pos/offline-sync.ts` · route session `src/app/api/pos/sync` · REST `POST /sync/sales` สำหรับแอป/คีออสก์ภายนอก · `pos.offline.sync`): คิดราคา ณ soldAt หรือ snapshot ราคาของเครื่อง (`PosOfflineSnapshot`) · ตรวจนาฬิกา/กะ/เครื่อง/ผู้ขาย · ผลรายบิล OK/DUPLICATE/REJECTED → คิวผู้จัดการที่หน้ากะ (`PosOfflineSale`)
- เครื่องขาย (`PosDevice` · `src/lib/modules/pos/device.ts`): ลงทะเบียน/เพิกถอนโดย `pos.device.manage` (ปริยาย 3 เครื่อง ACTIVE ต่อสาขา) · จับคู่เบราว์เซอร์ด้วยคุกกี้ HMAC ที่ลงนามด้วย env `POS_DEVICE_KEY` (ไม่ตั้ง = จับคู่ไม่ได้ · `src/lib/modules/pos/device-cookie.ts`) · เปิดกะ/X อ่านเครื่องจากคุกกี้เท่านั้น
- ตัวช่วยพิมพ์ LAN สำหรับ iPad (`PosPrintAgent`/`PosPrintJob` · `src/lib/modules/pos/print-relay.ts` · สคริปต์ร้าน `tools/pos-print-agent/agent.mjs` ต่อออกมาหาเรา · ไบต์ ESC/POS ≤ 256 KB · หมดอายุ 10 นาที · ล้างไบต์เมื่อจบงาน)
- หน้าสาธารณะมีเพดานอัตราต่อ IP (`src/lib/modules/pos/public-rate.ts`) · โทเคนใบเสร็จ 12 ตัว Crockford · โทเคน QR โต๊ะ 128 บิต

## 12. AI (ผู้ช่วย AI และอัตโนมัติ)
- สรุปเช้า (Daily Brief · `src/lib/modules/pos/ai-brief.ts`): ส่งรายผู้รับ (เจ้าของ + ผู้จัดการที่เลือก) ตามชั่วโมงที่ตั้ง · อ่านผ่านตัวอ่านรายงานด้วยสิทธิ์ของผู้รับแต่ละคน · ไม่ใช้ LLM · ไม่มีข้อมูลเงินเดือน
- ข้อเสนอสั่งซื้อจากยอดขาย 14 วัน (`src/lib/modules/pos/ai-insights.ts`) → ร่าง PO (DRAFT) ผ่าน facade คลัง · แผง AI ที่หน้ารายงาน (`src/lib/modules/pos/ai-panel-actions.ts`)
- tool ของผู้ช่วย AI = op ของ REST ที่ประกาศ `tool` (`src/lib/modules/pos/api/tools.ts`): อ่านรันด้วยสิทธิ์ของคนถาม · เขียน/อันตราย = ข้อเสนอ `pos.<op id>` ให้คนกดยืนยัน
- กฎอัตโนมัติ (AutomationRule) และ webhook ของร้านรับทุก event `pos.*` (`withAutomation` ใน `src/lib/outbox-consumers.ts`)
- ข้อสอบ = `scripts/qc-pos-p3.9.mts`

## 13. Permissions (คีย์ `pos.*` 24 คีย์)
ที่มา `src/lib/core/permissions.ts` (โมดูล pos) · ตัดสินด้วย `evaluate` ใน `src/lib/core/rbac.ts`: OWNER ผ่านทุกอย่าง · MANAGER ผ่านทุกคีย์ในสาขาที่ดูแล · STAFF ต้องได้คีย์นั้น (หรือ `pos.*`) · REST ใช้คีย์เดียวกันเป็น scope ของคีย์ API (`src/lib/api-keys/scopes.ts`) · ตารางสิทธิ์ทุกพื้นผิว = `scripts/pos-authz-matrix.json`

| คีย์ | เปิดให้ทำอะไร | บทบาทปริยาย |
|---|---|---|
| `pos.sale.create` | เปิดหน้าขาย/โต๊ะ · ขายบิล · รับเงินออเดอร์ · ปิดวัน · 86 · จอลูกค้า | เจ้าของ · ผู้จัดการ · พนักงานที่ได้รับ (แคชเชียร์) |
| `pos.sale.read` | ดูบิลวันนี้ · พิมพ์ใบเสร็จ/สำเนา (ผู้มีสิทธิ์ขายอ่านได้โดยนัย) | เจ้าของ · ผู้จัดการ · พนักงานที่ได้รับ |
| `pos.sale.void` | ยกเลิกทั้งบิลก่อนปิดกะ · ยกเลิกออเดอร์ที่มีบิล | เจ้าของ · ผู้จัดการ (พนักงาน = PIN ผู้จัดการ/คำขออนุมัติ) |
| `pos.sale.refund` | คืนเงินบางส่วน/ทั้งบิล (ใบลดหนี้) | เจ้าของ · ผู้จัดการ (พนักงาน = PIN ผู้จัดการ/คำขออนุมัติ) |
| `pos.sale.priceOverride` | รายการกำหนดเอง · ราคาเปิด · แก้ราคาในบิล | เจ้าของ · ผู้จัดการ |
| `pos.sale.manage` | ใช้บิลพัก/ส่วนลดที่อนุมัติแล้วของพนักงานคนอื่น | เจ้าของ · ผู้จัดการ |
| `pos.shift.operate` | เปิด/ปิดกะของตัวเอง · เงินเข้า-ออกลิ้นชัก · รายงาน X | เจ้าของ · ผู้จัดการ · พนักงานที่ได้รับ |
| `pos.shift.manage` | ปิดกะของคนอื่น · Z/ประวัติกะ · เงินสดนอกกะ · ยืนยันรับเงินเอง (เมื่อร้านตั้งให้ต้องผู้จัดการ) | เจ้าของ · ผู้จัดการ |
| `pos.product.manage` | เพิ่ม/แก้/เก็บสินค้าและหมวด · ตัวเลือก · สูตร | เจ้าของ · ผู้จัดการ |
| `pos.product.setPrice` | ตั้งราคาขาย (ทั้งร้านหรือเฉพาะสาขาที่ดูแล) | เจ้าของ · ผู้จัดการ |
| `pos.price.rule` | โปรราคา · happy hour | เจ้าของ · ผู้จัดการ |
| `pos.channel.manage` | ตั้งค่าช่องทางขาย/ค่าคอมฯ · ลิงก์สั่งล่วงหน้า · credentials แพลตฟอร์ม | เจ้าของ · ผู้จัดการ |
| `pos.order.accept` | รับ/เตรียม/พร้อม/ส่งมอบออเดอร์ · เวลาเตรียม · พักรับช่องทาง | เจ้าของ · ผู้จัดการ |
| `pos.order.reject` | ปฏิเสธ/ยกเลิกออเดอร์ (มีบิลแล้วต้องมีสิทธิ์ยกเลิกบิลด้วย) | เจ้าของ · ผู้จัดการ |
| `pos.report.view` | รายงานทุกชุด · CSV · แบบพิมพ์ · สรุปเช้า | เจ้าของ · ผู้จัดการ |
| `pos.report.anomaly` | รายงานจุดผิดปกติของพนักงาน (ต้องมีคู่กับสิทธิ์ดูรายงาน) | เจ้าของ · ผู้จัดการ |
| `pos.stock.count` | ตรวจนับสต็อกจากหน้าขาย (เปิดรอบ · สแกน/กรอก · ยกเลิกรอบของตัวเอง) | เจ้าของ · ผู้จัดการ · พนักงานที่ได้รับ |
| `pos.device.manage` | ลงทะเบียน/เพิกถอนเครื่องขาย · เครื่องพิมพ์ · จอลูกค้า · ตั้งค่าใบเสร็จ | เจ้าของ · ผู้จัดการ |
| `pos.staff.manage` | ตั้ง/ปลดล็อก PIN ของพนักงานคนอื่นในสาขา | เจ้าของ · ผู้จัดการ |
| `pos.taxinvoice.issue` | ออกใบกำกับภาษีเต็มรูป · อนุมัติ/ปฏิเสธคำขอจากใบเสร็จออนไลน์ | เจ้าของ · ผู้จัดการ |
| `pos.settings.manage` | ตั้งค่าหน้าขาย (ทั่วไป · พนักงานและสิทธิ์ · การเชื่อมต่อ · คีย์ API) | เจ้าของ · ผู้จัดการ |
| `pos.settings.payment` | ตั้งค่าวิธีรับเงิน (สวิตช์ทิป/มัดจำ/เครดิตเป็นของเจ้าของร้าน) | เจ้าของ (ผู้จัดการผ่านบทบาท) |
| `pos.offline.sync` | ซิงก์บิลออฟไลน์ผ่าน REST (คีย์ของแอป/คีออสก์ภายนอก · หน้าขายของร้านไม่ต้องใช้) | คีย์ API ชุด `pos-admin` |
| `pos.credit.manage` | วงเงิน/เทอมลูกค้าเครดิต (วางบิล) · อนุญาตเกินวงเงิน · เห็นวงเงินที่หน้าขาย | เจ้าของ · ผู้จัดการ |

- หน้าที่มีการ์ดปฏิเสธ (หน้า 200) แทน 404: สต็อก · กะ · รายงาน · ตั้งค่า (บางแท็บ) · โต๊ะ · ออเดอร์ · จอครัว · โปรราคา · คู่มือ — หมุดสิทธิ์หน้าที่ `scripts/qc-hf-pos-page-authz.mts` / sweep `scripts/pos-visual-sweep.json` refusals

---

## ภาคผนวก — v1 design notes (สเปกเดิมก่อนสร้าง · ก.ค. 2569)

> สเปกที่เขียนก่อนสร้าง POS ใหม่ (SPEC FINAL 11 ก.ค. 2569) — เก็บไว้เฉพาะส่วนที่ยังเป็นเจตนาของระบบ: ภาพรวม/บทบาทของ `createSale` (contract 2.1) · persona · รายการฟังก์ชัน · ลำดับงานธุรกิจ · สัญญาการเชื่อม · รายงาน · edge cases · QC checklist
> ส่วนที่แทนที่แล้ว (§4 Data Model · §5 API · §6 UI · §9 Permissions) เหลือเป็นตัวชี้ · เลขหัวข้อเดิม (§1–§12) คงไว้ให้ข้อสอบเก่าที่อ้าง "14-pos.md §x" ยังหาเจอ · เมื่อขัดกับหมวด V2 ด้านบนหรือโค้ด ให้ถือหมวด V2/โค้ด · ฉบับเต็มเดิม = `git show 6c2352f7:docs/modules/14-pos.md`

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md D1,D2,D3,D4,D5,D6,D7,D8,D9,D12,D17 (2026-07-11)
> ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> สถานะเอกสาร: SPEC FINAL — พร้อม implement (Phase 1 ตาม roadmap)
> ⚠️ **โมดูลนี้คือ "จุดตัดเงินกลาง" ของทั้งแพลตฟอร์ม** — POS เป็น **ผู้ให้บริการ (provider) ของ contract 2.1** ทุกโมดูลที่รับเงิน (Hotel folio, Restaurant order, Booking, Ticket) ต้องชำระเงินผ่าน `createSale` ของโมดูลนี้เท่านั้น ห้ามมีโมดูลไหนออกใบเสร็จ/ตัดเงิน/ยิงแต้ม/ลงบัญชีเอง

---

### 1. ภาพรวม + ขอบเขต

#### 1.1 POS คืออะไรใน SHARK

POS ทำหน้าที่ 2 ชั้นพร้อมกัน:

| ชั้น | คืออะไร | ใครใช้ |
|---|---|---|
| **(ก) Sale service กลาง** | business logic ชั้น `lib/modules/pos/sale-service.ts` — รับคำสั่งขาย → validate → ส่วนลด/คูปอง → VAT → รับชำระหลายวิธี → ออกเลขใบเสร็จ → ยิงแต้ม/ลงบัญชี → คืน `saleId/receiptNo` | โมดูล Hotel / Restaurant / Booking / Ticket เรียกแบบ **in-process function call** + Register UI เรียกผ่าน API |
| **(ข) POS Register UI** | หน้าขายหน้าร้านสำหรับ unit ประเภท `SHOP` (และ unit อื่นที่เปิดใช้ POS) — grid สินค้า, ตะกร้า, ชำระเงิน, พิมพ์ใบเสร็จ, กะ, สต็อก | แคชเชียร์ / เจ้าของร้าน |

```
Hotel folio ──┐
Restaurant ───┤
Booking ──────┼──► posSaleService.createSale()  ──► PosSale 
Ticket ───────┤         │
Register UI ──┘         ├─► coupon.validate/redeem (2.3)
                        ├─► point.quoteBurn/burn (2.2 — ใช้แต้มเป็นส่วนลด ใน tx)
                        ├─► point.earn (2.2, outbox — Point คำนวณแต้มจากยอดเงิน)
                        ├─► account.postSale/postRefund/postVoid (2.4 facade — POS ไม่รู้ account code)
                        ├─► member.recordSpend + activity.log (2.6/2.7, outbox)
                        └─► notify e-receipt (2.5)
```

#### 1.2 ทำอะไรใน v1 (MVP ✅)

- ✅ Sale service กลางเต็มรูป: createSale / voidSale / refundSale + เลขใบเสร็จรันต่อ unit + idempotency
- ✅ **PENDING_PAYMENT sale + `PosPaymentIntent`** (D1): ขายออนไลน์แบบรอเงินเข้า (PromptPay QR / โอนแนบสลิป, expireAt) — ยืนยันเงินเข้า v1 = staff/FINANCE กดยืนยันสลิป (idempotent ด้วย paymentRef) → emit `pos.sale.paid` · หมดอายุ → `pos.sale.expired`
- ✅ Split payment ในบิลเดียว: CASH / TRANSFER (แนบสลิป) / PROMPTPAY (dynamic QR + ยืนยันโดยพนักงาน) / DEPOSIT (หักมัดจำ อ้าง refSaleId — D2) / ROOM_CHARGE (ลงบิลห้องพัก — D12)
- ✅ **ใช้แต้มเป็นส่วนลด** (D5 — จุดขายแพลตฟอร์ม): `burnPoints` ใน createSale → `point.quoteBurn` พรีวิว + `point.burn` ใน tx
- ✅ Register UI: grid สินค้า+หมวด, barcode scan, ค้นหา, ตะกร้า, ส่วนลดรายบรรทัด+ท้ายบิล (จำกัดสิทธิ์), ผูกสมาชิก, พักบิล/เรียกคืน, เงินทอน
- ✅ ใบเสร็จ: พิมพ์ 58/80mm (ESC/POS), e-receipt (ลิงก์+อีเมล), ใบกำกับภาษีอย่างย่อ, เก็บข้อมูลใบกำกับภาษีเต็มรูปส่งต่อโมดูล Account
- ✅ สินค้า: SKU/barcode/ราคา/รูป/หมวด/หน่วยนับ/ต้นทุน + variants แบบ simple (1 ชั้น)
- ✅ สต็อก: movement ledger (รับเข้า/ขาย/คืน/ปรับ), ตรวจนับ (stock count), แจ้งเตือน low stock
- ✅ กะ: เปิด-ปิดกะ + float เงินตั้งต้น, cash drawer count, over/short, X/Z report, บังคับปิดกะข้ามวัน
- ✅ หลายเครื่อง: device registration ต่อ unit, ขายพร้อมกันไม่ชนเลขใบเสร็จ (sequence ใน transaction)
- ✅ รายงาน: ยอดขายรายวัน, สินค้าขายดี, ต่อพนักงาน, ต่อวิธีชำระ, กำไรขั้นต้น (cost snapshot)

#### 1.3 ไม่ทำใน v1 (🔜 Phase ถัดไป)

- 🔜 บัตรเครดิต/เดบิต ผ่าน gateway (Beam/Omise/Stripe) — v1 มี enum `CARD` รองรับ schema แล้ว แต่ UI ยังไม่เปิด
- 🔜 Gateway webhook auto-confirm PaymentIntent (PromptPay/บัตร) — v1 ยืนยันเงินเข้าด้วยคน (interface รองรับ webhook แล้ว — D1)
- 🔜 payMethod `VOUCHER` — ตัดออกจาก v1 ตาม D4 (voucher v1 = ส่วนลดผ่าน `coupon.redeem` จุดเดียว) — enum คงไว้ใน schema เปิดใช้พร้อมระบบขาย gift voucher
- 🔜 **Offline mode** — v1 **online-only ชัดเจน** (ดูแนวทางที่วางไว้ ข้อ 11.9)
- 🔜 โอนสต็อกระหว่าง unit (`TRANSFER_OUT/TRANSFER_IN` — enum + schema รองรับแล้ว, UI ยังไม่ทำ)
- 🔜 Variants หลายมิติ (matrix สี×ขนาด), หน่วยนับทศนิยม (ชั่งน้ำหนัก), serial/lot number
- 🔜 Manager PIN approve ส่วนลดเกินสิทธิ์หน้าจอ (v1 = block ให้ manager login เอง)
- 🔜 Cash rounding (ปัดเศษสตางค์เงินสด), promotion engine (ซื้อ 1 แถม 1), ราคาหลายระดับ (tier price)
- 🔜 Customer display (จอลูกค้า), เครื่องชั่งต่อตรง, ลิ้นชักเงินสั่งเปิดอัตโนมัติผ่าน print pulse (รองรับผ่าน printerConfig แต่ไม่ block v1)

#### 1.4 ตำแหน่งใน BusinessUnit

- POS เป็น unit-scoped เต็มรูป: สินค้า/สต็อก/กะ/เครื่อง/เลขใบเสร็จ **แยกต่อ unit** — ร้านอาหารสาขา 1 กับสาขา 2 มีสต็อกและเลขใบเสร็จของตัวเอง
- unit ประเภท `SHOP` = ใช้ POS เดี่ยวๆ เป็นโมดูลหลัก · unit ประเภท `RESTAURANT`/`HOTEL`/`BOOKING`/`TICKET` = ใช้ Sale service ของ POS เป็นจุดชำระเงิน (Register UI เปิด/ปิดได้ต่อ unit)
- Member/Point/Coupon เป็น tenant-level: ลูกค้าคนเดียวสะสมแต้ม/ใช้คูปองข้ามทุก unit ได้ — POS ส่ง `unitId` ไปกับทุก event เพื่อ tag ที่มา

---

### 2. Persona & User Stories

| Persona | บทบาท | User Stories หลัก |
|---|---|---|
| **เจ้าของร้าน (OWNER)** | เห็นทุก unit | "ผมอยากเห็นยอดขายวันนี้ของทุกสาขาในจอเดียว และเจาะดูว่าสาขาไหนขายอะไรดี" · "อยากรู้ว่ากะเมื่อคืนเงินขาดไหม" · "อยากตั้งราคาสินค้า/VAT เอง" |
| **ผู้จัดการสาขา (MANAGER)** | คุม 1 unit เต็มสิทธิ์ | "ฉันเปิด-ปิดกะ อนุมัติ void/refund และรับของเข้าสต็อกได้" · "ฉันปรับสต็อกหลังตรวจนับได้" · "ฉันให้ส่วนลดพิเศษเกินสิทธิ์แคชเชียร์ได้" |
| **แคชเชียร์ (STAFF — pos.sale)** | หน้าจอขายเท่านั้น | "ฉันสแกนบาร์โค้ด กดหมวด ค้นหาสินค้า ขายให้เร็วที่สุด" · "ลูกค้าจ่ายเงินสด 1,000 ระบบต้องบอกเงินทอนทันที" · "ลูกค้าขอจ่ายครึ่งสด ครึ่งโอน ต้องทำได้ในบิลเดียว" · "ลูกค้าบอกเบอร์โทรสมาชิก ฉันผูกบิลให้ได้แต้ม" · "โต๊ะข้างๆ เรียก ฉันพักบิลนี้ไว้ก่อนแล้วค่อยเรียกคืน" |
| **พนักงานสต็อก (STAFF — pos.stock)** | จัดการสินค้า/สต็อก | "ของเข้าตอนเช้า ฉันบันทึกรับเข้าพร้อมต้นทุน" · "สิ้นเดือนฉันตรวจนับแล้วให้ระบบปรับยอดพร้อมเหตุผล" |
| **ลูกค้า (Customer)** | ปลายทางใบเสร็จ | "ฉันขอใบเสร็จทางอีเมล ไม่เอากระดาษ" · "ฉันแสดง QR สมาชิกให้ร้านสแกนเพื่อรับแต้ม" · "ฉันขอใบกำกับภาษีเต็มรูปในนามบริษัท" |
| **โมดูลอื่น (system)** | ผู้เรียก contract 2.1 | "Hotel ปิด folio ห้อง 204 → เรียก createSale แล้วได้ receiptNo กลับไปแปะใน folio" · "Ticket ขายตั๋วออนไลน์ → createSale แบบไม่มีกะ ไม่มีเครื่อง" |

---

### 3. ฟังก์ชันทั้งหมด (Feature List)

#### 3.1 Sale service กลาง (contract 2.1) — หัวใจของโมดูล

| # | ฟีเจอร์ | MVP |
|---|---|---|
| S1 | `createSale()` เต็ม flow: validate → discount → coupon → burn แต้ม → total → VAT → split payment → receiptNo → (outbox) earn/account/member/activity (ดู flow 7.1 — ลำดับตาม `_CONVENTIONS` 2.1) | ✅ |
| S2 | Idempotency: `idempotencyKey` ต่อคำขอ — ยิงซ้ำได้ผลเดิม ไม่เกิดบิลซ้ำ | ✅ |
| S3 | เลขใบเสร็จรันต่อ unit ต่อเดือน (`PosReceiptCounter` + `SELECT ... FOR UPDATE` ใน transaction) หลายเครื่องขายพร้อมกันไม่ชน | ✅ |
| S4 | Split payment หลายวิธีในบิลเดียว (เช่น เงินสด 300 + โอน 200) ผลรวมต้องเท่า grandTotal เป๊ะ | ✅ |
| S5 | `voidSale()` — ยกเลิกทั้งบิล (ก่อนปิดกะ/Z) พร้อม reverse ทุก side effect | ✅ |
| S6 | `refundSale()` — คืนเงินบางส่วน/ทั้งบิล เป็น **เอกสารใหม่** (docType REFUND) อ้างใบเดิม | ✅ |
| S7 | เอกสารเงิน immutable — ไม่มี UPDATE บรรทัดขาย/ยอดเงินหลัง commit, แก้ = void/refund ออกใบใหม่ | ✅ |
| S8 | รองรับ `sourceModule` ต่างชนิด: POS ต้องมีกะเปิด · HOTEL/RESTAURANT/BOOKING/TICKET ไม่บังคับกะ/เครื่อง — แต่ถ้าชำระผ่านเครื่อง/เคาน์เตอร์ที่มีกะ OPEN ให้**ผูก `shiftId` เสมอ** (D17 — เงินสดเข้าลิ้นชักต้องเข้ากะ) | ✅ |
| S9 | VAT 3 โหมดต่อ unit: `INCLUDED` (default ไทย) / `EXCLUDED` / `NONE` (ไม่จด VAT) — อ่านจาก `unit.settings.account.*` ที่เดียว (D9) | ✅ |
| S10 | บันทึก `costSnapshot` ต่อบรรทัด ณ เวลาขาย เพื่อรายงานกำไรขั้นต้น | ✅ |
| S11 | Audit log ทุก action ที่แตะเงิน (create/void/refund/ปรับสต็อก/ปิดกะ) ลง `AuditLog` กลาง | ✅ |
| S12 | `paymentMode: PENDING_PAYMENT` + `PosPaymentIntent` + ยืนยันเงินเข้า manual (สลิป + paymentRef idempotent) + emit `pos.sale.paid` / `pos.sale.expired` (D1) | ✅ |
| S13 | Gateway webhook auto-confirm PaymentIntent (PromptPay/บัตร) — interface รองรับแล้ว | 🔜 |

#### 3.2 Register UI (หน้าขาย)

| # | ฟีเจอร์ | MVP |
|---|---|---|
| R1 | Grid สินค้า + แท็บหมวด + รูปสินค้า, เรียงตาม sortOrder/ขายดี | ✅ |
| R2 | Barcode scan (USB keyboard-wedge + กล้องมือถือ) → เพิ่มลงตะกร้าทันที, สแกนซ้ำ = qty+1 | ✅ |
| R3 | ค้นหาชื่อ/SKU (debounce, แสดงราคา+สต็อกคงเหลือ) | ✅ |
| R4 | ตะกร้า: แก้ qty, ลบบรรทัด, note ต่อบรรทัด, เลือก variant (sheet เลือกตอนกดสินค้าที่มี variant) | ✅ |
| R5 | ส่วนลดรายบรรทัด (บาท/%) + ส่วนลดท้ายบิล (บาท/%) — เกิน `maxDiscountBp` ของ role → block พร้อมข้อความ "เกินสิทธิ์ ให้ผู้จัดการทำรายการ" | ✅ |
| R6 | สินค้ากำหนดราคาเอง (open price เช่น "สินค้าเบ็ดเตล็ด") — ต้องมีสิทธิ์ `sale.priceOverride` | ✅ |
| R7 | ผูกสมาชิก: ค้นหาเบอร์โทร / สแกน QR บัตรสมาชิก (จากโมดูล Member) → แสดงชื่อ+tier+แต้มคงเหลือบนตะกร้า | ✅ |
| R8 | ใส่คูปอง: พิมพ์โค้ด/สแกน QR → เรียก `coupon.validate` แสดงส่วนลดทันที (ยัง**ไม่** redeem จนกว่าจ่ายเงินสำเร็จ) | ✅ |
| R9 | พักบิล (hold) พร้อมตั้งชื่อกำกับ + เรียกคืน (recall) จากทุกเครื่องใน unit เดียวกัน, หมดอายุสิ้นวัน | ✅ |
| R10 | จอชำระเงิน: เลือกวิธี, split ได้, เงินสดมีปุ่มลัดแบงก์ (100/500/1000/พอดี) + คำนวณเงินทอนตัวใหญ่ | ✅ |
| R11 | PromptPay dynamic QR (จำนวนเงินฝังใน QR, มาตรฐาน EMVCo จาก PromptPay ID ใน unit settings) → พนักงานเห็นเงินเข้าแล้วกด "ยืนยันรับเงิน" | ✅ |
| R12 | โอนธนาคาร: แสดงเลขบัญชีร้าน + แนบรูปสลิป (อัปโหลด) เก็บใน payment | ✅ |
| R13 | ใช้แต้มเป็นส่วนลดในจอชำระ (D5): แสดงแต้มคงเหลือของสมาชิก → กรอก/เลือกแต้มที่ใช้ → `point.quoteBurn` พรีวิวมูลค่าส่วนลดสด → burn จริงใน tx ตอนปิดบิล | ✅ |
| R13.1 | payMethod `ROOM_CHARGE` "ลงบิลห้องพัก" (D12): แสดงเฉพาะ tenant ที่มี unit type HOTEL สถานะ ACTIVE → เลือกห้อง/folio → เรียก `hotel.chargeToRoom()` | ✅ |
| R13.2 | Voucher เป็นวิธีชำระ (มูลค่าเงิน) — ตัดออกจาก v1 ตาม D4: voucher v1 = กรอกเป็น `couponCode` (validate/redeem/release ปกติ) · payMethod VOUCHER เปิดพร้อมระบบขาย gift voucher | 🔜 |
| R14 | หลังจ่าย: จอสรุป + เงินทอน + ปุ่ม พิมพ์ใบเสร็จ / ส่งอีเมล / แสดง QR e-receipt / ขายต่อทันที (auto-clear 5 วิ) | ✅ |
| R15 | ขอใบกำกับภาษีเต็มรูป: ฟอร์มชื่อ-เลขผู้เสียภาษี-สาขา-ที่อยู่ (จำจากสมาชิกเดิมถ้ามี) → แนบไปกับ sale ส่งต่อ Account | ✅ |
| R16 | ปุ่ม void บิลล่าสุดของตัวเอง (ภายในกะ, ต้องมีสิทธิ์) + ประวัติบิลวันนี้ | ✅ |
| R17 | โหมดเต็มจอ, ทำงานได้บน tablet (เป้าหมายหลัก) + desktop + mobile, ปุ่มใหญ่แตะง่าย, B&W minimal | ✅ |
| R18 | จอลูกค้า (customer display) แยกจอ | 🔜 |

#### 3.3 สินค้า + สต็อก

| # | ฟีเจอร์ | MVP |
|---|---|---|
| P1 | CRUD สินค้า: ชื่อ, SKU, barcode, ราคา (Int สตางค์), ต้นทุน, รูป, หมวด, หน่วยนับ, สถานะ | ✅ |
| P2 | หมวดสินค้า (1 ชั้น) + จัดลำดับ | ✅ |
| P3 | Variants simple: 1 สินค้ามีหลายตัวเลือก (เช่น "แดง/L") แต่ละตัวมี SKU/barcode/ราคา/สต็อกของตัวเอง — **ไม่ทำ matrix หลายมิติใน v1** | ✅ |
| P4 | เปิด/ปิด track stock ต่อสินค้า (บริการ/สินค้านับไม่ได้ = ไม่ track) | ✅ |
| P5 | Stock movement ledger append-only: RECEIVE / SALE / RETURN / ADJUST / COUNT (+ TRANSFER_OUT/IN 🔜) — ยอดคงเหลือ = cache ที่ derive จาก ledger | ✅ |
| P6 | รับของเข้า (receive) พร้อมต้นทุนต่อหน่วย → อัปเดต `cost` ล่าสุดของสินค้า | ✅ |
| P7 | ปรับสต็อก (adjust) ต้องใส่เหตุผล (ของเสีย/หาย/อื่นๆ) + audit log | ✅ |
| P8 | ตรวจนับ (stock count): สร้างรอบนับ → กรอกยอดนับจริง (สแกน/พิมพ์) → ระบบ diff → ยืนยัน = สร้าง movement COUNT ปรับให้ตรง | ✅ |
| P9 | Low stock: ตั้ง threshold ต่อสินค้า → badge บนหน้า list + การ์ดแจ้งเตือนบน unit dashboard + notify เจ้าของ (สรุปวันละครั้ง) | ✅ |
| P10 | นำเข้า/ส่งออกสินค้า CSV | ✅ |
| P11 | นโยบายสต็อกติดลบต่อ unit: `ALLOW_NEGATIVE` (default — ขายได้ แจ้งเตือน) / `BLOCK` (ห้ามขายเกินสต็อก) | ✅ |
| P12 | โอนสต็อกระหว่าง unit ใน tenant เดียวกัน | 🔜 |
| P13 | Serial/lot, วันหมดอายุ, เครื่องชั่ง | 🔜 |

#### 3.4 กะ / รอบขาย (Shift)

| # | ฟีเจอร์ | MVP |
|---|---|---|
| F1 | เปิดกะ: กรอก float เงินตั้งต้นในลิ้นชัก + ผูกเครื่อง (device) ที่เปิด | ✅ |
| F2 | 1 unit เปิดได้หลายกะพร้อมกัน (ต่อเครื่อง) — sale ผูก `shiftId` ของเครื่องที่ขาย | ✅ |
| F3 | X report (ระหว่างกะ ดูได้ตลอด ไม่ปิดยอด): ยอดขาย, จำนวนบิล, แยกวิธีชำระ, void, เงินสดที่ควรมีในลิ้นชัก | ✅ |
| F4 | ปิดกะ: นับเงินจริงในลิ้นชัก (ฟอร์มแจกแจงแบงก์/เหรียญ optional) → ระบบคำนวณ over/short → บันทึก + เหตุผลถ้าเกิน threshold | ✅ |
| F5 | Z report ตอนปิดกะ: snapshot immutable (JSON) + เลข Z รันต่อ unit — พิมพ์/ดูย้อนหลังได้ ตัวเลขไม่เปลี่ยนแม้ข้อมูลอื่นเปลี่ยน | ✅ |
| F6 | บังคับปิดกะข้ามวัน: กะเปิดค้าง > 24 ชม. → cron force-close (status `FORCE_CLOSED`, expectedCash จากระบบ, countedCash = null) + notify เจ้าของ · เครื่องนั้นเปิดกะใหม่ไม่ได้จนกว่ากะค้างถูกจัดการ | ✅ |
| F7 | ประวัติกะ + ดู Z report ย้อนหลัง + สรุป over/short รายเดือน | ✅ |
| F8 | Blind close (ไม่โชว์ expected ก่อนนับ — กันพนักงานนับให้ตรงเอง) เปิด/ปิดได้ใน settings | ✅ |

#### 3.5 เครื่อง/Terminal

| # | ฟีเจอร์ | MVP |
|---|---|---|
| D1 | ลงทะเบียนเครื่องต่อ unit: ตั้งชื่อ ("เคาน์เตอร์ 1") → ได้ `deviceCode` → เครื่องจำใน localStorage + ส่ง header ทุก request | ✅ |
| D2 | Revoke เครื่อง (เครื่องหาย/เลิกใช้) — request จากเครื่องที่ถูก revoke ถูกปฏิเสธ | ✅ |
| D3 | ตั้งค่าเครื่องพิมพ์ต่อเครื่อง: ขนาดกระดาษ 58/80mm, วิธีเชื่อม (browser print / WebUSB ESC-POS / print agent 🔜), พิมพ์อัตโนมัติหลังขาย on/off | ✅ |
| D4 | lastSeenAt heartbeat — หน้า devices เห็นว่าเครื่องไหน online | ✅ |
| D5 | จำกัดจำนวนเครื่องต่อ unit ตาม plan (`Tenant.limits.posDevices` default 3) | ✅ |

#### 3.6 ใบเสร็จ / เอกสาร

| # | ฟีเจอร์ | MVP |
|---|---|---|
| T1 | ใบเสร็จ 58/80mm: หัวบิล (โลโก้ B&W, ชื่อร้าน/unit, ที่อยู่, เลขผู้เสียภาษี), รายการ, ส่วนลด, VAT, วิธีชำระ+เงินทอน, แต้มที่ได้/คงเหลือ, footer ข้อความตั้งได้, QR e-receipt | ✅ |
| T2 | ร้านจด VAT: พิมพ์คำว่า "ใบกำกับภาษีอย่างย่อ" + เลขประจำเครื่อง POS ตามข้อกำหนดสรรพากร | ✅ |
| T3 | พิมพ์ผ่าน browser (CSS @media print, ความกว้างตามกระดาษ) — ทางเลือก default ที่ไม่ต้องลงอะไรเพิ่ม | ✅ |
| T4 | พิมพ์ ESC/POS ตรงผ่าน WebUSB/WebBluetooth (Chrome/Edge บน desktop+Android) | ✅ |
| T5 | Print agent ตัวเล็กสำหรับ iOS/เครื่องพิมพ์ LAN | 🔜 |
| T6 | e-receipt: หน้า public `/r/[token]` (token สุ่ม ไม่เดาได้) + ส่งอีเมลผ่าน notify (2.5) | ✅ |
| T7 | ใบกำกับภาษีเต็มรูป: POS เก็บข้อมูลผู้ซื้อ snapshot ไว้ที่ sale → ยิง posting + ส่งคำขอให้โมดูล Account ออกเอกสารเต็มรูป (เลขเอกสารฝั่ง Account) | ✅ |
| T8 | Reprint ใบเสร็จ (ประทับ "สำเนา") — audit log | ✅ |

#### 3.7 Offline-tolerant

- 🔜 **v1 = online-only เท่านั้น** — เน็ตหลุด: Register ขึ้น banner "ออฟไลน์ — รอเชื่อมต่อ" ตะกร้าที่ค้างอยู่ไม่หาย (state อยู่ในเครื่อง) แต่**กดชำระเงินไม่ได้**
- แนวทางที่วางไว้สำหรับ Phase ถัดไป (ออกแบบ schema รองรับแล้ว — ดู 11.9): local queue (IndexedDB) เก็บ sale ที่ค้าง → sync ขึ้นด้วย `idempotencyKey` เดิม → เลขใบเสร็จชั่วคราว `OFF-{deviceCode}-{n}` แล้ว reconcile เป็นเลขจริงตอน sync

---

### 4. Data Model — แทนที่แล้ว

โครงข้อมูลที่สร้างจริง (48 model ใน `prisma/schema/pos.prisma` + `prisma/schema/pos_order.prisma`) อยู่ที่ `docs/sds/modules/pos.md` · ร่าง Prisma ของสเปก v1 อ่านได้ที่ `git show 6c2352f7:docs/modules/14-pos.md` (§4)

---

### 5. API Endpoints — แทนที่แล้ว

REST ที่สร้างจริง = `docs/api/POS-API.md` (49 op · สร้างจากทะเบียน) · หน้าภายในใช้ server action (ตาราง `scripts/pos-authz-matrix.json`) · รายการ endpoint ของสเปก v1 อ่านได้ที่ `git show 6c2352f7:docs/modules/14-pos.md` (§5)

---

### 6. UI Screens — แทนที่แล้ว

หน้าจอที่สร้างจริงอยู่ใต้ `/app/sys/[id]/pos/*` (8 แท็บ · ดูหมวด V2 ด้านบน) ตามภาพ `ledger/design-pos/` · path `/app/u/[unitSlug]/pos/...` ของสเปก v1 ไม่ได้ใช้

---

### 7. Business Flows

#### 7.1 `createSale` — flow กลาง (contract 2.1) ⭐ สำคัญที่สุดของแพลตฟอร์ม

**Input (CreateSaleInput):**

```ts
{
  tenantId: string, unitId: string,
  sourceModule: 'POS'|'HOTEL'|'RESTAURANT'|'BOOKING'|'TICKET',
  sourceId?: string,              // folioId/orderId/bookingId — บังคับเมื่อ sourceModule ≠ POS
  staffUserId: string,            // ผู้ทำรายการ (ขายออนไลน์ = system user ของ unit)
  deviceId?: string, shiftId?: string,   // POS source: ระบบเติมจาก header/กะปัจจุบัน
  memberId?: string,
  paymentMode: 'PAID_NOW' | 'PENDING_PAYMENT',   // D1 — PAID_NOW = พฤติกรรมเดิม (Σ payMethods = grandTotal)
  lines: [{ productId?, variantId?, name?, qty, unitPrice?, discount?, note? }],
    // มี productId → ดึงราคา/ชื่อ/cost จาก catalog (unitPrice ส่งมาได้เฉพาะ allowOpenPrice)
    // ไม่มี productId → free-form: name+unitPrice บังคับ (โมดูลอื่นใช้แบบนี้) ไม่แตะสต็อก
    // ห้าม line ติดลบ — มัดจำหักด้วย payMethod DEPOSIT ไม่ใช่ line (D2)
  billDiscount?: { type: 'AMOUNT'|'PERCENT', value: number },  // PERCENT = basis point
  couponCode?: string,
  burnPoints?: number,            // D5: ใช้แต้มเป็นส่วนลด — POS เรียก point.quoteBurn/burn (Point เป็นผู้ตีมูลค่า)
  payMethods: [{ type: 'CASH'|'TRANSFER'|'PROMPTPAY'|'CARD🔜'|'VOUCHER🔜'|'DEPOSIT'|'ROOM_CHARGE',
                 amount: number, cashReceived?, ref?, refSaleId?, slipUrl?, meta? }],
    // DEPOSIT: refSaleId บังคับ = บิลมัดจำเดิม (D2) · ROOM_CHARGE: เฉพาะ tenant ที่มี HOTEL unit ACTIVE (D12)
  paymentIntent?: { method: 'PROMPTPAY'|'TRANSFER', expireAt },  // บังคับเมื่อ paymentMode = PENDING_PAYMENT (แทน payMethods)
  taxInvoice?: { name, taxId, branch?, address },
  note?: string,
  idempotencyKey: string          // บังคับ — client สุ่ม uuid ต่อความพยายามขาย 1 ครั้ง
}
```

**Steps:**

1. **Idempotency check** — เจอ `(unitId, idempotencyKey)` เดิม → คืนผลลัพธ์เดิมทันที (HTTP 200 + `duplicated: true`) ไม่ทำอะไรซ้ำ
2. **Validate บริบท**
   - unit ∈ tenant, `unit.status = ACTIVE` (PAUSED → `UNIT_PAUSED`)
   - RBAC: `can(staffUserId, {tenantId, unitId, module: 'POS', action: 'sale.create'})`
   - `sourceModule = POS` → ต้องมีกะ OPEN ของเครื่องนี้ (`SHIFT_REQUIRED`) · source อื่น → ไม่บังคับกะ/เครื่อง — แต่ถ้าชำระผ่านเครื่องที่มีกะ OPEN ให้ผูก `shiftId` เสมอ (D17)
   - `sourceModule ≠ POS` → `sourceId` บังคับ (`SOURCE_ID_REQUIRED`)
   - lines ≥ 1, ทุก qty > 0, เงินทุกตัว Int ≥ 0
3. **Resolve lines** — บรรทัดที่มี `productId`: โหลด product/variant (ต้อง ACTIVE + unit ตรง), snapshot `name/unitPrice/costSnapshot` · open price ต้องมีสิทธิ์ `sale.priceOverride` · ตรวจนโยบายสต็อก: `BLOCK` + trackStock + stockQty < qty → `STOCK_INSUFFICIENT` (บอกชื่อ+คงเหลือ)
4. **คำนวณส่วนลด** (ลำดับตายตัว — ทุกตัวปัดเศษ round-half-up เป็นสตางค์)
   - `lineTotal = qty×unitPrice − lineDiscount` (lineDiscount ห้ามเกิน qty×unitPrice)
   - `subtotal = Σ qty×unitPrice`, `afterLine = subtotal − lineDiscountTotal`
   - `billDiscount`: PERCENT คิดจาก afterLine · ตรวจเพดาน `maxDiscountBp` ของ role — รวม (lineDiscountTotal+billDiscount)/subtotal ห้ามเกิน → `DISCOUNT_EXCEEDS_LIMIT`
   - `afterBill = afterLine − billDiscount` (ห้ามติดลบ)
5. **คูปอง (contract 2.3)** — มี `couponCode`: เรียก `coupon.validate({code, tenantId, unitId, memberId, amount: afterBill, module: sourceModule})` → invalid → `COUPON_INVALID` + reason ส่งกลับ · valid → `couponDiscount = min(discount, afterBill)`, `afterCoupon = afterBill − couponDiscount`
6. **ใช้แต้มเป็นส่วนลด (contract 2.2 — D5)** — มี `burnPoints`: เรียก `point.quoteBurn({tenantId, memberId, points: burnPoints})` (read-only) → `pointDiscount = min(มูลค่าที่ Point ตีให้, afterCoupon)` — **Point เป็นผู้ตีมูลค่าแต้มเสมอ POS ไม่คำนวณเอง** · balance ไม่พอ → `POINT_BALANCE_INSUFFICIENT` (UI ตัดส่วนลดแต้มออกแล้วให้ยืนยันใหม่) · `net = afterCoupon − pointDiscount` · burn จริงเกิดใน tx (ขั้น 9.5) — ลำดับ coupon → burn → total → VAT ตายตัวตาม `_CONVENTIONS` 2.1
7. **VAT** (D9 — อ่านจาก `unit.settings.account.*` ที่เดียว: `!vatRegistered → NONE`, `priceIncludesVat → INCLUDED | EXCLUDED` — snapshot `vatMode/vatRateBp` ลงเอกสาร)
   - `INCLUDED` (default): `grandTotal = net`, `vatAmount = round(net × rateBp / (10000 + rateBp))` — คิดระดับบิล ไม่คิดรายบรรทัด กัน rounding drift
   - `EXCLUDED`: `vatAmount = round(net × rateBp / 10000)`, `grandTotal = net + vatAmount`
   - `NONE`: `vatAmount = 0`, `grandTotal = net`
8. **ตรวจ payment**
   - `paymentMode = PAID_NOW`: `Σ payMethods.amount === grandTotal` เป๊ะ (สตางค์) ไม่งั้น `PAYMENT_MISMATCH {expected, got}` · CASH: `cashReceived ≥ amount`, `changeAmount = cashReceived − amount` (บิลหนึ่งมี CASH ได้บรรทัดเดียว) · grandTotal = 0 (ส่วนลด 100%) → `payMethods: []` ได้
   - **DEPOSIT (D2)**: `refSaleId` บังคับ — ต้องเป็นบิลมัดจำ `docType SALE, status COMPLETED` ของ unit/สมาชิก-source เดียวกัน · ยอด DEPOSIT ≤ มูลค่ามัดจำคงเหลือที่ยังไม่ถูกอ้าง (กันหักซ้ำ — ตรวจ+จองใน tx) ไม่งั้น `DEPOSIT_INVALID` · DEPOSIT เป็น "วิธีชำระ" ไม่ใช่ line → **ไม่กระทบฐาน VAT ของบิลนี้ และไม่ earn แต้มซ้ำ**
   - **ROOM_CHARGE (D12)**: ใช้ได้เฉพาะ tenant ที่มี unit type HOTEL สถานะ ACTIVE — ไม่งั้นซ่อน/ปฏิเสธ
   - `paymentMode = PENDING_PAYMENT` (D1 — Ticket checkout / Hotel storefront มัดจำ): ไม่รับ payMethods — ตรวจ `paymentIntent {method, expireAt}` แทน
9. **DB Transaction (atomic ทั้งก้อน):**
   - **กรณี PENDING_PAYMENT (D1)**: INSERT `PosSale (status PENDING_PAYMENT, receiptNo = null)` + lines + `PosPaymentIntent (PENDING, expireAt)` — **ยังไม่**จองเลขใบเสร็จ/ตัดสต็อก/redeem คูปอง/burn แต้ม/ยิง point/account → return `{saleId, paymentIntent}` · ทุกอย่างที่เหลือเกิดตอนยืนยันเงินเข้า (flow 7.11)
   - กรณี PAID_NOW:
   1. จองเลขใบเสร็จ: `SELECT ... FOR UPDATE` แถว `PosReceiptCounter(unitId, docType, period=YYMM)` (upsert ถ้ายังไม่มี) → `lastNo+1` → `receiptNo = "{prefix}{YYMM}-{no:06d}"` เช่น `R2607-000123` — lock แถวเดียวสั้นๆ หลายเครื่องยิงพร้อมกันได้เลขเรียงไม่ชน
   2. INSERT `PosSale` + `PosSaleLine[]` + `PosPayment[]` + `PosReceiptToken`
   3. ตัดสต็อก: บรรทัดที่มี productId + trackStock → INSERT `PosStockMovement(type: SALE, qty: −qty, refType: 'PosSale', refId: saleId, balanceAfter)` + decrement `stockQty` cache (atomic `{ decrement }`)
   4. คูปอง: `coupon.redeem({code, tenantId, unitId, memberId, amount: afterBill, module: sourceModule, saleId, tx})` **ในทรานแซกชันเดียวกัน** (โมดูล Coupon atomic re-validate ใน tx) — กันใช้ซ้ำ
   5. แต้ม: มี burnPoints → `point.burn({tenantId, memberId, points: burnPoints, refType: 'PosSale', refId: saleId, idempotencyKey: "PosSale:{saleId}:burn", tx})` — throw ถ้า balance ไม่พอ (D5)
   6. ROOM_CHARGE: เรียก `hotel.chargeToRoom({folioRef, amount, sourceSaleId: saleId}, {crossUnit: true})` ใน tx (D12) — fail → `ROOM_CHARGE_FAILED`
   7. redeem/burn/chargeToRoom fail → rollback ทั้งหมด (เลขใบเสร็จที่จองไปเกิดรูตามธรรมชาติของ rollback — ยอมรับได้ ดู 11.2)
10. **หลัง commit (side effects — ผ่าน outbox กลาง + retry, ห้ามทำให้บิลล้ม):** *(บิลที่จ่ายด้วย ROOM_CHARGE: ข้าม 10.1/10.2 — point/account ไปเกิดตอน settle ที่โรงแรม — D12)*
    1. `point.earn({tenantId, memberId, unitId, amountSatang: Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE, sourceModule, refType: 'PosSale', refId: saleId, idempotencyKey: "PosSale:{saleId}:earn"})` — **Point เป็นผู้คำนวณแต้มจากยอดเงิน POS ไม่ส่ง delta (D5)** · ไม่นับ DEPOSIT = ไม่ earn ซ้ำ (มัดจำ earn ไปแล้วตอนบิลมัดจำ — D2) · ผลเขียนกลับ `sale.pointEarned` (nullable) · fail → outbox retry — บิลไม่ล้ม
    2. `account.postSale({tenantId, unitId, saleId, docType: 'SALE', grandTotal, vatAmount, discountTotal: lineDiscountTotal + billDiscount + couponDiscount, pointDiscount, payMethods, sourceModule, businessDate, idempotencyKey: "PosSale:{saleId}:post"})` — **facade 2.4 เท่านั้น: POS ไม่รู้ account code, mapping ทั้งหมดอยู่ฝั่ง Account (D3)** → คืน `{journalId, abbInvoiceNo}` → เขียน `sale.abbInvoiceNo` แปะใบเสร็จ · fail → outbox retry (Account idempotent)
    3. `member.recordSpend({tenantId, memberId, unitId, amountSatang: grandTotal, saleId})` — trigger เดียวของ tier engine (D6)
    4. `activity.log({tenantId, memberId, unitId, module: 'POS', type: 'SALE', refType: 'PosSale', refId: saleId, summary})` (D6 — contract 2.7)
    5. `notify` e-receipt ถ้าสมาชิกมีอีเมล+เปิดรับ · `AuditLog` sale.create
11. **Return:** `{ saleId, receiptNo?, grandTotal, pointEarned? }` (`pointEarned` nullable — earn เป็น post-commit outbox) · PENDING_PAYMENT → `{ saleId, paymentIntent: {qrPayload? | บัญชีโอน, expireAt} }` — ตรงตาม contract 2.1 v2

**Error codes (โมดูลอื่นต้อง handle):** `UNIT_PAUSED` · `SHIFT_REQUIRED` · `SOURCE_ID_REQUIRED` · `PRODUCT_NOT_FOUND` · `STOCK_INSUFFICIENT` · `DISCOUNT_EXCEEDS_LIMIT` · `COUPON_INVALID` · `POINT_BALANCE_INSUFFICIENT` · `DEPOSIT_INVALID` · `ROOM_CHARGE_FAILED` · `SALE_EXPIRED` · `PAYMENT_MISMATCH` · `PERMISSION_DENIED`

#### 7.2 ขายหน้าร้าน (Register)

1. แคชเชียร์เปิด `/pos/sale` → โหลด `shifts/current` — ไม่มีกะ → modal เปิดกะ (กรอก float) → สแกน/แตะสินค้าเข้าตะกร้า
2. (option) ผูกสมาชิก: กรอกเบอร์ → โชว์ชื่อ+แต้ม · (option) คูปอง → validate โชว์ส่วนลดสด · (option) ใช้แต้มเป็นส่วนลด → quoteBurn โชว์มูลค่าลดสด (D5)
3. กด "ชำระเงิน" → จอชำระ → เลือกวิธี (split ได้) → กดยืนยัน → client เรียก `POST /sales` พร้อม `idempotencyKey` ที่สุ่มไว้ตอนกดชำระ
4. สำเร็จ → จอสรุป (เงินทอน/แต้ม) → พิมพ์/ส่ง → ตะกร้าเคลียร์ ขายรายการถัดไป
5. **Failure path:** network timeout → client **retry ด้วย key เดิม** (ไม่เกิดบิลซ้ำ) · `STOCK_INSUFFICIENT` → ไฮไลต์บรรทัดแดง+คงเหลือ · `COUPON_INVALID` → ถอดคูปอง แจ้งเหตุผล ยอดกลับมายอดเดิม ให้ยืนยันใหม่ · `DISCOUNT_EXCEEDS_LIMIT` → toast "เกินสิทธิ์ ให้ผู้จัดการทำรายการ"

#### 7.3 Split payment: เงินสด 300 + โอน 200 (บิล 500 บาท)

1. จอชำระ ยอด 50000 สตางค์×100 = แสดง ฿500 → แตะ "เงินสด" กรอก 300 → แถบค้างชำระ ฿200
2. แตะ "โอน" → โชว์เลขบัญชี → ลูกค้าโอน → พนักงานแนบสลิป → ยอดครบ ปุ่มยืนยัน active
3. `payMethods: [{type: CASH, amount: 30000_00…}]` — ตัวอย่างจริง: `[{type:'CASH', amount:30000, cashReceived:30000}, {type:'TRANSFER', amount:20000, slipUrl}]` (หน่วยสตางค์) → Σ = 50000 = grandTotal ✓
4. ลูกค้าเปลี่ยนใจกลาง flow → ปุ่มลบวิธีที่ใส่แล้ว/ล้างทั้งหมดได้ ก่อนยืนยันสุดท้ายเท่านั้น (ยังไม่มีอะไรเขียน DB)

#### 7.4 PromptPay dynamic QR

1. จอชำระ แตะ "PromptPay" → `POST /promptpay/qr {amount}` → server สร้าง EMVCo payload (Tag 29 + promptpayId + amount + CRC) → client render QR
2. ลูกค้าสแกนจ่าย → พนักงานเช็คเงินเข้า (แอปธนาคารร้าน/เสียงแจ้งเตือน) → กด "รับเงินแล้ว" → confirm ซ้ำ 1 ครั้ง ("ยืนยันว่าเงิน ฿500 เข้าแล้ว?") → payment `{type: PROMPTPAY, amount, meta: {qrPayload, confirmedBy: userId}}`
3. ขายออนไลน์ (Ticket/Hotel storefront): ใช้ `paymentMode: PENDING_PAYMENT` + `PosPaymentIntent` (flow 7.11 — D1) · 🔜 webhook ธนาคาร/gateway → ยืนยันอัตโนมัติ ตัดคน confirm ออก (interface รองรับแล้ว)
4. **Failure:** ลูกค้าสแกนแล้วแต่พนักงานยังไม่กดยืนยัน แล้วไฟดับ → ยังไม่มีบิลใน DB → เปิดใหม่ ตะกร้ายังอยู่ (local state) → ทำซ้ำ · เงินเข้าซ้ำซ้อน = กระบวนการร้านตรวจ statement นอกระบบ v1

#### 7.5 Void (ยกเลิกทั้งใบ — ก่อนปิดกะ)

**เงื่อนไข:** `docType = SALE`, `status = COMPLETED`, ไม่มี REFUND อ้างถึง, กะของบิล**ยังไม่ปิด** (บิลไม่มีกะ เช่นจากโมดูลอื่น → void ได้ภายในวันเดียวกัน unit-tz) · สิทธิ์ `pos.sale.void` (STAFF ทั่วไป void ได้เฉพาะบิลตัวเองในกะปัจจุบัน — MANAGER+ ทุกบิลที่เข้าเงื่อนไข)

1. ตรวจเงื่อนไข + reason บังคับ
2. Transaction: `status → VOIDED` + `voidedAt/By/Reason` (lines/payments **ไม่แตะ** — immutable) · คืนสต็อก: movement `RETURN` ต่อบรรทัด (refType `'PosSale'` refId saleId — D8) + increment cache · คูปอง: เรียก `coupon.release({tenantId, saleId, reason: voidReason, tx})` คืนสิทธิ์การใช้
3. หลัง commit (outbox): `point.reverse({tenantId, refType: 'PosSale', refId: saleId, idempotencyKey: "PosSale:{saleId}:void-reverse"})` — reverse ทั้ง earn และ burn ของบิลนี้ คงอายุ lot เดิม (**D5 — ห้ามใช้ point.adjust**) · **แต้มลูกค้าอาจติดลบได้ถ้าใช้ไปแล้ว — ยอมให้ติดลบ (นโยบายแพลตฟอร์ม, Point module รองรับ)** · `account.postVoid({tenantId, unitId, saleId, docType: 'VOID', grandTotal, vatAmount, discountTotal, pointDiscount, payMethods, sourceModule, businessDate, idempotencyKey: "PosSale:{saleId}:void-post"})` — facade 2.4: Account กลับรายการเองทั้งก้อน POS ไม่รู้ account code (D3) · reverse `member.recordSpend` ยอดติดลบ (ตามสเปค 06 — D6) · `activity.log(type: 'SALE_VOID')`
4. แจ้งโมดูลต้นทาง: sale ที่มี `sourceModule ≠ POS` → emit event `pos.sale.voided {saleId, sourceModule, sourceId}` ให้โมดูลต้นทางปรับสถานะเอกสารตัวเอง (เช่น folio กลับเป็นค้างชำระ)
5. เงินสดที่คืนลูกค้า: สะท้อนใน X/Z report เป็นยอด void (expectedCash หักออก)

#### 7.6 Refund (คืนเงินหลังปิดกะ / คืนบางส่วน)

1. เปิดบิลเดิม → เลือกบรรทัด+จำนวนที่คืน (≤ ที่เหลือคืนได้: qty เดิม − ที่เคยคืน) → เลือกวิธีคืนเงิน (CASH ต้องมีกะเปิด / TRANSFER) + reason
   > **P1.8 ruling (CD8):** CASH ต้องมีกะเปิดของเครื่อง **เฉพาะเมื่อค่าตั้ง `pos.shift.required.register` บังคับกะ** (ไม่บังคับ = คืนนอกกะได้ · แสดงในเงินสดนอกกะเป็นแถวติดลบ) · วิธีคืน CASH/TRANSFER/PROMPTPAY/CARD (มัดจำ/ลงห้อง = REFUND_METHOD_INVALID)
2. สร้าง**เอกสารใหม่** `docType: REFUND`, `receiptNo: CN2607-000004` (counter แยก docType), `refSaleId`, lines อ้าง `refLineId`, ยอดเป็นบวก, payments = เงินที่จ่ายคืน
   > **P1.8 ruling (CD8 · O2):** เลขใบคืน = `CN${YYYYMM}-NNNN` (คำนำหน้าจาก `settings.pos.receipt.refundPrefix` ปริยาย "CN") จาก `PosDocCounter` ต่อสาขา/ชนิด/เดือน · ใบเสร็จขายยังใช้ `PosReceiptCounter` `YYYYMM-NNNN` เดิม (ย้ายเข้าตัวนับใหม่ = P1.10/P6.1)
3. Transaction: INSERT เอกสาร REFUND · คืนสต็อก movement `RETURN` (เฉพาะบรรทัดมี productId, เลือกได้ว่า "รับของคืน" หรือ "ไม่รับ (ของเสีย)" → ADJUST แทน) · อัปเดตใบเดิม `status → PARTIALLY_REFUNDED | REFUNDED`
   > **P1.8 ruling (CD8):** ไม่มีสถานะ `PARTIALLY_REFUNDED` — คืนบางส่วน**บิลยัง `PAID`** (สะสม `refundedSatang`) · `REFUNDED` เมื่อคืนครบทุกบรรทัด · สต็อกคืนทางคิว `pos.sale.refunded` ด้วย `inventory.receive` ที่ต้นทุนของ OUT เดิม (O12 · ไม่รับคืน = ไม่มี movement)
4. ส่วนลด/คูปอง/VAT ปันส่วนตามสัดส่วนบรรทัดที่คืน (pro-rata, ปัดสตางค์ half-up, ใบสุดท้ายเก็บเศษ) · คูปอง**ไม่คืนสิทธิ์**เมื่อ refund บางส่วน (คืนเต็มใบ = release เหมือน void)
5. หลัง commit (outbox): `point.reverse({tenantId, refType: 'PosSale', refId: saleId, amountSatang: <ยอดที่คืน>, idempotencyKey: "PosSale:{refundSaleId}:reverse"})` — **Point คำนวณแต้มที่ต้องหักเอง POS ไม่คิดสัดส่วน (D5 — ห้ามใช้ adjust)** · `account.postRefund({tenantId, unitId, saleId: refundSaleId, docType: 'REFUND', grandTotal: <ยอดคืน>, vatAmount, discountTotal, pointDiscount, payMethods, sourceModule, businessDate, idempotencyKey: "PosSale:{refundSaleId}:post"})` — facade 2.4 (D3) · reverse `member.recordSpend` ตามยอดคืน (สเปค 06 — D6) · `activity.log(type: 'SALE_REFUND')` · emit `pos.sale.refunded` ให้โมดูลต้นทาง · audit log

#### 7.7 เปิด-ปิดกะ

1. **เปิด:** เครื่องต้องไม่มีกะ OPEN (มี → บอกให้ปิด/แจ้ง MANAGER) → กรอก float → `PosShift OPEN`
2. **ระหว่างกะ:** ทุก sale ของเครื่องผูก shiftId — **รวมบิล `sourceModule ≠ POS` ที่ชำระผ่านเครื่อง/เคาน์เตอร์ที่มีกะ OPEN (D17)** เงินสดของบิลเหล่านี้จึงเข้า expectedCash ของกะ · ไม่มีกะเปิด → ไม่ผูกกะ แต่แสดงแยกในรายงานเป็น "เงินสดนอกกะ" ให้ OWNER เห็น · X report ดูได้ตลอด: บิล n ใบ, ยอดแยกวิธี, void x ใบ, `expectedCash = float + Σcash.amount − Σchange − Σcash refund`
3. **ปิด:** ฟอร์มนับเงิน (blindClose = ซ่อน expected จนกรอกเสร็จ) → `overShort = counted − expected` → เกิน threshold → เหตุผลบังคับ + notify OWNER → freeze `zReport` JSON (ยอดทุกมิติ) + `zNumber` รันต่อ unit → `status CLOSED`
4. **ปิดกะแล้วขายต่อ:** เครื่องไม่มีกะ → Register block จนเปิดกะใหม่
5. **Force-close:** cron ตี 4 (unit-tz): กะ OPEN > 24 ชม. → `FORCE_CLOSED`, expectedCash คำนวณ, countedCash = null, notify OWNER — บิลของกะนั้น void ไม่ได้แล้ว (ต้อง refund)

#### 7.8 ตรวจนับสต็อก

1. เปิดรอบ (ทั้งหมด/รายหมวด) → ระบบ snapshot `systemQty` ทุกบรรทัด ณ ตอนเปิด
2. เดินนับ (มือถือ): สแกน/ค้น → กรอกยอดจริง — ระหว่างนี้**ขายต่อได้** (ดู 11.6 วิธีจัดการ drift)
3. กดยืนยัน → จอสรุป diff (จำนวน+มูลค่าตาม cost) → confirm → transaction สร้าง movement `COUNT` ปรับ `stockQty = countedQty + (ยอดขายระหว่างนับ)` ตามสูตร 11.6 → audit log
4. รอบ DRAFT ค้าง > 7 วัน → auto-cancel + notify

#### 7.9 โมดูลอื่นเรียก createSale (ตัวอย่าง Hotel checkout)

1. Hotel ปิด folio ห้อง 204 ยอด ฿3,500 (จ่ายมัดจำไว้แล้ว ฿1,000 เป็นบิลมัดจำ `depSaleId`) → เรียก **in-process** `posSaleService.createSale({ tenantId, unitId, sourceModule: 'HOTEL', sourceId: folioId, staffUserId, memberId, paymentMode: 'PAID_NOW', lines: [{name: 'ค่าห้อง Deluxe 2 คืน', qty: 1, unitPrice: 300000}, {name: 'มินิบาร์', qty: 1, unitPrice: 50000}], payMethods: [{type: 'DEPOSIT', amount: 100000, refSaleId: depSaleId}, {type: 'TRANSFER', amount: 250000, slipUrl}], idempotencyKey: 'folio-{folioId}-close-1' })` — **มัดจำหักเป็นวิธีชำระ ไม่ใช่ line ติดลบ (D2)** · แต้ม earn จากบิลนี้คิดเฉพาะ 250000 (ไม่นับ DEPOSIT — ไม่ earn ซ้ำ)
2. POS ทำ flow 7.1 เต็ม (ไม่บังคับกะ — แต่ถ้าชำระผ่านเคาน์เตอร์ที่มีกะ OPEN ผูก shiftId ตาม D17, ไม่แตะสต็อก POS เพราะเป็น free-form lines) → คืน `{saleId, receiptNo, grandTotal, pointEarned?}`
3. Hotel เก็บ `saleId+receiptNo` ใน folio → ใบเสร็จที่ลูกค้าได้ = ใบเสร็จ POS มาตรฐานเดียวกันทั้งแพลตฟอร์ม
4. Hotel ต้องยกเลิก → เรียก `posSaleService.voidSale/refundSale` — **ห้ามแก้เอกสารเอง**

#### 7.10 พักบิล / เรียกคืน

1. พัก: snapshot ตะกร้า (lines+member+discount+coupon ยังไม่ redeem) → `PosHeldCart HELD` + label — เครื่องอื่นใน unit เห็นด้วย (คนละเครื่องเรียกคืนได้)
2. เรียกคืน: `UPDATE ... WHERE status='HELD'` atomic → `RECALLED` — สองเครื่องกดพร้อมกัน เครื่องที่สองได้ error "ถูกเรียกไปแล้ว"
3. เรียกคืนแล้ว**ราคา/คูปอง re-validate ใหม่** (ราคาอาจเปลี่ยนระหว่างพัก — ใช้ราคาปัจจุบัน แจ้งถ้าต่าง)
4. หมดอายุเที่ยงคืน (unit-tz) → cron `DISCARDED`

#### 7.11 PENDING_PAYMENT — ขายออนไลน์รอเงินเข้า (D1)

**ผู้ใช้ v1:** Ticket checkout (05), Hotel storefront มัดจำ (01) — in-store ใช้ `PAID_NOW` เหมือนเดิม

1. ต้นทางเรียก `createSale({..., paymentMode: 'PENDING_PAYMENT', paymentIntent: {method: 'PROMPTPAY'|'TRANSFER', expireAt}})` → POS สร้าง `PosSale (PENDING_PAYMENT, receiptNo = null)` + `PosPaymentIntent (PENDING)` — **ยังไม่ยิง point/account/ใบเสร็จ/สต็อก/คูปอง** → คืน `{saleId, paymentIntent {qrPayload | บัญชีโอน, expireAt}}` ให้ต้นทางแสดงลูกค้า
2. **ยืนยันเงินเข้า (v1 manual):** ลูกค้าโอน/สแกนจ่าย + แนบสลิป → staff/FINANCE ตรวจแล้วเรียก `POST /sales/:id/confirm-payment {paymentRef}` (หรือ `confirmSalePaid` in-process) — **idempotent ด้วย `paymentRef`** (`@@unique([unitId, paymentRef])`) ยิงซ้ำได้ผลเดิม · 🔜 gateway webhook เรียกจุดเดียวกัน (interface รองรับแล้ว)
3. ตอนยืนยัน (tx เดียว): จองเลขใบเสร็จ + ตัดสต็อก + `coupon.redeem` + `point.burn` (ถ้ามี) → intent CONFIRMED + sale COMPLETED + `paidAt` → หลัง commit ยิง side effects ทั้งหมดตาม flow 7.1 ขั้น 10 + **emit `pos.sale.paid {saleId, sourceModule, sourceId}`** ให้ต้นทางออกตั๋ว/ยืนยัน booking
4. **หมดอายุ:** cron กวาด intent PENDING ที่เกิน `expireAt` → intent EXPIRED + sale EXPIRED + **emit `pos.sale.expired {saleId, sourceModule, sourceId}`** → ต้นทางปล่อย hold (Ticket ปล่อยที่นั่ง, Hotel ปล่อย HOLD)
5. **Failure path:** ยืนยันหลังหมดอายุ → `SALE_EXPIRED` (เงินเข้าช้า = คืนเงิน/ติดต่อลูกค้านอกระบบ v1) · confirm กับ expire แข่งกัน → conditional update สถานะ (แพ้ = error ชัดเจน) · ยกเลิกก่อนจ่าย → `/sales/:id/cancel-pending`

---

### 8. Integration (contract ข้อ 2 ทั้งหมด)

| Contract | บทบาท POS | จุดที่เรียก |
|---|---|---|
| **2.1 Payment** | **POS = provider** — `posSaleService.createSale/confirmSalePaid/voidSale/refundSale` ตาม 7.1/7.11/7.5/7.6 · `paymentMode PAID_NOW|PENDING_PAYMENT` (D1) · payMethod `DEPOSIT` หักมัดจำ (D2) / `ROOM_CHARGE` (D12) · เลขใบเสร็จ `@@unique([unitId, receiptNo])` · emit `pos.sale.paid / pos.sale.voided / pos.sale.refunded / pos.sale.expired {saleId, sourceModule, sourceId}` (naming เต็มตาม D7) · REST: `POST /api/u/[unitId]/pos/sales` (Register) · in-process service (โมดูลอื่น) | ทั้งโมดูล |
| **2.2 Point** | consumer — `point.quoteBurn` (พรีวิว) + `point.burn` ใน tx = ใช้แต้มเป็นส่วนลด (**D5 MVP**) · `point.earn({amountSatang, ...})` หลัง commit ผ่าน outbox — **Point เป็นผู้คำนวณแต้ม POS ส่งยอดเงิน ไม่ส่ง delta** · void/refund → `point.reverse` (**ห้ามใช้ adjust** — D5) · `idempotencyKey` บังคับทุก mutation · refType `'PosSale'` (D8) | 7.1 ขั้น 6/9.5/10.1 · 7.5 · 7.6 |
| **2.3 Coupon** | consumer — `coupon.validate` 2 จุด: ตอนใส่โค้ดใน UI (โชว์สด) + ใน createSale ก่อนคิด VAT · `coupon.redeem({..., amount: afterBill, module, saleId, tx})` **ใน DB transaction เดียวกับ sale** (atomic กันใช้ซ้ำ) · `coupon.release({tenantId, saleId, reason, tx})` ตอน void/refund เต็มใบ · **voucher v1 = ส่วนลดผ่าน couponCode จุดเดียว (D4 — payMethod VOUCHER 🔜)** | 7.1 ขั้น 5, 9.4 · 7.5 |
| **2.4 Account** | consumer — **facade เท่านั้น (D3): `account.postSale / postRefund / postVoid({tenantId, unitId, saleId, docType, grandTotal, vatAmount, discountTotal, pointDiscount, payMethods[], sourceModule, businessDate, idempotencyKey})`** → คืน `{journalId, abbInvoiceNo}` — POS เก็บ `abbInvoiceNo` ลง `PosSale.abbInvoiceNo` แปะใบเสร็จ · **POS ไม่รู้ account code — mapping ทั้งหมดอยู่ฝั่ง Account** · DEPOSIT method = Account ล้างภาระมัดจำเอง (D2) · ใบกำกับภาษีเต็มรูป: POS แนบ `taxInvoice` ให้ Account ออกเอกสาร | 7.1 ขั้น 10.2 · 7.5 · 7.6 |
| **2.5 Notification** | consumer — `notify({channel: EMAIL, template: 'pos-e-receipt', data})` · low stock digest รายวัน · over/short เกิน threshold + force-close แจ้ง OWNER | T6, P9, F6 |
| **2.6 Member** | consumer — อ้าง `memberId` เท่านั้น + freeze `memberSnapshot {name, phone}` ลงใบเสร็จ (ข้อยกเว้นที่ contract อนุญาต) · ค้นสมาชิกผ่าน Member API (เบอร์/QR) · **`member.recordSpend({tenantId, memberId, unitId, amountSatang, saleId})` หลังปิดบิลผ่าน outbox — trigger เดียวของ tier engine (D6)** | R7 · 7.1 ขั้น 10.3 |
| **2.7 Activity** | producer บังคับ (D6) — `activity.log({tenantId, memberId, unitId, module: 'POS', type: SALE|SALE_VOID|SALE_REFUND, refType: 'PosSale', refId, summary})` ผ่าน outbox กลาง | 7.1 ขั้น 10.4 · 7.5 · 7.6 |
| **Hotel (01)** | consumer — payMethod ROOM_CHARGE → `hotel.chargeToRoom({folioRef, amount, sourceSaleId}, {crossUnit: true})` ใน tx (D12) — บิลต้นทางไม่ยิง point/account (เกิดตอน settle ที่โรงแรม) · แสดงปุ่มเฉพาะ tenant ที่มี HOTEL unit ACTIVE | 7.1 ขั้น 9.6 |

**⚠️ ข้อกำหนดเพิ่มที่ POS ต้องการจากโมดูลอื่น (สำหรับ QC ไขว้):**

1. **Coupon (08):** `coupon.release({tenantId, saleId, reason, tx})` อยู่ใน `_CONVENTIONS.md` 2.3 (v2) แล้ว — `coupon.redeem/release` รับ **Prisma tx client** เพื่อ join transaction ของ POS
2. **Point (09) และ Account (12) ต้อง idempotent ด้วย `idempotencyKey`** — event ซ้ำจาก outbox retry ต้องไม่บวกแต้ม/ลงบัญชีซ้ำ · Point ต้องยอมให้ balance ติดลบจาก `point.reverse`
3. **โมดูลต้นทาง (01/02/03/05) ต้อง subscribe event** `pos.sale.paid` / `pos.sale.expired` / `pos.sale.voided` / `pos.sale.refunded` (ชื่อเต็มตาม D7) เพื่อออกตั๋ว/ปล่อย hold/ปรับสถานะเอกสารฝั่งตัวเอง และต้องส่ง `idempotencyKey` ที่ deterministic ต่อการชำระ 1 ครั้ง (เช่น `folio-{id}-close-{attempt}`)
4. **Member (06):** API ค้นหาด้วยเบอร์โทร + decode QR บัตรสมาชิก ต้อง latency ต่ำ (ใช้กลางหน้าขาย) · `member.recordSpend` ต้อง idempotent ต่อ saleId + รองรับ reverse ตอน void/refund (D6)

---

### 9. Permissions — แทนที่แล้ว

คีย์ที่สร้างจริง 24 คีย์ = หมวด V2 §13 ด้านบน (คีย์ v1 เช่น pos.sale.discount / pos.shift.open / pos.stock.receive ไม่ได้สร้าง)

---

### 10. Reports & Metrics

| รายงาน | เนื้อหา | แหล่ง |
|---|---|---|
| **ยอดขายรายวัน** ✅ | ยอดสุทธิ, จำนวนบิล, เฉลี่ย/บิล, void/refund (จำนวน+มูลค่า), แยกช่วงเวลา (กราฟรายชั่วโมง) | `PosSale` aggregate (index `[unitId, createdAt]`) |
| **สินค้าขายดี** ✅ | Top N ตาม qty และตามยอดเงิน + margin ต่อตัว, filter หมวด/ช่วงเวลา | `PosSaleLine` group by productId |
| **ต่อพนักงาน** ✅ | ยอด/บิล/เฉลี่ย/ส่วนลดที่ให้/void ต่อ staffUserId — จับ pattern ผิดปกติ (ส่วนลดสูง, void บ่อย) | `PosSale` group by staffUserId |
| **ต่อวิธีชำระ** ✅ | ยอด+จำนวนต่อ CASH/TRANSFER/PROMPTPAY/DEPOSIT/ROOM_CHARGE (VOUCHER 🔜) — กระทบเงินสดในลิ้นชัก vs เงินเข้าบัญชี + แถว "เงินสดนอกกะ" (D17) | `PosPayment` group by type |
| **กำไรขั้นต้น** ✅ | Σ lineTotal − Σ(costSnapshot×qty) — เฉพาะบรรทัดที่มี cost + ระบุ % coverage ("มีต้นทุน 82% ของยอดขาย") | `PosSaleLine` |
| **สรุปกะ** ✅ | over/short รายกะ/รายเดือน ต่อพนักงานที่ปิด | `PosShift` |
| **มูลค่าสต็อก + low stock** ✅ | Σ(stockQty×cost), รายการใกล้หมด | `PosProduct/Variant` |
| **ยอดต่อ sourceModule** ✅ | POS หน้าร้าน vs Hotel vs Restaurant ฯลฯ — เห็นว่าเงินมาจากช่องทางไหน | `PosSale` group by sourceModule |
| Dashboard KPI (การ์ด unit บน Overview "ทุกกิจการ") ✅ | ยอดขายวันนี้ + จำนวนบิล + กะเปิดอยู่ | endpoint aggregate เบา |
| Heatmap วัน×ชั่วโมง, เปรียบเทียบสาขา (cross-unit consolidated), forecast | | 🔜 |

- ทุกรายงาน export CSV ✅ / PDF 🔜 · เขตเวลา = `unit.settings.timezone` (ตัดวันตามร้าน ไม่ใช่ UTC)

---

### 11. Edge Cases & Rules

1. **เลขใบเสร็จชนกัน (หลายเครื่อง)** — จอง `receiptNo` ผ่าน `SELECT ... FOR UPDATE` บน `PosReceiptCounter` ในทรานแซกชันเดียวกับ INSERT sale · `@@unique([unitId, receiptNo])` เป็นตาข่ายชั้นสุดท้าย — unique violation = retry ทั้ง tx (สูงสุด 3 ครั้ง)
2. **รูเลขใบเสร็จจาก rollback** — tx ล้มหลังจองเลข → เลขหายไปหนึ่ง (เช่น มี 000122 แล้วกระโดด 000124) → **ยอมรับได้** ไม่ reuse เลข (ปลอดภัยกว่าการันตีต่อเนื่อง) — เอกสาร VOIDED ยังอยู่ในระบบครบ ตรวจสอบย้อนได้
3. **Idempotency** — `(unitId, idempotencyKey)` unique · ยิงซ้ำคืนผลเดิม · client สุ่ม key ใหม่เฉพาะเมื่อ**ผู้ใช้เริ่มการชำระใหม่จริง** (แก้ตะกร้าแล้วกดชำระใหม่ = key ใหม่)
4. **Split payment ต้องเป๊ะ** — Σ amount = grandTotal ระดับสตางค์ ไม่มี tolerance · เงินทอนอยู่นอกสมการ (เฉพาะ CASH ผ่าน cashReceived/changeAmount) · CASH ≤ 1 บรรทัด/บิล
5. **สต็อกติดลบ** — `ALLOW_NEGATIVE` (default): ขายผ่าน แจ้ง badge ติดลบ รอตรวจนับ · `BLOCK`: createSale ปฏิเสธ — เช็ก+ตัดใน tx เดียว (atomic decrement + เงื่อนไข) กัน race สองเครื่องขายชิ้นสุดท้ายพร้อมกัน
6. **ขายระหว่างรอบตรวจนับ** — ยอดปรับตอน confirm = `countedQty + (ยอดขายสุทธิหลัง snapshot)`: replay movement ที่เกิดหลัง `count.createdAt` แล้วบวกทับยอดนับ — คนนับไม่เห็นของที่เพิ่งขายออกเป็น "ของหาย"
7. **Void vs Refund เส้นแบ่งชัด** — void = กะยังไม่ปิดเท่านั้น (Z report จะได้สะท้อนยอดจริงของกะ) · กะปิด/force-close แล้ว = refund เท่านั้น · เอกสาร immutable ทั้งคู่: void ไม่ลบข้อมูล, refund เป็นใบใหม่
8. **แต้ม/บัญชี fail หลังบิล commit** — บิลไม่ล้ม (ลูกค้าจ่ายแล้ว ใบเสร็จออกแล้ว) → retry queue backoff สูงสุด 5 ครั้ง → ยัง fail → แจ้ง OWNER + row ใน dashboard "รายการค้างซิงก์" ให้กด retry มือ — ทุก consumer idempotent จึง retry ปลอดภัย
9. **Offline (🔜 แต่กติกาวางแล้ว)** — v1 online-only: ปุ่มชำระ disabled ตอน offline + banner · ห้าม half-offline (พิมพ์ใบเสร็จโดยไม่มี saleId ใน DB = ห้ามเด็ดขาด) · design ไว้: IndexedDB queue + idempotencyKey เดิม + เลขชั่วคราว `OFF-{deviceCode}-{n}` พิมพ์คำว่า "รอออกเลขจริง" + reconcile ตอน sync — จะ implement เป็น Phase แยกพร้อม conflict policy
10. **VAT ปัดเศษ** — คิดระดับบิล (ไม่ Σ จากรายบรรทัด) round-half-up สตางค์ · ใบกำกับภาษีอย่างย่อ/เต็มรูปใช้เลขเดียวกับเอกสาร ห้ามคำนวณใหม่ตอน render
11. **เปลี่ยน VAT settings กลางทาง** — sale snapshot `vatMode/vatRateBp` ณ เวลาขาย — แก้ settings ไม่กระทบเอกสารเก่า
12. **ราคาเปลี่ยนระหว่างพักบิล** — recall แล้ว re-price จาก catalog ปัจจุบัน + แจ้งบรรทัดที่ราคาเปลี่ยน · คูปอง re-validate
13. **สมาชิกถูกลบ/merge หลังขาย** — ใบเสร็จใช้ `memberSnapshot` ไม่ dereference `memberId` ตอน render — เอกสาร freeze ตาม 2.6
14. **เครื่องถูก revoke ระหว่างกะเปิด** — revoke ได้ แต่ระบบเตือนให้ปิดกะก่อน · กะค้างของเครื่อง revoked → force-close flow เดิม
15. **unit PAUSED** — createSale ทุก source ปฏิเสธ (`UNIT_PAUSED`) · ดูรายงาน/ประวัติได้ปกติ (read ไม่ block) — ตรง edge case 4 ของ BLUEPRINT_BUSINESS_UNITS
16. **คูปองจำกัดหน่วย** — `coupon.validate` ส่ง `unitId` ณ จุดขายเสมอ ให้ Coupon ตรวจ `applicableUnitIds` (edge case 6 ของ blueprint)
17. **grandTotal = 0** (ส่วนลด/คูปอง 100%) — บิล valid, `payMethods: []`, ออกใบเสร็จปกติ, point base = 0
18. **Timezone** — "วันนี้/สิ้นวัน/รายงานรายวัน" ตัดตาม `unit.settings.timezone` (default Asia/Bangkok) เก็บ UTC เสมอ
19. **จำนวนบรรทัด/บิล** — soft limit 200 บรรทัด (กัน payload abuse) · qty ≤ 9999/บรรทัด
20. **Race พักบิล** — recall ใช้ conditional update (`WHERE status='HELD'`) — แพ้ race ได้ error ชัดเจน ไม่ duplicate ตะกร้า
21. **PENDING_PAYMENT (D1)** — sale สถานะนี้ไม่มีเลขใบเสร็จ/ไม่ตัดสต็อก/ไม่ยิง side effect ใดๆ · confirm กับ expire แข่งกัน → conditional update (แพ้ = error ชัดเจน) · confirm idempotent ด้วย `paymentRef` · sale EXPIRED ไม่นับในรายงานยอดขาย
22. **DEPOSIT กันหักซ้ำ (D2)** — บิลมัดจำ 1 ใบถูกอ้างเป็น DEPOSIT ได้ไม่เกินมูลค่าคงเหลือ (ตรวจ+จองใน tx) · บิลมัดจำที่ถูกอ้างแล้ว void ไม่ได้ (ต้อง void บิล settle ก่อน) · earn คิดจาก Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE เสมอ
23. **เงินสดนอกกะ (D17)** — บิล source อื่นที่รับ CASH: เครื่อง/เคาน์เตอร์มีกะ OPEN → ผูก shiftId เสมอ (เข้า expectedCash) · ไม่มีกะ → ไม่ผูกกะ แต่ต้องโผล่ในรายงานแยก "เงินสดนอกกะ" ให้ OWNER ตรวจ

---

### 12. QC Checklist (เกณฑ์ตรวจรับ)

#### Functional — Sale service
- [ ] createSale ครบ flow 7.1: ส่วนลดรายบรรทัด+ท้ายบิล+คูปอง+ส่วนลดแต้ม+VAT ทั้ง 3 โหมด (อ่านจาก `unit.settings.account.*` — D9) คำนวณตรงตามลำดับ `_CONVENTIONS` 2.1 (มี unit test ตัวเลขสตางค์เป๊ะทุกเคส รวมปัดเศษ)
- [ ] เงินทุก field เป็น Int สตางค์ — ไม่มี Float ใน schema/logic/API (grep ทั้งโมดูล)
- [ ] Split payment: Σ = grandTotal เป๊ะ, mismatch ถูกปฏิเสธ, เงินสด+โอนในบิลเดียวออกใบเสร็จถูก
- [ ] Idempotency: ยิง createSale ซ้ำ key เดิม 10 ครั้งพร้อมกัน (concurrent) → ได้บิลเดียว ผลตอบเหมือนกันทุกครั้ง
- [ ] **Concurrency เลขใบเสร็จ: 2+ เครื่องยิงขายพร้อมกัน 100 บิล → เลขไม่ชน ไม่ข้ามแบบผิดปกติ (load test จริง)**
- [ ] Void: สต็อกคืน + coupon.release + point.reverse + account.postVoid ครบทุก side effect · void หลังปิดกะถูก block
- [ ] PENDING_PAYMENT (D1): create → confirm (idempotent ด้วย paymentRef) → เลขใบเสร็จ/สต็อก/side effects + `pos.sale.paid` ครบ · expire cron → `pos.sale.expired` + ต้นทางปล่อย hold · confirm ซ้ำ/หลังหมดอายุถูก handle
- [ ] DEPOSIT (D2): settle หักมัดจำถูกใบ, หักเกินมูลค่าคงเหลือถูกปฏิเสธ, ฐาน VAT บิล settle ไม่ถูกลด, แต้มไม่ earn ซ้ำ (base = Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE)
- [ ] ใช้แต้มเป็นส่วนลด (D5): quoteBurn พรีวิวตรงกับ burn จริง · burn fail → บิล rollback ทั้งใบ · ลำดับ coupon → burn → total → VAT ตาม `_CONVENTIONS` 2.1
- [ ] ROOM_CHARGE (D12): เรียก hotel.chargeToRoom ใน tx, บิลไม่ยิง point/account, ปุ่มโชว์เฉพาะ tenant ที่มี HOTEL unit ACTIVE
- [ ] Refund บางส่วน: pro-rata ส่วนลด/VAT ถูกต้อง, refund เกินยอดคงเหลือถูก block, ใบเดิม status ขยับถูก
- [ ] เอกสาร immutable: ไม่มี endpoint/query ไหน UPDATE lines/payments/ยอดเงินหลัง commit (ตรวจ code review + test)
- [ ] เรียกจากโมดูลอื่น (จำลอง HOTEL): ไม่บังคับกะ, free-form lines ไม่แตะสต็อก, sourceId บังคับ, event voided/refunded ยิงออก

#### Functional — Register/สต็อก/กะ
- [ ] Barcode scan → เพิ่มตะกร้า <300ms · สแกนซ้ำ qty+1 · barcode ไม่พบ → เสนอสร้างสินค้า (ถ้ามีสิทธิ์)
- [ ] ส่วนลด STAFF เกิน maxDiscountBp ถูก block ทั้ง UI และ API (ทดสอบยิง API ตรง)
- [ ] PromptPay QR: payload ผ่าน validator EMVCo + สแกนจ่ายได้จริงกับแอปธนาคาร ≥ 2 แอป
- [ ] พักบิล/เรียกคืนข้ามเครื่อง + race recall 2 เครื่องพร้อมกัน → ใบเดียวชนะ
- [ ] Stock ledger: ทุกการเปลี่ยน stockQty มี movement คู่กัน (reconcile script: replay ledger = cache เป๊ะ)
- [ ] Stock count ระหว่างมีขายแทรก → ยอดหลัง confirm ถูกตามสูตร 11.6
- [ ] เปิด-ปิดกะ: expectedCash คำนวณถูก (รวม float, เงินทอน, void เงินสด, refund เงินสด) · Z report freeze แล้วตัวเลขไม่เปลี่ยน · force-close cron ทำงาน + notify
- [ ] ใบเสร็จ 58/80mm พิมพ์ครบทุก field ตาม T1/T2 (ทดสอบเครื่องพิมพ์จริงอย่างน้อย 1 รุ่นต่อขนาด) · e-receipt เปิดจากมือถือได้ · reprint มีคำว่า "สำเนา"

#### Isolation & Security
- [ ] **Tenant leak test: user ร้าน A ยิงทุก endpoint ด้วย id ของร้าน B → 404/403 ทั้งหมด**
- [ ] **Unit leak test: MANAGER unit 1 ยิง endpoint unit 2 (tenant เดียวกัน) → 403 · ขาย/ดูสินค้า/บิลข้าม unit ไม่ได้**
- [ ] deviceCode ถูก revoke → ทุก request ปฏิเสธ · idempotencyKey เดา/ชนข้าม unit ไม่ได้ (unique ต่อ unit)
- [ ] e-receipt token สุ่มพอ (cuid) ไม่ enumerable · หน้า public ไม่รั่วข้อมูล member เกิน snapshot
- [ ] AuditLog ครบทุก action เงิน/สต็อก/กะ: create/void/refund/adjust/count/close/settings
- [ ] Rate limit บน `POST /sales`, `/promptpay/qr`, `/sales/:id/void|refund`

#### Integration (QC ไขว้กับโมดูลอื่น)
- [ ] point.earn/burn/reverse idempotent (ยิงซ้ำไม่บวก/หักซ้ำ) + earn รับ `amountSatang` (Point คำนวณแต้มเอง — POS ไม่ส่ง delta) — ทดสอบร่วมกับโมดูล 09
- [ ] member.recordSpend + activity.log ยิงผ่าน outbox หลังปิดบิล (จำลอง Member ล่ม → บิลไม่ล้ม, ฟื้นแล้ว sync ครบ) — ทดสอบร่วมกับโมดูล 06 (D6)
- [ ] coupon.redeem อยู่ใน tx เดียวกับ sale: บังคับ redeem fail → บิลไม่เกิด, คูปองไม่ถูกตัด — ทดสอบร่วมกับโมดูล 08 (+ มี coupon.release แล้ว)
- [ ] account.postSale/postRefund/postVoid: payload ครบตาม `_CONVENTIONS` 2.4 + POS ได้ `abbInvoiceNo` กลับมาแปะใบเสร็จ + **ไม่มี account code ใดๆ ในโค้ด POS (grep)** — ทดสอบร่วมกับโมดูล 12 (D3)
- [ ] retry queue: จำลอง Point ล่ม → บิลสำเร็จ, รายการเข้าคิว, ฟื้นแล้ว sync ครบ

#### i18n & UX
- [ ] ทุกหน้า TH/EN สมบูรณ์ ไม่มี string hard-code · ตัวเลขเงินแสดง format ไทย (฿1,234.50)
- [ ] Empty/loading/error state ครบทุกหน้า (สินค้า 0 ชิ้น, กะยังไม่เปิด, offline banner)
- [ ] Register ใช้งานได้จริงบน tablet แนวนอน (เป้าหลัก) + มือถือ + desktop · ปุ่มชำระ/เงินทอนอ่านได้จากระยะ 1 เมตร
- [ ] วันตัดรายงาน = timezone ร้าน (ทดสอบบิลคร่อมเที่ยงคืน)
