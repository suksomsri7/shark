"use server";
// payment-slip-actions.ts — server action ของสลิปโอน (P3-SKEL R6 R7) · เปลือกบาง: session → ctx/actor → payment-slip.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ payment-slip.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ร้าน + บทบาทมาจาก membership ของ SESSION เท่านั้น · systemId/unitId ถูกตรวจซ้ำในโมดูล
// 🔴 แนบสลิปรับ FormData (ไฟล์รูปจากกล้อง/คลังภาพ) — ไม่ log เนื้อไฟล์ · ไม่มีผลเงิน (ยืนยันเงินเข้ายังเป็น confirmPaymentIntentManual)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { attachSlip, confirmSlip, rejectSlip, slipViewerUrl, type SlipRefusal, type SlipResult } from "./payment-slip";

type Ctx = { tenantId: string; systemId: string; unitId: string };
type Actor = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown> };
const UNKNOWN: SlipRefusal = { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง", messageKey: "platform.slip.errors.unknown" };
const DENIED: SlipRefusal = { ok: false, code: "PERMISSION_DENIED", message: "ไม่มีสิทธิ์ทำรายการนี้", messageKey: "platform.slip.errors.permissionDenied" };

/** ด่านหยาบระดับโมดูล (ไม่มีสาขา) · ด่านละเอียด (สาขา · 24 ชม. · 4-eyes) อยู่ใน payment-slip.ts */
function gateOk(m: ReturnType<typeof posMembership>, actions: string[]): boolean {
  for (const action of actions) {
    try {
      assertCan(m, { module: "pos", action });
      return true;
    } catch {
      // ลองสิทธิ์ถัดไป
    }
  }
  return false;
}

async function run<T>(where: string, gate: string[], systemId: unknown, unitId: unknown, fn: (ctx: Ctx, actor: Actor) => Promise<T>): Promise<T | SlipRefusal> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    if (!gateOk(m, gate)) return DENIED;
    const ctx = { tenantId: auth.active.tenantId, systemId: typeof systemId === "string" ? systemId : "", unitId: typeof unitId === "string" ? unitId : "" };
    return await fn(ctx, { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions });
  } catch (e) {
    unstable_rethrow(e);
    console.error(`[pos/payment-slip-actions] ${where}`, e instanceof Error ? e.name : "error");
    return UNKNOWN;
  }
}

const field = (fd: FormData, k: string): string | undefined => {
  const v = fd.get(k);
  return typeof v === "string" && v !== "" ? v : undefined;
};

/** แนบสลิป — FormData: systemId unitId (saleId + paymentId | intentId) idempotencyKey file [transRef] [amountSatang] [note] */
export async function attachSlipAction(fd: FormData): Promise<SlipResult> {
  return run("attach", ["pos.sale.create", "pos.sale.manage"], fd?.get?.("systemId"), fd?.get?.("unitId"), async (ctx, actor) => {
    const file = fd.get("file");
    if (!(file instanceof Blob)) return { ok: false, code: "VALIDATION", message: "ไม่มีไฟล์สลิป", messageKey: "platform.slip.errors.validation" } satisfies SlipRefusal;
    const amount = field(fd, "amountSatang");
    return attachSlip(ctx, actor, {
      ...(field(fd, "saleId") ? { saleId: field(fd, "saleId") } : {}),
      ...(field(fd, "paymentId") ? { paymentId: field(fd, "paymentId") } : {}),
      ...(field(fd, "intentId") ? { intentId: field(fd, "intentId") } : {}),
      idempotencyKey: field(fd, "idempotencyKey"),
      ...(field(fd, "transRef") ? { transRef: field(fd, "transRef") } : {}),
      ...(amount !== undefined ? { amountSatang: Number(amount) } : {}),
      ...(field(fd, "note") ? { note: field(fd, "note") } : {}),
      file: { contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) },
    });
  });
}

/** ยืนยันสลิป (ผู้จัดการ · ไม่ใช่ผู้แนบ) */
export async function confirmSlipAction(args: { systemId: string; unitId: string; slipId: string }): Promise<SlipResult> {
  return run("confirm", ["pos.shift.manage"], args?.systemId, args?.unitId, (ctx, actor) => confirmSlip(ctx, actor, { slipId: args?.slipId }));
}

/** ปฏิเสธสลิป (ต้องมีเหตุผล) */
export async function rejectSlipAction(args: { systemId: string; unitId: string; slipId: string; reason: string }): Promise<SlipResult> {
  return run("reject", ["pos.shift.manage"], args?.systemId, args?.unitId, (ctx, actor) => rejectSlip(ctx, actor, { slipId: args?.slipId, reason: args?.reason }));
}

/** ลิงก์ดูสลิป (≤ 300 วินาที) */
export async function slipViewerUrlAction(args: { systemId: string; unitId: string; slipId: string }): Promise<{ ok: true; url: string; expiresInSec: number } | SlipRefusal> {
  return run("viewer", ["pos.sale.read", "pos.sale.create"], args?.systemId, args?.unitId, (ctx, actor) => slipViewerUrl(ctx, actor, { slipId: args?.slipId }));
}
