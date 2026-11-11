"use server";
// qr-staff-actions.ts — server action ฝั่งพนักงานของ QR (POS P2.7U) · เปลือกบาง: session → ctx/actor → qr-staff.* / order.*Link / table.registerRotateTableQr
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ qr-staff-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ขัดข้องที่ไม่คาดคิด = INTERNAL
// 🔴 ร้าน + ผู้ใช้มาจาก membership ของ SESSION เท่านั้น · ด่านชั้นแรก = เข้าสาขาได้ + pos.sale.read | pos.sale.create · ปลายทางตรวจซ้ำ
//    (ลิงก์สั่งล่วงหน้า = pos.channel.manage ใน order.ts · เปลี่ยน QR โต๊ะ = restaurant.table.rotateQr ใน table.ts)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { createOrderLink, getOrderLink, revokeOrderLink, rotateOrderLink } from "./order";
import { registerRotateTableQr } from "./table";
import { qrTableRounds, qrTableTokens } from "./qr-staff";
import type { QrOrderLinkResult, QrTableRoundsResult, QrTablesResult } from "./qr-staff-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import { cookieDeviceId } from "./device-request"; // POS P5.2 ▸ CD-P52-O4b ◂

type Target = { systemId: string; unitId: string; deviceId?: string };
type Refusal = { ok: false; code: string; message: string; messageKey?: string };

function unexpected(where: string, e: unknown): Refusal {
  unstable_rethrow(e);
  console.error(`[pos/qr-staff-actions] ${where}`, e);
  return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}
async function sessionScope(args: unknown): Promise<{ ctx: RegisterCtx; actor: RegisterActor } | Refusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" };
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" };
  const allowed = ["pos.sale.read", "pos.sale.create"].some((action) => {
    try {
      assertCan(m, { module: "pos", action, unitId });
      return true;
    } catch {
      return false;
    }
  });
  if (!allowed) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน" };
  const deviceId = await cookieDeviceId({ tenantId: auth.active.tenantId, unitId: unitId }); // POS P5.2 ▸ CD-P52-O4b: เครื่อง = คุกกี้ลงนามเท่านั้น (device-request.ts) · deviceId ของ client ถูกทิ้ง ◂
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId ? { deviceId } : {}) }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}
async function run<T>(where: string, args: unknown, body: (ctx: RegisterCtx, actor: RegisterActor) => Promise<T>): Promise<T | Refusal> {
  try {
    const s = await sessionScope(args);
    if ("ok" in s) return s;
    return await body(s.ctx, s.actor);
  } catch (e) {
    return unexpected(where, e);
  }
}
const linkOut = (r: Awaited<ReturnType<typeof getOrderLink>>): QrOrderLinkResult =>
  r.ok ? { ok: true, link: r.link } : { ok: false, code: r.code, message: r.message, ...(r.messageKey ? { messageKey: r.messageKey } : {}) };

/** รอบ QR โต๊ะของวันนี้ (จอ 09 · แถว "หน้าร้าน QR") */
export async function qrTableRoundsAction(args: Target): Promise<QrTableRoundsResult> {
  return run("qrTableRoundsAction", args, (ctx, actor) => qrTableRounds(ctx, actor));
}
/** QR ของทุกโต๊ะ (แผงโต๊ะ + แผ่นพิมพ์) */
export async function qrTablesAction(args: Target): Promise<QrTablesResult> {
  return run("qrTablesAction", args, (ctx, actor) => qrTableTokens(ctx, actor));
}
/** เปลี่ยน QR ของโต๊ะ (สติกเกอร์เก่าใช้ไม่ได้ทันที) — restaurant.table.rotateQr */
export async function rotateTableQrAction(args: Target & { tableId: string }): Promise<{ ok: true; tableId: string; qrToken: string } | Refusal> {
  return run("rotateTableQrAction", args, async (ctx, actor) => {
    const r = await registerRotateTableQr(ctx, actor, { tableId: typeof args?.tableId === "string" ? args.tableId : "" });
    return r.ok ? r : { ok: false as const, code: r.code, message: r.message };
  });
}
/** ลิงก์สั่งล่วงหน้าที่ใช้อยู่ของสาขา (null = ยังไม่มี) — pos.channel.manage */
export async function getOrderLinkAction(args: Target): Promise<QrOrderLinkResult> {
  return run("getOrderLinkAction", args, async (ctx, actor) => linkOut(await getOrderLink(ctx, actor)));
}
export async function createOrderLinkAction(args: Target): Promise<QrOrderLinkResult> {
  return run("createOrderLinkAction", args, async (ctx, actor) => linkOut(await createOrderLink(ctx, actor)));
}
/** เปลี่ยนลิงก์ (ลิงก์/QR เดิมใช้ไม่ได้ทันที) */
export async function rotateOrderLinkAction(args: Target): Promise<QrOrderLinkResult> {
  return run("rotateOrderLinkAction", args, async (ctx, actor) => linkOut(await rotateOrderLink(ctx, actor)));
}
/** ปิดลิงก์ (ไม่มีลิงก์ที่ใช้ได้จนกว่าจะสร้างใหม่) */
export async function revokeOrderLinkAction(args: Target): Promise<QrOrderLinkResult> {
  return run("revokeOrderLinkAction", args, async (ctx, actor) => linkOut(await revokeOrderLink(ctx, actor)));
}
