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
