-- ตั้งค่ากิจการจากแอปเลขา (14 พ.ย. 2026) — migration `secretary_bizprofile` (additive ล้วน · 1 คอลัมน์ nullable · ไม่มี backfill)
-- Tenant.businessType = คีย์ประเภทธุรกิจ (TENANT_TYPES ของ src/lib/mobile/tenants.ts) · null = ยังไม่เลือก
-- ที่อยู่/เบอร์/เลขผู้เสียภาษี/สาขา ใช้ AccountSettings เดิม · เวลาทำการ ใช้ ChatSetting.businessHours เดิม (ไม่สร้างซ้ำ)
-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "businessType" TEXT;
