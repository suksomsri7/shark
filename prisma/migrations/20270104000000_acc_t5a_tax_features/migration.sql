-- ACC T5 (เลน 2) ▸ T5.5 ธงบวกกลับต่อบัญชี · T5.6 รหัสอากรแสตมป์ · T5.7 ช่องทาง "ตัดหนี้สูญ" — เพิ่มอย่างเดียว ไม่แก้ข้อมูลเดิม
ALTER TYPE "AccountPayChannel" ADD VALUE IF NOT EXISTS 'BAD_DEBT';
ALTER TABLE "AccountLedger" ADD COLUMN "taxAddBack" TEXT;
ALTER TABLE "AccountDocument" ADD COLUMN "stampDutyRef" TEXT;
