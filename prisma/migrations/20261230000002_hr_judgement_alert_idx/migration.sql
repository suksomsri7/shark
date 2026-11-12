-- HR H2.5 r2 ▸ ตัวงานตามเวลาอ่านการเตือนของช่วงวัน D−7…D ต่อระบบ (มติ r2 I) ◂
-- CreateIndex
CREATE INDEX "HrAttendanceAlert_systemId_date_idx" ON "HrAttendanceAlert"("systemId", "date");
