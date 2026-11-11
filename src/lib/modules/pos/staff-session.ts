// staff-session.ts — โทเคนผู้ขายบนเครื่อง ฝั่ง client (POS P1.15U · มติผู้คุมงาน 1)
// เก็บใน sessionStorage ต่อเครื่องเท่านั้น: คีย์ `pos-staff:<deviceId>` = { userId, name, role, staffToken, expiresAt }
// 🔴 ห้ามเก็บใน cookie / localStorage (ปิดแท็บ = ต้องใส่ PIN ใหม่) · ทุกการแตะ storage อยู่ใน try (private mode = ไม่จำ → จอล็อก)
// 🔴 ไฟล์ client ล้วน (ไม่ import อะไรที่ถึง prisma) — ใช้ร่วม: หน้าขาย · หน้าบิลวันนี้ · หน้ากะ
import type { RegisterRole } from "./register-shared";
import { getPosDeviceId } from "./device-id";

export type StaffSession = { userId: string; name: string | null; role: RegisterRole; staffToken: string; expiresAt: string };

const keyOf = (deviceId: string) => `pos-staff:${deviceId}`;
const ROLES: readonly string[] = ["OWNER", "MANAGER", "STAFF"];

/** อ่านโทเคนของเครื่องนี้ — ไม่มี/รูปผิด/หมดอายุ = null (หมดอายุ = ลบทิ้งด้วย) */
export function readStaffSession(deviceId: string | undefined = getPosDeviceId()): StaffSession | null {
  if (!deviceId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(keyOf(deviceId));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<StaffSession> | null;
    const ok =
      !!o &&
      typeof o.userId === "string" &&
      typeof o.staffToken === "string" &&
      typeof o.expiresAt === "string" &&
      typeof o.role === "string" &&
      ROLES.includes(o.role) &&
      (o.name === null || typeof o.name === "string");
    if (!ok) return null;
    if (!(Date.parse(o.expiresAt!) > Date.now())) {
      window.sessionStorage.removeItem(keyOf(deviceId));
      return null;
    }
    return { userId: o.userId!, name: o.name ?? null, role: o.role as RegisterRole, staffToken: o.staffToken!, expiresAt: o.expiresAt! };
  } catch {
    return null;
  }
}

export function writeStaffSession(deviceId: string, s: StaffSession): void {
  try {
    window.sessionStorage.setItem(keyOf(deviceId), JSON.stringify(s));
  } catch {
    /* เก็บไม่ได้ — ใช้ได้เฉพาะในหน้านี้ */
  }
}

export function clearStaffSession(deviceId: string | undefined = getPosDeviceId()): void {
  if (!deviceId) return;
  try {
    window.sessionStorage.removeItem(keyOf(deviceId));
  } catch {
    /* ไม่มีอะไรให้ลบ */
  }
}

/** โทเคนที่ใช้งานอยู่ของเครื่องนี้ (ส่งต่อใน staffToken ของทุกคำขอ) — ไม่มี = undefined */
export function currentStaffToken(): string | undefined {
  return readStaffSession()?.staffToken;
}
