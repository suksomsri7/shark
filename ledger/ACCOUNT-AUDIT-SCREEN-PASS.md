# T0.3c — รอบดูหน้าจอจริง (screen pass) ของเช็กลิสต์กฎหมายบัญชี 127 ข้อ

- ต่อจาก `ledger/ACCOUNT-AUDIT-CHECKLIST-127.md` (รอบอ่านโค้ด) — ไล่เฉพาะแถวที่รอบโค้ดระบุว่าต้องดูจอ/ใบพิมพ์/ไฟล์ส่งออก
- กฎแต่ละแถว: `/root/.claude/skills/shark-thai-law/references/audit-checklist-accounting.md` · แถว [U] ไม่ตัดสินว่าผิด
- ทรี/branch: `/root/projects/shark-acc` · `session/account-fix` (หมายเหตุ: รอบโค้ดอ่าน main `6b991f34d` ในทรีอื่น — โค้ดสองทรีอาจต่างกันเล็กน้อย)
- เซิร์ฟเวอร์: production build (`next build` ผ่าน gate lock) + `next start` พอร์ต 3215 บน DB QC (`.env.qc`) ใน systemd unit แยก `acc-qc-server`
- ข้อมูล: seed QC as-of 2026-09-30 · ระบบบัญชี `/app/sys/cmwe8glka000415kzr5c8qmap` · ผู้ใช้เจ้าของ qc-owner
- เบราว์เซอร์: google-chrome headless ผ่าน puppeteer-core · 1440×900 · deviceScaleFactor 1 · ภาพเต็มหน้า
- ภาพ: `.qc-shots/acc-v2/screen-pass/` (โฟลเดอร์นี้ git-ignore — ไม่ได้ commit ภาพ) · ข้อความหน้าจอที่ดึงมา: `.qc-shots/acc-v2/screen-pass/txt/`
- ความหมายคอลัมน์ "ยืนยัน/ขัด/ปรับ": ยืนยัน = จอตรงกับผลรอบโค้ด · ขัด = จอแสดงผลตรงข้าม · ปรับ = ผลรอบโค้ดถูกบางส่วน/ต้องแก้รายละเอียด · ไม่ได้ดู = เปิดไม่ได้/ไม่มีข้อมูล (บอกเหตุผล)

## ผล (กำลังทำ)

| แถว | ผลรอบโค้ด | สิ่งที่เห็นจริง | ยืนยัน/ขัด/ปรับ | ภาพ |
|---|---|---|---|---|
