// GET/PUT /api/mobile/secretary/me — ชื่อที่แอปเรียก (ผู้คุม S2.4 ข้อ 4) = ตัวเดียวกับ `secretary/secretary` (ตัวตนเลขาของผู้ใช้ · PUT ติดเพดาน withRateLimit 30/นาทีที่ไฟล์ต้นทาง)
export { GET, PUT } from "../secretary/route";
