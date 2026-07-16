# Payment & Billing (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
สองส่วน: (1) **PaymentProfile** — ช่องรับเงินของร้าน (PromptPay v1: gen QR payload) ให้ลูกค้าจ่าย. (2) **PlatformInvoice** — บิลที่แพลตฟอร์มเรียกเก็บจากร้าน (เช่น custom domain 1,500฿/ปี) จัดการฝั่ง backoffice, ร้านเห็นของตัวเอง. WO-0023. **Layer 4 / Platform**. PaymentProfile scope=tenant; PlatformInvoice = billing แพลตฟอร์ม.
โค้ด: `src/lib/payment/{service,promptpay,actions}.ts` · `src/lib/platform/billing.ts` · schema `prisma/schema/payment.prisma`.

## Data model (prisma/schema/payment.prisma)
- **PaymentProfile** — `tenantId`(unique) `promptpayId?`(มือถือ 10 หลัก/บัตรปชช 13 หลัก) `displayName?`. scope=tenant.
- **PlatformInvoice** — `tenantId` `title` `amountSatang` `status`(PENDING/PAID/VOID) `dueAt?/paidAt?` `note?`. index `[tenantId,status,createdAt]`, `[status,createdAt]`. scope=platform (จัดการข้ามร้าน).

## Service API
- **payment/service.ts**: `getPaymentProfile(ctx)` · `savePaymentProfile(ctx, input)` — บันทึกช่องรับเงินร้าน (ตรวจ promptpayId valid).
- **payment/promptpay.ts** (pure — ห้ามแตะ DB): `crc16xmodem(s)` — CRC16-CCITT-FALSE (poly 0x1021 init 0xFFFF) hex ตัวใหญ่ 4 ตัว · `isValidPromptPayId(rawId)` · `promptpayPayload({id, amountSatang?})` — EMVCo QR string.
- **payment/actions.ts**: `savePaymentProfileAction(...)` · `listMyInvoicesAction()` — ร้านดูบิลของตัวเอง.
- **platform/billing.ts** (prisma ตรง, PlatformUser): `createInvoice(pu,...)` · `markInvoicePaid(pu, invoiceId)` · `voidInvoice(pu, invoiceId)` · `listInvoices(filter?)` — ทุก mutation + PlatformAuditLog.

## การเชื่อมต่อ
- **PaymentProfile → หน้าร้าน**: QR PromptPay ใช้แสดงตอนชำระ (storefront/checkout).
- **PlatformInvoice → Support/Backoffice**: FINANCE/SUPER_ADMIN ออกบิลค่าบริการ (เช่น custom domain — ดู storage-domain-i18n).
- ยังไม่ต่อ payment gateway จริง (Beam) — QR PromptPay = แสดงให้จ่ายเอง.

## Permissions
- ฝั่งร้าน: `savePaymentProfileAction` ผ่าน requireTenant (owner/manager).
- ฝั่ง platform: `billing.ts` ตรวจ `requirePlatformRole` (FINANCE/SUPER_ADMIN) + audit.

## UI
- ร้าน: `/app/settings/payment` (ตั้ง PromptPay) · `/app/settings/billing` (ดูบิลของร้าน).
- Backoffice: `/backoffice/billing` (ออก/จัดการบิลข้ามร้าน).

## การทดสอบ
- `scripts/qc-payment.mts` (Fable oracle, WO-0023) — promptpay.ts pure (crc16xmodem/promptpayPayload ถูกต้องตาม EMVCo) + billing invoice lifecycle (create/paid/void + audit).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- 🔑 needs-owner: สแกน QR PromptPay ทดสอบจริง · Beam creds ชื่อ shark.
- **WO-0069** Billing plans + quota (FREE/PRO + enforce) · **WO-0070** Beam gateway (บัตร/ผ่อน — โค้ดโครง ปิดสุภาพรอ creds).
- autoRenew subscription ต้องการ gateway นี้.
