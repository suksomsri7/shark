-- WO POS inventory COGS: หน้าขาย POS ตัดสต็อก + ลง COGS (perpetual) + void คืนสต็อก
-- AlterTable: ผูก line กับสินค้าคลัง (InvItem.id) เพื่อรู้ว่าตัด/คืนสต็อกตัวไหนตอน void
-- additive nullable → ปลอดภัยต่อบิลเดิม (null = รายการเพิ่มเอง/บริการ ไม่ผูกคลัง)
ALTER TABLE "PosSaleLine" ADD COLUMN "itemId" TEXT;
