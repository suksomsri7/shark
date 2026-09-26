// portal-session.ts — ทางเข้าของสคริปต์ถ่ายภาพ `scripts/visual-crm.mts --user customer:<รหัส>` (หนี้ที่ใบ C3.5 เป็นเจ้าของ)
// ตัวจริงของ session พอร์ทัลอยู่ที่ `member/customer-session.ts` (R-C.5 · ผ่าน facade สมาชิก) — ไฟล์นี้ส่งต่อชื่อเดียว ไม่มีตรรกะ
//   `<รหัส>` = `CrmPortalAccess.id` · token เก็บเป็น sha256(token) ดิบ (สคริปต์ลบแถวด้วยค่านี้ใน finally)
export { mintPortalSession } from "@/lib/modules/member/session-facade";
