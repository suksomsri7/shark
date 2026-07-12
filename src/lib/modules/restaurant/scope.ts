// ลงทะเบียน scope ของ Restaurant models (unit-scoped) — ให้ tenantDb() inject tenantId+unitId อัตโนมัติ
// import ไฟล์นี้ (side-effect) ในทุก service ที่แตะ DB · idempotent-safe (registerScopes ยอมค่าเดิม)
import { registerScopes } from "@/lib/core/scope";

// ทุกตาราง Restaurant = unit-scoped (tenantId + unitId)
registerScopes({
  RestaurantSetting: "unit",
  MenuCategory: "unit",
  MenuItem: "unit",
  MenuOptionGroup: "unit",
  MenuOptionChoice: "unit",
  MenuItemOptionGroup: "unit",
  KdsStation: "unit",
  RestaurantZone: "unit",
  RestaurantTable: "unit",
  TableSession: "unit",
  RestaurantDailyCounter: "unit",
  RestaurantOrder: "unit",
  RestaurantOrderItem: "unit",
  RestaurantOrderItemOption: "unit",
  RestaurantServiceRequest: "unit",
});

// ── helpers ร่วม ──

// business date ปัจจุบันตามเวลาไทย (เที่ยงคืน BKK ตัดวัน)
export function bizDateBkk(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

// นาทีตั้งแต่เที่ยงคืน (local BKK) ของ "ตอนนี้" — ใช้เช็คเวลาเปิดครัว
export function nowMinutesBkk(): number {
  const d = new Date(Date.now() + 7 * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// day-of-week ตามเวลาไทย (0=อาทิตย์..6=เสาร์)
export function dowBkk(): number {
  return new Date(Date.now() + 7 * 3_600_000).getUTCDay();
}

export function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });
}

// "HH:MM" → นาที
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

export type ServiceHourDay = { dow: number; ranges: { open: string; close: string }[] };
export type SpecialClosure = { date: string; closed?: boolean; note?: string };

// ตรวจครัวเปิดรับออเดอร์ตอนนี้ไหม (server-side authority)
// คืน { open, reason } — reason ไว้แสดงลูกค้า
export function kitchenOpenNow(setting: {
  serviceHours: unknown;
  specialClosures: unknown;
  lastOrderMins: number;
  kitchenPaused: boolean;
  kitchenPausedNote?: string | null;
}): { open: boolean; reason?: string } {
  if (setting.kitchenPaused) {
    return { open: false, reason: setting.kitchenPausedNote || "ครัวปิดชั่วคราว" };
  }
  const today = bizDateBkk();
  const closures = (Array.isArray(setting.specialClosures) ? setting.specialClosures : []) as SpecialClosure[];
  if (closures.some((c) => c.date === today && c.closed !== false)) {
    const c = closures.find((c) => c.date === today);
    return { open: false, reason: c?.note || "วันนี้ร้านปิด" };
  }
  const hours = (Array.isArray(setting.serviceHours) ? setting.serviceHours : []) as ServiceHourDay[];
  // ไม่ตั้งเวลา = เปิดตลอด (ร้านเริ่มต้น)
  if (hours.length === 0) return { open: true };
  const dow = dowBkk();
  const day = hours.find((h) => h.dow === dow);
  if (!day || day.ranges.length === 0) return { open: false, reason: "วันนี้ร้านปิด" };
  const now = nowMinutesBkk();
  for (const r of day.ranges) {
    const lastOrder = hhmmToMin(r.close) - (setting.lastOrderMins || 0);
    if (now >= hhmmToMin(r.open) && now <= lastOrder) return { open: true };
    if (now > lastOrder && now <= hhmmToMin(r.close)) {
      return { open: false, reason: "เลยเวลารับออเดอร์สุดท้ายแล้ว (ครัวกำลังจะปิด)" };
    }
  }
  return { open: false, reason: "ครัวปิดแล้ว" };
}
