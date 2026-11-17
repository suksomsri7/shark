// nav-systems — รายการ "ระบบทั้งหมด" ระดับบนของเมนูร้าน (ทะเบียนเดียว · 14 พ.ย.)
// ใช้ 2 ที่: เมนูเว็บ (src/app/app/layout.tsx → NavDrawer/NavRail · ต่อ children เอง) และ
//   แอปมือถือ GET /api/mobile/secretary/systems (ตาราง "เปิดระบบ" ในชีตกิจการ) ⇒ ผู้ใช้เห็นระบบชุดเดียวกัน ลำดับเดียวกัน ป้ายเดียวกัน
// ลำดับ: หน่วยธุรกิจ (BusinessUnit · /app/u/<slug>) → ระบบ feature (AppSystem · /app/sys/<id>) → ระบบหน้า fixed ที่เปิดแล้ว (KB /app/kb · PAGES /app/pages)
// สิทธิ์: เหมือนเมนูเว็บเดิมทุกข้อ — ไม่มีการกรองรายการ · ระบบแชทที่ผู้ใช้ไม่มีสิทธิ์อ่านแชท ⇒ href = หน้าเชื่อมช่องทาง (ด่านจริง requireChatRead())
//   ผู้เรียกตัดสิน `chatRead` เอง ด้วย evaluate(membership, { module: "chat", action: CHAT_READ_ACTION }) — ตัวเดียวกันทั้งเว็บและแอป
// บริสุทธิ์ (ไม่แตะ DB/สิทธิ์) — ผู้เรียก query units/appSystems เอง
import { FIXED_PAGE_SYSTEMS, SYSTEM_DEFS, isFixedPageSystem, systemDef } from "@/lib/systems";

export type NavSystemKind = "unit" | "system" | "fixed";
export type NavSystem = {
  /** คีย์ของเมนู (`u-<id>` · `s-<id>` · `fp-<code>`) — ตัวเดียวกับคีย์ badge ของ NavDrawer */
  key: string;
  kind: NavSystemKind;
  /** รหัสระบบ (UnitType / SystemType / code ของหน้า fixed) */
  code: string;
  /** slug (unit) · id (system) · code (fixed) — ใช้ต่อ children ของเมนูเว็บ */
  ref: string;
  href: string;
  icon: string;
  label: string;
};

export function navSystems(
  units: readonly { id: string; slug: string; name: string; type: string }[],
  appSystems: readonly { id: string; name: string; type: string }[],
  opts: { chatRead: boolean },
): NavSystem[] {
  const { chatRead } = opts;
  return [
    ...units.map((u) => ({
      key: `u-${u.id}`,
      kind: "unit" as const,
      code: u.type,
      ref: u.slug,
      href: `/app/u/${u.slug}`,
      icon: systemDef(u.type)?.icon ?? "•",
      label: u.name,
    })),
    ...appSystems.map((s) => ({
      key: `s-${s.id}`,
      kind: "system" as const,
      code: s.type,
      ref: s.id,
      href: s.type === "CHAT" && !chatRead ? `/app/sys/${s.id}/chat/channels` : `/app/sys/${s.id}`,
      icon: systemDef(s.type)?.icon ?? "•",
      label: s.name,
    })),
    ...SYSTEM_DEFS.filter((s) => s.status === "available" && isFixedPageSystem(s.code)).map((s) => ({
      key: `fp-${s.code}`,
      kind: "fixed" as const,
      code: s.code,
      ref: s.code,
      href: FIXED_PAGE_SYSTEMS[s.code],
      icon: s.icon,
      label: s.label,
    })),
  ];
}

/** คีย์ช่อง "หน้าหลัก" (/app) ของแอป — ไม่อยู่ในทะเบียน (เมนูเว็บมีหน้าหลักแยก) แต่จัดลำดับร่วมกับระบบได้บนแถบบนแอป (topbar2) */
export const NAV_HOME_KEY = "home";
// 17 พ.ย. (เจ้าของสั่งจากเครื่องจริง: ทีม/ปฏิทิน จัดลำดับได้ · เว้นที่เหนือแถวแรก): ปุ่มโซน "ทีม" (/secretary/staff) และ "ปฏิทิน" (/secretary/calendar)
//   ของแอปเป็นช่องในลำดับเดียวกับระบบ (แบบเดียวกับ "home" · ไม่อยู่ในทะเบียน/เมนูเว็บ) · ทุกคนในร้านมี 2 ช่องนี้ (ปุ่มโซนเดิมไม่กรองตามบทบาท)
export const NAV_TEAM_KEY = "team";
export const NAV_CAL_KEY = "calendar";
/** ช่องที่ "ขึ้นหน้าสุด" เมื่อลำดับที่บันทึกไม่มี (ผู้ใช้เดิมก่อน 17 พ.ย. = ทีม ปฏิทิน อยู่หน้าเหมือนปุ่มโซนเดิม · ไม่มีอะไรขยับจนผู้ใช้จัดเอง) */
export const NAV_FRONT_KEYS: readonly string[] = [NAV_TEAM_KEY, NAV_CAL_KEY];

/**
 * ลำดับของผู้ใช้ (แถบบนแอปเลขา · topbar2 17 พ.ย. · pure) — คีย์ที่บันทึกไว้ก่อนตามลำดับที่บันทึก
 * คีย์ที่บันทึกแต่ไม่มีแล้ว (ระบบถูกปิด/ลบ) = ไม่สน · ระบบที่ยังไม่อยู่ในลำดับ (เปิดใหม่) = ต่อท้ายตามลำดับทะเบียน
 * ยกเว้น `front` (ปริยาย ทีม ปฏิทิน): ที่ยังไม่อยู่ในลำดับที่บันทึก = ขึ้น "หน้าสุด" ตามลำดับของ `front` (17 พ.ย.)
 * `keys` = ลำดับทะเบียน (เช่น ["team", "calendar", "home", ...navSystems().key]) · คืนรายการคีย์ครบชุดเดียวกับ `keys`
 * 🔴 แอป (apps/mobile/src/components/secretary/navSystems.ts `fullOrder`) ใช้กติกาเดียวกัน — แก้ที่หนึ่งต้องแก้อีกที่
 */
export function orderNavKeys(keys: readonly string[], saved: readonly string[], front: readonly string[] = NAV_FRONT_KEYS): string[] {
  const have = new Set(keys);
  const kept = new Set(saved);
  const out: string[] = [];
  for (const k of front) if (have.has(k) && !kept.has(k) && !out.includes(k)) out.push(k);
  for (const k of saved) if (have.has(k) && !out.includes(k)) out.push(k);
  for (const k of keys) if (!out.includes(k)) out.push(k);
  return out;
}
