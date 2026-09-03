// ค่าคงที่ที่ทั้งฝั่ง server (dash-collapse.ts, ใช้ next/headers) และ client (DashCollapseToggle.tsx) ต้องใช้ร่วมกัน
// แยกไฟล์เหมือน mode-shared.ts — ไฟล์ "use client" ห้าม import โมดูลที่พึ่ง next/headers
export const DASH_COLLAPSE_COOKIE = "acc_dash_collapsed";
