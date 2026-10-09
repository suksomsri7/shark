// settings-tabs.ts — ทะเบียนแท็บของหน้า /pos/settings (POS P1.10 U · มติ CD1) — แหล่งเดียวของเมนูซ้าย (ภาพ 17A/17B)
// 🔴 บริสุทธิ์ (client import ได้) · P1.18 เติมแท็บที่เหลือโดยเปลี่ยน live เป็น true + เพิ่มคอมโพเนนต์ใน page.tsx — ไม่ต้องแตะ SettingsShell
// ลำดับ = ลำดับเมนูในภาพ 17A: ทั่วไป · ใบเสร็จและภาษี · วิธีรับเงิน · เครื่องและเครื่องพิมพ์ · พนักงานและสิทธิ์ · การเชื่อมต่อ SHARK · ช่องทางขายภายนอก · ออฟไลน์และการซิงก์
import type { RegisterIconName } from "@/components/pos/register/RegisterIcon";

export type PosSettingsTabKey = "general" | "receipt" | "payments" | "devices" | "staff" | "shark" | "channels" | "offline";
export type PosSettingsTab = {
  key: PosSettingsTabKey;
  /** คีย์ข้อความใต้ pos.settings.tabs */
  msg: string;
  icon: RegisterIconName;
  /** true = มีหน้าจริงแล้ว (ลิงก์ ?tab=) · false = แสดงจาง "รอบถัดไป" ไม่มีลิงก์ */
  live: boolean;
  /** ใบงานที่จะเปิดแท็บนี้ (บันทึกไว้ให้คนอ่านโค้ด) */
  owner: string;
};

export const POS_SETTINGS_TABS: readonly PosSettingsTab[] = [
  { key: "general", msg: "general", icon: "gear", live: false, owner: "P1.18" },
  { key: "receipt", msg: "receipt", icon: "doc", live: true, owner: "P1.10U" },
  { key: "payments", msg: "payments", icon: "wallet", live: true, owner: "P1.7U" },
  { key: "devices", msg: "devices", icon: "print", live: true, owner: "P1.10U" },
  { key: "staff", msg: "staff", icon: "users", live: false, owner: "P1.15/P1.18" },
  { key: "shark", msg: "shark", icon: "grid", live: false, owner: "P1.18" },
  { key: "channels", msg: "channels", icon: "truck", live: false, owner: "P1.18" },
  { key: "offline", msg: "offline", icon: "clock", live: false, owner: "P1.18" },
];

/** แท็บแรกที่เปิดได้ (ไม่ส่ง ?tab= / ส่งแท็บที่ยังไม่เปิด = แท็บนี้) */
export const POS_SETTINGS_DEFAULT_TAB: PosSettingsTabKey = "receipt";

/** ?tab= → แท็บที่เปิดได้จริง (ไม่รู้จัก/ยังไม่ live = ค่าปริยาย) */
export function posSettingsTabOf(raw: unknown): PosSettingsTabKey {
  const hit = POS_SETTINGS_TABS.find((t) => t.key === raw && t.live);
  return hit ? hit.key : POS_SETTINGS_DEFAULT_TAB;
}

/** ลิงก์ของแท็บ (คง ?unit= ไว้เมื่อมี) */
export function posSettingsHref(systemId: string, tab: PosSettingsTabKey, unitId?: string): string {
  const q = new URLSearchParams({ tab });
  if (unitId) q.set("unit", unitId);
  return `/app/sys/${systemId}/pos/settings?${q.toString()}`;
}
