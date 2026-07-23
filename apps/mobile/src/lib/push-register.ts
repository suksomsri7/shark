// ลงทะเบียนรับ push — ขอ permission + Expo push token → POST /api/mobile/push/register
// เรียกหลังเข้าโซนกิจการ ((app)/_layout) · best-effort: ปฏิเสธ permission/พลาด = เงียบ ไม่กวน UX
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "@/src/api/client";

let registered = false;
export async function registerPush(): Promise<void> {
  if (registered) return;
  try {
    if (!Device.isDevice) return; // simulator ไม่มี push token
    const perm = await Notifications.getPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: "c24ec712-4c6f-438c-95d4-44ab9f2428a2" })).data;
    if (!token) return;
    await api("/api/mobile/push/register", { body: { expoToken: token, platform: Platform.OS } });
    registered = true;
  } catch {
    // เงียบ — ลงทะเบียนใหม่ครั้งหน้าได้เสมอ
  }
}

// แตะ notification แล้วเข้าห้องแชทที่เกี่ยว (data.conversationId) — คืน id หรือ null
export function conversationIdFromNotification(resp: Notifications.NotificationResponse): string | null {
  const data = resp.notification.request.content.data as { conversationId?: unknown } | undefined;
  return typeof data?.conversationId === "string" ? data.conversationId : null;
}
