// customer-cookie.ts — ค่าคงที่/ตัวเลือกของ cookie session ลูกค้า (`/m/<slug>/*`) ที่ทุกทางเข้าใช้ร่วมกัน
//
// 🔴 AUDIT L5: เดิมแต่ละทางเข้า (me-actions · join-actions · route `/m/<slug>/auth/line`) ตั้งค่า
//    `Secure` จากคำนำหน้าของ **ชื่อ** cookie เอง ไม่ใช่จาก
//    "คำขอนี้เป็น https ไหม / นี่คือ production ไหม" · ร้านที่ APP_ENV ยังเป็น development แต่เปิดหน้า
//    ผ่าน https จริง จะได้ cookie ที่ไม่มี Secure = token ของลูกค้าเดินทางบน http ได้
//    ⇒ ตัดสินจากโปรโตคอลของคำขอ (x-forwarded-proto) ก่อน แล้วค่อยตกไปที่ APP_ENV
// 🔴 คงกติกาเดิมของชื่อ: `__Host-` ต้องมาคู่กับ Secure เสมอ — เงื่อนไข APP_ENV ชุดเดียวกับ
//    `customerCookieName()` จึงไม่มีทางได้ชื่อ `__Host-` โดยไม่มี Secure
// 🔴 ไฟล์นี้ไม่ใช่ `"use server"` โดยตั้งใจ (ส่งออกค่าคงที่/ชนิดได้) — ตัว action นำไปใช้ต่อ

/** อายุ cookie ลูกค้า = อายุ session (30 วัน) */
export const CUSTOMER_SESSION_DAYS = 30;

/** หัวคำขอเท่าที่ไฟล์นี้ต้องการ (Headers ของ Request หรือ `headers()` ของ Next ใช้ได้ทั้งคู่) */
type HeaderBag = { get(name: string): string | null };

/** สภาพแวดล้อมนี้ต้องบังคับ Secure ไหม (ทุกอย่างที่ไม่ใช่เครื่อง dev) */
export function appRequiresSecureCookies(): boolean {
  return (process.env.APP_ENV ?? "development") !== "development";
}

/** คำขอนี้มาทาง https จริงไหม (หลัง proxy/CDN อ่านจาก `x-forwarded-proto`) */
export function isHttpsRequest(headers?: HeaderBag | null): boolean {
  const raw = headers?.get("x-forwarded-proto") ?? "";
  return raw.split(",")[0]?.trim().toLowerCase() === "https";
}

/** ค่า `Secure` ของ cookie ลูกค้า — https ของคำขอนี้ **หรือ** สภาพแวดล้อมที่ไม่ใช่ dev */
export function customerCookieSecure(headers?: HeaderBag | null): boolean {
  return isHttpsRequest(headers) || appRequiresSecureCookies();
}

/** ตัวเลือก cookie ชุดเดียวของทุกทางเข้า (ตั้งค่าที่เดียว แก้ที่เดียว) */
export function customerCookieOptions(headers?: HeaderBag | null): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: customerCookieSecure(headers),
    sameSite: "lax",
    path: "/",
    maxAge: CUSTOMER_SESSION_DAYS * 24 * 60 * 60,
  };
}
