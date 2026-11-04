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

// ───────── S2.6 แตะแจ้งเตือนของเลขา → deep link (data.link + data.tenantId) ─────────
// 4 แบบของเซิร์ฟเวอร์ (รออนุมัติ · งานเสร็จ · โควตา · งานประจำ) ต่างกันแค่ link/ข้อความ — แอปอ่าน path อย่างเดียว (ตัด ?e=… / #… ทิ้ง · RESOLUTIONS §N)
// link ที่รับ (สัมพัทธ์ของเราเท่านั้น · id ตัวอักษร/ตัวเลข/_- ≤ 80):
//   /secretary/room/<id> · /secretary/inbox · /secretary/scheduled · /secretary/help/<id> (+ /help/<id> ของเซิร์ฟเวอร์ = ห้องแจ้งปัญหา) · /customers/<id>
//   อื่น ๆ (เช่น /inbox/<convId> ของแชทลูกค้า · ลิงก์ CRM /app/sys/…) = null → ตัวจัดการเดิมใน (app)/_layout ทำต่อ (conversationId → /chat · CRM)
// data.tenantId ต่างจากกิจการ active และผู้ใช้เป็นสมาชิก ⇒ switchTenant ก่อน แล้ว router.push(link)
const SEC_ID = "([A-Za-z0-9_-]{1,80})";
const SEC_LINKS: { re: RegExp; to: (id: string) => string }[] = [
  { re: new RegExp(`^/secretary/room/${SEC_ID}$`), to: (id) => `/secretary/room/${id}` },
  { re: /^\/secretary\/inbox$/, to: () => "/secretary/inbox" },
  { re: /^\/secretary\/scheduled$/, to: () => "/secretary/scheduled" },
  { re: new RegExp(`^/(?:secretary/)?help/${SEC_ID}$`), to: (id) => `/secretary/help/${id}` },
  { re: new RegExp(`^/customers/${SEC_ID}$`), to: (id) => `/customers/${id}` },
];

/** data.link ของ push → เส้นทางในแอปเลขา · ไม่ใช่ลิงก์ของเลขา = null (pure) */
export function secretaryRouteFromLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const s = link.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\")) return null;
  const path = s.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  for (const l of SEC_LINKS) {
    const m = l.re.exec(path);
    if (m) return l.to(m[1] ?? "");
  }
  return null;
}

export type SecretaryPushDeps = {
  activeTenantId: string | null;
  tenantIds: readonly string[];
  switchTenant: (tenantId: string) => Promise<void>;
  push: (href: string) => void;
};

const handledPush = new Set<string>();

/**
 * แตะแจ้งเตือน: ลิงก์ของเลขา ⇒ จัดการ (สลับกิจการถ้าต้อง แล้วเปิด) และคืน true · อื่น ๆ = false (ผู้เรียกทำทางเดิมต่อ)
 * ใบเดิมซ้ำ (listener + เปิดแอปจากแจ้งเตือน) = เปิดครั้งเดียว (จำ identifier)
 */
export function handleSecretaryPush(resp: Notifications.NotificationResponse, deps: SecretaryPushDeps): boolean {
  const data = (resp?.notification?.request?.content?.data ?? {}) as { link?: unknown; tenantId?: unknown };
  const href = secretaryRouteFromLink(data.link);
  if (!href) return false;
  const key = resp.notification.request.identifier ?? "";
  if (key) {
    if (handledPush.has(key)) return true;
    handledPush.add(key);
  }
  const tid = typeof data.tenantId === "string" ? data.tenantId : "";
  const go = async () => {
    try {
      if (tid && tid !== deps.activeTenantId && deps.tenantIds.includes(tid)) await deps.switchTenant(tid);
    } catch {
      // สลับไม่ได้ = เปิดในกิจการเดิม (จอแสดง "ไม่พบ" เอง)
    }
    deps.push(href);
  };
  void go();
  return true;
}

/** เปิดแอปจากการแตะแจ้งเตือนตอนแอปปิดอยู่ — แจ้งเตือนล่าสุดที่เป็นลิงก์เลขา (ยังไม่เคยเปิด) · เปิดแล้วล้าง (ไม่เปิดซ้ำรอบหน้า) */
export function openLastSecretaryPush(deps: SecretaryPushDeps): void {
  try {
    const last = Notifications.getLastNotificationResponse();
    if (last && handleSecretaryPush(last, deps)) Notifications.clearLastNotificationResponse();
  } catch {
    // เงียบ (เว็บ/เครื่องที่ไม่มีโมดูล)
  }
}

/** badge ไอคอนแอป (iOS/Android) = GET secretary/badge ของกิจการ active (ตอนเปิดแอป/กลับมา foreground) · พลาด = ไม่แตะ */
export async function syncAppBadge(fetchBadge: () => Promise<number | null>): Promise<void> {
  if (Platform.OS === "web") return; // เว็บไม่มี badge ไอคอนแอป (และไม่ยิงเส้นเพิ่มในจอ QC)
  try {
    const n = await fetchBadge();
    if (typeof n === "number") await Notifications.setBadgeCountAsync(n);
  } catch {
    // เงียบ
  }
}
