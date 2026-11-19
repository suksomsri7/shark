// แจ้งเตือนของปฏิทินเลขา (CAL2.8 · แบบ cal-2.png จอ 7 · สัญญา §7.1 · R-CAL-13/13b/34)
//   category ลงทะเบียนตอนเปิดแอป: SEC_CAL = เสร็จแล้ว / เลื่อน 1 ชั่วโมง / เลื่อนไปพรุ่งนี้ 09:00 · SEC_CAL_CALL = 3 ปุ่มนั้น + โทรเลย
//   ทุกปุ่ม opensAppToForeground: true (สัญญา §7.1 "รุ่นนี้ทุกปุ่ม true") ⇒ ตัวรับคำตอบ = listener ของ expo-notifications ที่มีอยู่
//     (แอปปิดสนิท: iOS/Android เปิดแอปแล้วส่งคำตอบผ่าน getLastNotificationResponse) — **ไม่ต้องใช้ expo-task-manager** (R-CAL-13b: ใช้เฉพาะแบบไม่เปิดแอป)
//   ปุ่ม → POST items/[id]/done {occ} · snooze {preset} ในนามกิจการของรายการ (data.tenantId) · โทรเลย → GET items/[id].phone → tel: (เบอร์ไม่อยู่ใน payload)
//   หลังทำ = ลบแจ้งเตือนจากถาด + เปิดปฏิทินวันนั้น (data.link) · แตะตัวแจ้งเตือน (ไม่กดปุ่ม) = ตัวจัดการลิงก์เดิม (SEC_LINKS ใน push-register.ts)
import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { calApi, calChanged } from "@/src/api/calendar";

export const CAL_CATEGORY = "SEC_CAL";
export const CAL_CATEGORY_CALL = "SEC_CAL_CALL";
export const CAL_ACTIONS = { done: "CAL_DONE", snooze1h: "CAL_SNOOZE_1H", tomorrow: "CAL_SNOOZE_TOMORROW", call: "CAL_CALL" } as const;

let registered = false;
/** ลงทะเบียน 2 category (ครั้งเดียวต่อการเปิดแอป · เว็บ = ข้าม) — ข้อความปุ่มตามสัญญา §7.1 */
export async function registerCalCategories(): Promise<void> {
  if (registered || Platform.OS === "web") return;
  registered = true;
  const fg = { opensAppToForeground: true };
  const base: Notifications.NotificationAction[] = [
    { identifier: CAL_ACTIONS.done, buttonTitle: "✓ เสร็จแล้ว", options: fg },
    { identifier: CAL_ACTIONS.snooze1h, buttonTitle: "⏰ เลื่อน 1 ชั่วโมง", options: fg },
    { identifier: CAL_ACTIONS.tomorrow, buttonTitle: "⏰ เลื่อนไปพรุ่งนี้ 09:00", options: fg },
  ];
  try {
    await Notifications.setNotificationCategoryAsync(CAL_CATEGORY, base);
    await Notifications.setNotificationCategoryAsync(CAL_CATEGORY_CALL, [...base, { identifier: CAL_ACTIONS.call, buttonTitle: "📞 โทรเลย", options: fg }]);
  } catch {
    registered = false; // ลองใหม่รอบหน้า
  }
}

export type CalPushData = { type: "cal"; itemId: string; occ?: string; tenantId?: string; link?: string };
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** payload ของเตือนปฏิทิน (pure) · ไม่ใช่ = null */
export function calPushData(data: unknown): CalPushData | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.type !== "cal" || typeof d.itemId !== "string" || !ID_RE.test(d.itemId)) return null;
  return {
    type: "cal",
    itemId: d.itemId,
    occ: typeof d.occ === "string" && Number.isFinite(Date.parse(d.occ)) ? d.occ : undefined,
    tenantId: typeof d.tenantId === "string" ? d.tenantId : undefined,
    link: typeof d.link === "string" ? d.link : undefined,
  };
}

/** ปุ่มลัดของปฏิทินที่ต้องทำงาน (pure) · แตะตัวแจ้งเตือน/ปุ่มอื่น = null */
export function calActionOf(actionIdentifier: string | undefined): keyof typeof CAL_ACTIONS | null {
  const hit = (Object.keys(CAL_ACTIONS) as (keyof typeof CAL_ACTIONS)[]).find((k) => CAL_ACTIONS[k] === actionIdentifier);
  return hit ?? null;
}

/** E.164 → tel: (เฉพาะตัวเลขและ + นำหน้า) */
export function telUrl(phone: string | null | undefined): string | null {
  const p = (phone ?? "").replace(/[^\d+]/g, "");
  return /^\+?\d{6,15}$/.test(p) ? `tel:${p}` : null;
}

/**
 * ปุ่มลัดของเตือน: ทำตามปุ่ม → ลบแจ้งเตือน → `open(link)` (ปฏิทินวันนั้น) · คืน true เมื่อเป็นของปฏิทิน (ผู้เรียกไม่ต้องทำต่อ)
 * ล้มเหลว (ออฟไลน์/ปิดไปแล้ว) = ยังเปิดปฏิทินวันนั้นให้ผู้ใช้จัดการเอง
 */
export function handleCalAction(resp: Notifications.NotificationResponse, open: (link: string) => void): boolean {
  const act = calActionOf(resp?.actionIdentifier);
  if (!act) return false;
  const data = calPushData(resp.notification?.request?.content?.data);
  if (!data) return false;
  const run = async () => {
    try {
      if (act === "done") await calApi.done(data.itemId, data.occ, data.tenantId);
      else if (act === "snooze1h") await calApi.snooze(data.itemId, { preset: "1h" }, data.tenantId);
      else if (act === "tomorrow") await calApi.snooze(data.itemId, { preset: "tomorrow9" }, data.tenantId);
      else {
        const r = await calApi.item(data.itemId, data.tenantId);
        const url = telUrl(r.phone);
        if (url) {
          await Linking.openURL(url);
          return; // โทร = ไม่เปิดปฏิทิน
        }
      }
      calChanged();
    } catch {
      // เงียบ — เปิดปฏิทินให้จัดการเอง
    } finally {
      const id = resp.notification?.request?.identifier;
      if (id) void Notifications.dismissNotificationAsync(id).catch(() => {});
    }
    if (data.link) open(data.link);
  };
  void run();
  return true;
}
