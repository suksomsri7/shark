# S3a-1-A — S3a.1-A แก้ผลนักล่าฝั่งแอป (Opus · เลน d · `wip/sec-s3a1-a` · 7 พ.ย.)
Read COMMON (A.11) · **RESOLUTIONS §Z.3 (R-Z28…R-Z30)** + §Z.2 R-Z21 (สัญญา step-up ลบบัญชี: `POST secretary/account/delete {confirm, code}` · code จาก `auth/sms/request` ของเบอร์ตัวเอง หรือ `auth/otp` ของอีเมล) · oracle `scripts/qc-sec-s3a1-a.mts` (static + spec)
## งาน
1. R-Z28 `secretary/new.tsx` + `customers/[id]/info.tsx`: `clientMessageId` ใน ref (ล้างเมื่อสำเร็จ/ข้อความเปลี่ยน) · `409 pending` ⇒ รอแล้วลองใหม่เงียบ ๆ (ไม่โชว์ error)
2. R-Z29 ลบบัญชี 2 ขั้น: ขอรหัส → ใส่รหัส 6 หลัก → ส่ง `{confirm, code}` · ข้อความไทย/อังกฤษ · fixture + spec s2.21 เพิ่มสถานะ
3. R-Z30 ปุ่มส่งทุกตัวกัน double-submit (ตรวจทั่วจอ S2 · จดรายการ)
## Acceptance
`qc-sec-s3a1-a` เขียว · spec s2.21/s2.4/s2.17 + `qc-sec-s2.14` ยังเขียว (รวม clicks-sec ถ้าทะเบียนเปลี่ยน) · typecheck mobile 0 · fitness ×2 · A.11 merge tip · wo-note `sec-s3a1-a.md`
