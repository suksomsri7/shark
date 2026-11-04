// ชื่อโมดูลของเลขา (AI_MODULES ใน src/lib/ai/secretary/access-rules.ts) → สีป้ายระบบของธีม (SysKey) + คีย์ i18n sec.sys.*
// ใช้ร่วมโดย RoomCard (ป้ายระบบของห้อง) · SuggestionList (ป้ายย่อของข้อเสนอ) · จอ A2 (แถวระบบที่เข้าถึงได้)
import type { I18nKey } from "@/src/i18n";
import th from "@/src/i18n/th";
import type { SysKey } from "@/src/theme/index";

const COLOR: Record<string, SysKey> = {
  pos: "pos",
  inventory: "pos",
  shop: "pos",
  restaurant: "pos",
  crm: "crm",
  approval: "crm",
  hr: "crm",
  automation: "crm",
  system: "crm",
  member: "mem",
  marketing: "mem",
  coupon: "mem",
  reward: "mem",
  point: "mem",
  account: "acc",
  kanban: "kb",
  kb: "kb",
  chat: "chat",
  booking: "bk",
  queue: "bk",
  calendar: "bk",
  clinic: "bk",
  school: "bk",
  ticket: "bk",
  hotel: "dorm",
  dorm: "dorm",
  rental: "dorm",
};

/** สีป้ายของโมดูล (ไม่รู้จัก = สีบอร์ดงาน) */
export function sysColor(module: string): SysKey {
  return COLOR[module] ?? "kb";
}

/** คีย์ชื่อโมดูลใน i18n · ไม่มีคีย์ = null (จอแสดงชื่อโมดูลดิบ) */
export function sysLabelKey(module: string): I18nKey | null {
  const k = `sec.sys.${module}`;
  return k in th ? (k as I18nKey) : null;
}

/** คีย์ป้ายย่อของกล่องสี (SysBadge solid · .k ของแบบ: CRM/POS/บัญชี/งาน/แชท …) ตามสีระบบของโมดูล */
export function sysShortKey(module: string): I18nKey {
  return `sec.k.${sysColor(module)}` as I18nKey;
}
