-- WO 8.3 (SPEC §9.4–§9.5 · เฟรม g13/g14) — สิทธิ์ผู้ใช้งาน + การเชื่อมต่อระบบ
--
-- additive ล้วน: เพิ่มค่า enum 4 ตัว + คอลัมน์ 4 คอลัมน์ที่มี DEFAULT ⇒ แถวเดิมทำงานเหมือนเดิมทุกประการ
--   · AccountLinkedKind += MEMBER/INVENTORY/CHAT/HR (POS/BUSINESS/CRM คงเดิม ไม่ขยับลำดับ)
--   · AccountSystemLink.enabled default true  ⇒ ทุก link ที่มีอยู่ = "เชื่อมอยู่" เหมือนเดิม
--     (ถ้า default เป็น false ร้านที่เชื่อม POS ไว้จะหยุดลงบัญชีเงียบ ๆ ทันทีที่ deploy)
--   · AccountSettings.accountRoles/[accountRoleMembers] = แม่แบบบทบาทบัญชี (สิทธิ์จริงยังอยู่ที่ Membership.permissions)
--
-- 🔴 ไม่มีตาราง "เพดานอนุมัติ" ใหม่โดยเจตนา — ระบบมีที่เก็บอยู่แล้วคือ
--    `Membership.permissions._maxApproveSatang` (core/permissions.ts PERMISSION_PARAMS)
--    ซึ่ง `account/expense-actions.ts` บังคับใช้จริงอยู่แล้ว ⇒ เพิ่มตารางใหม่ = มีเพดาน 2 แหล่ง

-- AlterEnum
ALTER TYPE "AccountLinkedKind" ADD VALUE 'MEMBER';
ALTER TYPE "AccountLinkedKind" ADD VALUE 'INVENTORY';
ALTER TYPE "AccountLinkedKind" ADD VALUE 'CHAT';
ALTER TYPE "AccountLinkedKind" ADD VALUE 'HR';

-- AlterTable
ALTER TABLE "AccountSettings" ADD COLUMN     "accountRoleMembers" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "accountRoles" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "AccountSystemLink" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedById" TEXT;
