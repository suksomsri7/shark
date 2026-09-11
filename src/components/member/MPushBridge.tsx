"use client";

// MPushBridge.tsx — สะพาน push ของหน้าลูกค้า `/m/*` เมื่อเปิดอยู่ในแอป (WebView) (M3.11 · D4)
//
// สัญญากับแอป: หน้าเว็บส่ง `{type:"push-bridge-ready"}` ให้แอปเมื่อพร้อม → แอปส่ง
//   `{ type: "push-token", expoToken: "ExponentPushToken[…]", platform: "ios"|"android" }` กลับเข้ามา
//   → หน้าเว็บลงทะเบียนเครื่องให้ลูกค้าที่ล็อกอินอยู่ (MemberPushDevice · แจ้งเตือนสมาชิก M3.6 ใช้ device นี้)
// ทางลงทะเบียน = REST `POST /api/v1/member/me/push-devices` (service `registerPushDevice` ตัวเดียวกัน):
//   • แอปแนบ `customerToken` (`cs_…` ของลูกค้าที่แอปถือเอง) มาด้วย → ยิง REST ตรงด้วย Bearer นั้น
//   • ไม่แนบ (กรณีปกติ — ลูกค้าล็อกอินในหน้าเว็บ · cookie เป็น httpOnly JS อ่าน token ไม่ได้)
//     → server action `registerMyPushDeviceAction` อ่าน session จาก cookie แล้วเรียก service เดียวกัน
// 🔴 ทำงานเฉพาะในแอปเท่านั้น (UA มี `SharkCustomer/` หรือมี `window.ReactNativeWebView`) — เบราว์เซอร์ทั่วไป
//    ไม่ฟังข้อความเลย: กันเว็บอื่นเปิดหน้านี้เป็น popup แล้ว postMessage token เครื่องตัวเองมาผูกกับบัญชีลูกค้า
//    (แจ้งเตือนของลูกค้าจะเด้งไปเครื่องคนร้าย) · ข้อความที่มาจากหน้าต่างอื่น (`ev.source` ≠ หน้านี้) ถูกทิ้งเสมอ
// 🔴 ไม่วาดอะไรให้เห็น (มีแค่ตัวยึด data-testid ไว้ให้ QC ตรวจว่าฝังแล้ว)
import { useEffect } from "react";
import { registerMyPushDeviceAction } from "@/lib/modules/member/me-actions";

const PUSH_DEVICES_REST = "/api/v1/member/me/push-devices";

type RnWindow = Window & { ReactNativeWebView?: { postMessage: (s: string) => void } };
type PushTokenMessage = { type: "push-token"; expoToken: string; platform: string | null; customerToken: string | null };

function parse(data: unknown): PushTokenMessage | null {
  let raw: unknown = data;
  if (typeof data === "string") {
    try {
      raw = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.type !== "push-token" || typeof m.expoToken !== "string" || !m.expoToken.trim()) return null;
  return {
    type: "push-token",
    expoToken: m.expoToken.trim(),
    platform: typeof m.platform === "string" ? m.platform : null,
    customerToken: typeof m.customerToken === "string" && m.customerToken.startsWith("cs_") ? m.customerToken : null,
  };
}

async function register(slug: string, m: PushTokenMessage): Promise<void> {
  if (m.customerToken) {
    await fetch(PUSH_DEVICES_REST, {
      method: "POST",
      headers: {
        authorization: `Bearer ${m.customerToken}`,
        "content-type": "application/json",
        "idempotency-key": `m-push-${m.expoToken.slice(-24)}-${Date.now()}`,
      },
      body: JSON.stringify({ expoToken: m.expoToken, ...(m.platform ? { platform: m.platform } : {}) }),
    }).catch(() => null);
    return;
  }
  await registerMyPushDeviceAction({ slug, expoToken: m.expoToken, platform: m.platform }).catch(() => null);
}

export function MPushBridge({ slug }: { slug: string }) {
  useEffect(() => {
    const w = window as RnWindow;
    const inApp = /SharkCustomer\//.test(navigator.userAgent) || !!w.ReactNativeWebView;
    if (!inApp) return;
    let last = "";
    const onMessage = (ev: Event) => {
      const me = ev as MessageEvent;
      if (me.source && me.source !== window) return;
      const m = parse(me.data);
      if (!m || m.expoToken === last) return;
      last = m.expoToken;
      void register(slug, m);
    };
    // iOS ส่งเข้า window · Android (react-native-webview) ส่งเข้า document — ฟังทั้งสองทาง
    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage);
    w.ReactNativeWebView?.postMessage(JSON.stringify({ type: "push-bridge-ready", slug }));
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message", onMessage);
    };
  }, [slug]);

  return <span data-testid="m-push-bridge" hidden aria-hidden />;
}

export default MPushBridge;
