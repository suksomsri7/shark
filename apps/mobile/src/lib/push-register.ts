// ลงทะเบียนรับ push — ขอ permission + Expo push token → POST /api/mobile/push/register
// เรียกหลังเข้าโซนกิจการ ((app)/_layout) · best-effort: ปฏิเสธ permission/พลาด = เงียบ ไม่กวน UX
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "@/src/api/client";

// 🔴 projectId ต้องอ่านจาก app.json เสมอ ห้ามพิมพ์ซ้ำในโค้ด (บทเรียน 22 ส.ค.)
// เดิมฮาร์ดโค้ด `c24ec712-…` = โปรเจกต์ของบัญชี @siamdive ที่เลิกใช้ไปตั้งแต่ย้ายบัญชี 20 ส.ค.
// → ขอ token ด้วย id ที่แอปไม่ได้เป็นเจ้าของ = ลงทะเบียน push ไม่ติด (และ catch กลืนเงียบ)
const PROJECT_ID: string | undefined =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

let registered = false;
let lastToken: string | null = null;

export async function registerPush(): Promise<void> {
  if (registered) return;
  try {
    const token = await currentPushToken({ ask: true });
    if (!token) return;
    await api("/api/mobile/push/register", { body: { expoToken: token, platform: Platform.OS } });
    registered = true;
  } catch {
    // เงียบ — ลงทะเบียนใหม่ครั้งหน้าได้เสมอ
  }
}

/**
 * token ของเครื่องนี้ — ใช้ตอน logout เพื่อบอกเซิร์ฟเวอร์ให้ลบทะเบียนเครื่องทิ้ง
 * ask=false (ค่าเริ่มต้น) จะไม่เด้งขอ permission ใหม่ — logout ไม่ควรถามอะไรผู้ใช้
 */
export async function currentPushToken(opts?: { ask?: boolean }): Promise<string | null> {
  if (lastToken) return lastToken;
  try {
    if (!Device.isDevice) return null; // simulator ไม่มี push token
    if (!PROJECT_ID) return null;
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== "granted") {
      if (!opts?.ask) return null;
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;
    lastToken = (await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })).data ?? null;
    return lastToken;
  } catch {
    return null;
  }
}

/** logout แล้วต้องลงทะเบียนใหม่ตอน login ครั้งหน้า (คนละบัญชีบนเครื่องเดียวกัน) */
export function resetPushRegistration(): void {
  registered = false;
  lastToken = null;
}

// แตะ notification แล้วเข้าห้องแชทที่เกี่ยว (data.conversationId) — คืน id หรือ null
export function conversationIdFromNotification(resp: Notifications.NotificationResponse): string | null {
  const data = resp.notification.request.content.data as { conversationId?: unknown } | undefined;
  return typeof data?.conversationId === "string" ? data.conversationId : null;
}
