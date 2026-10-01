"use client";

// nav-perms.tsx — คีย์สิทธิ์ของผู้ใช้ปัจจุบันสำหรับแท็บโมดูล (CRM C5.5-fix2 · รีวิว RV2-7)
// 🔴 ทำไมมีไฟล์นี้: แท็บที่มี `perm` (บริษัท · อีเมล · รายงาน · โควตา …) เคยขึ้นเฉพาะหน้าที่ส่งตัวตัดสินคีย์ให้ `crmNavItems`
//    เอง (2–3 หน้า) ⇒ หน้าอื่น ~38 หน้าซ่อนแท็บเหล่านั้นจากทุกคน (รวมเจ้าของร้าน) · ตอนนี้ layout ของโมดูลคิดคีย์ครั้งเดียว
//    แล้วส่งลงมาทาง context นี้ — `ModuleTabs` กรองแท็บที่มี `perm` ด้วยรายการนี้ (ไม่มี provider = ซ่อน · fail closed)
// 🔴 ไฟล์บริสุทธิ์ฝั่ง client: ไม่ import โมดูลใดเลย (ด่าน F2.3)

import { createContext, useContext, type ReactNode } from "react";

const NavPermsContext = createContext<readonly string[]>([]);

export function NavPermsProvider({ perms, children }: { perms: readonly string[]; children: ReactNode }) {
  return <NavPermsContext.Provider value={perms}>{children}</NavPermsContext.Provider>;
}

export function useNavPerms(): readonly string[] {
  return useContext(NavPermsContext);
}

/** แท็บที่ผู้ใช้เห็น: ไม่มี `perm` = เห็นเสมอ · มี `perm` = ต้องอยู่ในรายการคีย์ของผู้ใช้ (บริสุทธิ์ — ข้อสอบเรียกตรงได้) */
export function visibleTabs<T extends { perm?: string }>(items: readonly T[], perms: readonly string[]): T[] {
  return items.filter((it) => !it.perm || perms.includes(it.perm));
}
