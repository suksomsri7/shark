-- K2.9 — ไมเกรชันชุด Q ของ "บอร์ดงาน": ตัวสร้างกฎอัตโนมัติของบอร์ด (พิมพ์เขียว 13-kanban-v2 §4.5)
-- 🔴 เพิ่มอย่างเดียว (additive): มีแต่ ADD COLUMN (nullable หรือมี DEFAULT ทุกตัว) + CREATE INDEX
--    ไม่มี DROP / ไม่มี ALTER … TYPE / ไม่มี NOT NULL ที่ไม่มี default บนตารางเดิม
--    ⇒ แถวเดิมของกฎร้าน (POS/คลัง) คงพฤติกรรมเดิมเป๊ะ: boardId = NULL, kind = 'RULE',
--      conditions/actions = [] ⇒ เอนจินเดิม (`where boardId: null`) ยังเห็นครบเหมือนเดิม
--    `minAmountSatang` / `actionType` / `actionConfig` เดิม **ไม่ถูกแตะ** (ห้ามลบ — §4.5)
-- มาจาก `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema --script`
-- เทียบกับ DB จริงบน QC · ตรวจ SQL ทั้งไฟล์ด้วยตาแล้ว: ไม่มีคำสั่งทำลายข้อมูล

-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "actions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "boardId" TEXT,
ADD COLUMN     "conditions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "dueOffsetDays" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'RULE',
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "scheduleCron" TEXT,
ADD COLUMN     "systemId" TEXT;

-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "boardId" TEXT,
ADD COLUMN     "cardId" TEXT;

-- CreateIndex
CREATE INDEX "AutomationRule_tenantId_boardId_enabled_idx" ON "AutomationRule"("tenantId", "boardId", "enabled");

-- CreateIndex
CREATE INDEX "AutomationRun_tenantId_ruleId_createdAt_idx" ON "AutomationRun"("tenantId", "ruleId", "createdAt");
