# 06 — Database Conventions

- **Prisma 7 + Neon PG (สิงคโปร์)** · schema แยกไฟล์ต่อโดเมนใน `prisma/schema/*.prisma` (23+ ไฟล์)
- **ทุก model**: `id cuid` · `tenantId` (เว้น global/platform — ต้องมีเหตุผลใน scope.ts) · `createdAt` · เงิน = สตางค์ `Int` (`*Satang`) · เวลาเป็น UTC แปลง BKK ตอนแสดง/จัดกลุ่ม (`dayKeyBangkok`)
- **system-scoped**: มี `systemId` + ลงทะเบียน `sys()` ใน scope.ts · unique ที่มีความหมายต่อระบบใช้ `@@unique([systemId, ...])`
- **idempotency**: งานเงิน/สต็อกทุกตัวมี `idempotencyKey` unique ต่อ tenant (`ai-<proposalId>`, `po-<lineId>` pattern)
- **append-only**: movement/ledger/audit ห้าม update ย้อน — สร้างรายการกลับรายการแทน
- **Migration**: `prisma migrate dev --create-only` → review → `migrate deploy` (Fable เท่านั้น · Builder ห้ามแตะ) · prod = Neon production branch · เทส = `pnpm neon:create wo-XXXX` แล้วลบเมื่อจบ
- **ห้าม**: raw SQL ในโมดูล · `tenantDb().upsert()` · createMany ที่พึ่ง guard เติม tenantId (ใส่ตรง ๆ เสมอ)
