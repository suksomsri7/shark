// call-prompt.ts — "กดโทรจากการ์ดดีล → วางสาย → แผ่นบันทึกสายเด้งเอง" (ใบ C3.7 · ภาพ 13 ข)
// telUrl + markPendingCall: จอดีลจำ "สายที่รอบันทึก" (ผู้ติดต่อ · ดีล · เวลาเริ่ม) ไว้ในหน่วยความจำ แล้วเปิด `tel:<เบอร์>` ด้วย Linking
// useCallPrompt: แอปลงพื้นหลัง (หน้าโทรของเครื่อง) แล้วกลับมา "active" ⇒ เปิด /crm/call-log พร้อมระยะเวลาโดยประมาณให้กรอกต่อ
// 🔴 URL `tel:` มีแต่เบอร์ (ไม่มี token/รหัสใด ๆ) · ไม่เก็บลงดิสก์ (ปิดแอปทิ้ง = ไม่ต้องเด้งถาม)
import { useEffect } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";

type PendingCall = { contactId: string; dealId: string | null; systemId: string | null; startedAt: number; backgrounded: boolean };
let pending: PendingCall | null = null;

/** กลับมา active โดยไม่เคยลงพื้นหลัง (กดยกเลิกหน้าต่าง "โทร?" ของระบบ) และจำไว้นานกว่านี้แล้ว = ไม่ได้โทรจริง ⇒ ลืม */
const NO_CALL_FORGET_MS = 15_000;
/** กลับมาช้ากว่านี้ = ไม่เกี่ยวกับสายนั้นแล้ว (ไม่เด้งถามตอนเปิดแอปวันถัดไป) */
const MAX_AWAY_MS = 3 * 60 * 60 * 1000;

/** URL โทรออกของเครื่อง — มีแต่ตัวเลข/+ ของเบอร์ (ไม่มีอะไรอื่นใน URL) · เบอร์สั้นผิดปกติ = null */
export function telUrl(phone: string): string | null {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  return digits.length >= 3 ? `tel:${digits}` : null;
}

/** จำสายที่กำลังจะโทร (เรียกก่อน `Linking.openURL(tel:…)`) */
export function markPendingCall(target: { contactId: string; dealId: string | null; systemId: string | null }): void {
  pending = { ...target, startedAt: Date.now(), backgrounded: false };
}

/** เปิดหน้าโทรไม่ได้ → ลืมสายนั้น (ไม่เด้งแผ่นบันทึกของสายที่ไม่ได้โทร) */
export function clearPendingCall(): void {
  pending = null;
}

/** แอปลงพื้นหลังระหว่างมีสายรอ (หน้าโทรของเครื่องเปิดอยู่จริง) */
export function markCallBackgrounded(): void {
  if (pending) pending.backgrounded = true;
}

/**
 * เส้นทางของแผ่นบันทึกสายสำหรับสายที่รออยู่ (แล้วล้างทิ้ง) — เด้งเฉพาะเมื่อแอป **เคยลงพื้นหลัง** ระหว่างนั้น (รีวิว SF-3)
 * ไม่เคยลงพื้นหลัง: จำไว้ไม่เกิน 15 วิ (หน้าต่างถามโทรของระบบ) · นานกว่านั้น = ลืม · ลงพื้นหลังแล้วแต่หายไปเกิน 3 ชม. = ไม่เด้ง
 */
export function takePendingCallRoute(now = Date.now()): string | null {
  const p = pending;
  if (!p) return null;
  const away = now - p.startedAt;
  if (!p.backgrounded) {
    if (away > NO_CALL_FORGET_MS) pending = null;
    return null;
  }
  pending = null;
  if (away > MAX_AWAY_MS) return null;
  const q = [`contactId=${encodeURIComponent(p.contactId)}`, `durationSec=${Math.round(away / 1000)}`];
  if (p.dealId) q.push(`dealId=${encodeURIComponent(p.dealId)}`);
  if (p.systemId) q.push(`systemId=${encodeURIComponent(p.systemId)}`);
  return `/crm/call-log?${q.join("&")}`;
}

/** ติดตั้งใน layout ของโซน CRM: AppState กลับมา "active" + มีสายรอ ⇒ router.push ไปแผ่นบันทึกสาย */
export function useCallPrompt(): void {
  const router = useRouter();
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") markCallBackgrounded();
      if (state !== "active") return;
      const route = takePendingCallRoute();
      if (route) router.push(route);
    });
    return () => sub.remove();
  }, [router]);
}
