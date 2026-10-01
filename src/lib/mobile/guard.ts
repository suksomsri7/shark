// guard.ts — ด่านสิทธิ์รายข้อของ route `/api/mobile/**` (HOTFIX 2026-10-01 · Item 4)
// 🔴 `requireMobile` ตอบแค่ "เป็นสมาชิกของร้านนี้" — ประตูเว็บของเรื่องเดียวกันเช็กสิทธิ์รายข้อด้วย `assertCan` เสมอ
//    (เช่น `ai.chat.send` ที่ lib/ai/actions.ts · `systems.system.create` ที่ lib/actions/systems.ts) ⇒ แอปต้องใช้กติกาเดียวกัน
//    ไม่งั้นพนักงานที่ไม่มีสิทธิ์ทำผ่านแอปได้สิ่งที่เว็บห้าม · ตัดสินด้วย `evaluate` ตัวเดียวกับ `assertCan` (OWNER/MANAGER ผ่าน · STAFF ตามคีย์)
import { evaluate, type AccessQuery } from "@/lib/core/rbac";
import type { MobileAuth } from "./auth";

/** ผ่าน = `null` · ไม่ผ่าน = 403 `{ error: "forbidden" }` (รูปเดียวกับ `mobileError` ของ requireMobile) */
export function mobileDenied(g: MobileAuth, q: AccessQuery): Response | null {
  const ok = evaluate(
    {
      role: g.membership.role,
      unitAccess: g.membership.unitAccess as string[],
      permissions: g.membership.permissions as Record<string, unknown>,
    },
    q,
  );
  return ok ? null : Response.json({ error: "forbidden" }, { status: 403 });
}

/** ประตูเว็บของผู้ช่วย AI ทุกตัว (ส่ง/อ่านแชท/ข้อเสนอ/แผน) ใช้คีย์นี้ */
export const AI_CHAT: AccessQuery = { module: "ai", action: "ai.chat.send" };
/** ประตูเว็บ "เพิ่มระบบ" (lib/actions/systems.ts addSystemAction) — การประกอบระบบจากพิมพ์เขียว DNA สร้างระบบ/สาขาเหมือนกัน */
export const SYSTEM_CREATE: AccessQuery = { module: "systems", action: "systems.system.create" };
