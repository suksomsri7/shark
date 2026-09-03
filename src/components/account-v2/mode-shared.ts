// ค่าคงที่/type ที่ทั้งฝั่ง server (mode.ts, ใช้ next/headers) และ client (EasyModeToggle.tsx) ต้องใช้ร่วมกัน
// แยกไฟล์นี้ออกมาเพราะไฟล์ "use client" ห้าม import โมดูลที่พึ่ง next/headers (server-only)
export const ACC_MODE_COOKIE = "acc_mode";
export type AccMode = "easy" | "accountant";
