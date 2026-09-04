-- WO 9.3 (ประสิทธิภาพ) — ดัชนีเพิ่มแบบ additive ล้วน (ไม่แตะคอลัมน์/ข้อมูลเดิม)
--
-- เลือกจาก "รูป query ที่วิ่งจริง" ที่เก็บด้วย `PERF_SHAPES=1 tsx scripts/qc-acc-v2-perf.mts`
-- เฉพาะรูปที่ไม่มีดัชนีเดิมตัวไหน "ขึ้นต้นตรง" กับคอลัมน์ที่กรอง+เรียง เท่านั้น
-- (รูปอื่นที่ใบสั่งงานเสนอมา — AccountDocument(systemId,docType,status,issueDate) ·
--  AccountJournalEntry(systemId,date) · AccountDocumentPayment(systemId,paidAt) ·
--  AccountAttachment(systemId,status,createdAt) — **มีอยู่แล้ว** จาก WO ก่อนหน้า ไม่ต้องเพิ่มซ้ำ)

-- CreateIndex
CREATE INDEX "AccountContact_systemId_archivedAt_createdAt_idx" ON "AccountContact"("systemId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "AccountAttachment_systemId_archivedAt_createdAt_idx" ON "AccountAttachment"("systemId", "archivedAt", "createdAt");
