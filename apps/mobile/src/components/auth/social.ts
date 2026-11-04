// สีแบรนด์ของปุ่ม social บนจอ login (แยกจากไฟล์จอ — จอไม่มีสีฝัง · ข้อสอบ qc-sec-ui U3)
// สีของค่ายภายนอก (Google/Facebook/LINE) ไม่ใช่สีธีม Airy — Apple/TikTok ใช้สีตัวอักษรของธีม
export const SOCIAL_BRAND: Readonly<Record<string, string | undefined>> = {
  google: "#DB4437",
  facebook: "#1877F2",
  line: "#06C755",
};
