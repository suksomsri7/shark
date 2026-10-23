"use server";
// deposit-actions.ts — POS P2.9bU ▸ server action ของมัดจำ (เปลือกบาง: session → ctx/actor → deposit.* → คืนผลตามเดิม) ◂
//   รับมัดจำ (registerTakeDeposit) · ค้นมัดจำ (registerDepositLookup) · คืนเงินมัดจำคงเหลือ (registerRefundDeposit) — สัญญา ledger/wo-notes/pos-P2.9b.md §P2.9bU
//
// 🔴 ไม่มีพฤติกรรมเซิร์ฟเวอร์ใหม่: ทุกการตรวจ (ค่าตั้งเปิดรับมัดจำ · สิทธิ์ pos.sale.create / pos.sale.refund / PIN ผู้จัดการ · กะ · เครื่อง ·
//    คีย์กันซ้ำ · 4 หลักท้าย + ตัวนับผิด/ล็อก) อยู่ใน deposit.ts — ไฟล์นี้แค่ประกอบ ctx/actor จาก SESSION แบบ register-actions.ts
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function (ชนิดข้อมูลอยู่ที่ deposit.ts — client import แบบ type เท่านั้น)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ขัดข้องที่ไม่คาดคิด = UNKNOWN (จอรับมัดจำลองซ้ำด้วยคีย์เดิม)
// 🔴 ร้าน (tenantId) และผู้ใช้ (role · unitAccess · permissions) มาจาก membership ของ session เท่านั้น — systemId/unitId จากคำขอถูกตรวจซ้ำใน deposit.ts (registerScopeCheck)
// 🔴 ไม่ log ค่า phone / phoneLast4 / managerPin (console.error ของ unexpected พิมพ์แค่ชื่อจุด + error)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import {
  registerDepositLookup,
  registerRefundDeposit,
  registerTakeDeposit,
  type RegisterDepositLookupResult,
  type RegisterRefundDepositInput,
  type RegisterRefundDepositResult,
  type RegisterTakeDepositInput,
  type RegisterTakeDepositResult,
} from "./deposit";
import type { RegisterActor, RegisterCtx, RegisterRefusal } from "./register-shared";
import { bindCtxDevice, cookieDeviceId, type DeviceBindRefusal } from "./device-request"; // POS P5.2 ▸ CD-P52-O4b ◂

type Session = Awaited<ReturnType<typeof requireTenant>>;
/** deviceId (ไม่บังคับ) = รหัสเครื่องจาก localStorage — deposit.ts ตรวจรูปแบบ (ผิด = VALIDATION) · กะของเครื่อง */
type Target = { systemId: string; unitId: string; deviceId?: string };

function refusal(code: RegisterRefusal["code"], message: string): RegisterRefusal {
  return { ok: false, code, message };
}
function unexpected(where: string, e: unknown): RegisterRefusal {
  console.error(`[pos/deposit-actions] ${where}`, e);
  return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}
async function session(where: string): Promise<Session | RegisterRefusal> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    return unexpected(`${where} requireTenant`, e);
  }
}
/**
 * session → ขอบเขต + ผู้ใช้ (ด่านเดียวกับ register-actions.ts sessionScope): เข้าสาขาไม่ได้ = NOT_FOUND ·
 * ไม่มี pos.sale.create ที่สาขา = PERMISSION_DENIED — deposit.ts ตรวจซ้ำ (registerScopeCheck · REG_SELL_PERMS) และสิทธิ์คืนเงินเอง
 */
async function sessionScope(auth: Session, args: unknown): Promise<{ ctx: RegisterCtx; actor: RegisterActor } | RegisterRefusal> {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  try {
    assertCan(m, { module: "pos", action: "pos.sale.create", unitId });
  } catch {
    return refusal("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ขาย — ขอให้เจ้าของร้านเพิ่มสิทธิ์");
  }
  const deviceId = await cookieDeviceId({ tenantId: auth.active.tenantId, unitId: unitId }); // POS P5.2 ▸ CD-P52-O4b: เครื่อง = คุกกี้ลงนามเท่านั้น (device-request.ts) · deviceId ของ client ถูกทิ้ง ◂
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  };
}

/** R2 — รับมัดจำที่หน้าขาย (แผ่น deposit-receive) · input ส่งต่อทั้งก้อน (deposit.ts ตรวจทุกช่อง) */
export async function registerTakeDepositAction(args: Target & { input: RegisterTakeDepositInput }): Promise<RegisterTakeDepositResult | DeviceBindRefusal> {
  const auth = await session("registerTakeDepositAction");
  if ("ok" in auth) return auth;
  try {
    const s0 = await sessionScope(auth, args);
    if ("ok" in s0) return s0;
    const sb = await bindCtxDevice(s0.ctx); // POS P5.2 ▸ CD-P52-O4b: งานนี้ผูกกะ/เครื่อง — ไม่มีคุกกี้ + สาขามีเครื่อง = DEVICE_NOT_PAIRED · เพิกถอน = DEVICE_REVOKED ◂
    if (!sb.ok) return sb;
    const s = { ...s0, ctx: sb.ctx };
    return await registerTakeDeposit(s.ctx, s.actor, args?.input as RegisterTakeDepositInput);
  } catch (e) {
    return unexpected("registerTakeDepositAction", e);
  }
}

/** R9 — ค้นมัดจำ (จอชำระ · หน้าบิล) · query = เลขใบรับ (ตรงตัว) / ชื่อ (ขึ้นต้น) · memberId = มัดจำของสมาชิกในบิล · phoneLast4 = ยืนยันผู้ถือ (นับครั้งผิด) */
export async function registerDepositLookupAction(args: Target & { query?: string; phoneLast4?: string; memberId?: string }): Promise<RegisterDepositLookupResult> {
  const auth = await session("registerDepositLookupAction");
  if ("ok" in auth) return auth;
  try {
    const s = await sessionScope(auth, args);
    if ("ok" in s) return s;
    const input: { query?: string; phoneLast4?: string; memberId?: string } = {};
    if (typeof args?.query === "string") input.query = args.query;
    if (typeof args?.phoneLast4 === "string") input.phoneLast4 = args.phoneLast4;
    if (typeof args?.memberId === "string") input.memberId = args.memberId;
    return await registerDepositLookup(s.ctx, s.actor, input);
  } catch (e) {
    return unexpected("registerDepositLookupAction", e);
  }
}

/** R8 — คืนเงินมัดจำคงเหลือทั้งหมด (หน้าบิล) · pos.sale.refund หรือ managerPin + managerUserId (ตรวจใน deposit.ts) */
export async function registerRefundDepositAction(args: Target & { input: RegisterRefundDepositInput }): Promise<RegisterRefundDepositResult> {
  const auth = await session("registerRefundDepositAction");
  if ("ok" in auth) return auth;
  try {
    const s = await sessionScope(auth, args);
    if ("ok" in s) return s;
    return await registerRefundDeposit(s.ctx, s.actor, args?.input as RegisterRefundDepositInput);
  } catch (e) {
    return unexpected("registerRefundDepositAction", e);
  }
}
