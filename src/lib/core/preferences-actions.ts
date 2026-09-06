"use server";

// Server action ของ "ค่าที่เป็นของคน" (B3) — วันนี้มีตัวเดียว: จำสถานะย่อ/ขยายแถบเมนู
//
// 🔴 userId มาจาก session เท่านั้น (requireAuth) — ห้ามรับจาก client
//    ค่านี้ไม่ผูกกับร้าน (User.prefs ข้าม tenant) ⇒ ไม่ต้องมีด่าน RBAC ของโมดูล
//    แต่ต้องล็อกอินก่อนเสมอ ไม่งั้นเขียน prefs ของคนอื่นได้
// 🔴 ห้าม throw — ปุ่มย่อ/ขยายเป็นเรื่องความสวยงาม ถ้าบันทึกไม่ผ่านก็แค่ไม่จำ ไม่ควรทำหน้าพัง

import { requireAuth } from "./context";
import { setUserPreferences } from "./user-preferences";

export async function setNavCollapsedAction(collapsed: boolean): Promise<{ ok: boolean }> {
  const auth = await requireAuth();
  try {
    await setUserPreferences(auth.user.id, { navCollapsed: !!collapsed });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
