"use server";
// table-split-actions.ts — server action ของแยกบิล · ย้าย/รวมโต๊ะ · ใบรายการ (POS P2.5 · จอ P2.5U 15B/15C + 03) · เปลือกบาง: session → ctx/actor → งาน → คืนผลตามเดิม
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function (ชนิดข้อมูลอยู่ table-split-shared.ts / pre-bill-render.ts / register-shared.ts)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ขัดข้องที่ไม่คาดคิด = UNKNOWN (แบบ table-actions)
// 🔴 ร้าน + ผู้ใช้ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำในงาน
//    ด่านหน้า: เข้าสาขาได้ + pos.sale.create หรือ pos.sale.read — สิทธิ์ของแต่ละงาน (pos.sale.create · restaurant.session.move|merge) ตรวจในงาน (มติ 10)
// จ่ายใบ = quoteRegisterCartAction / submitRegisterSaleAction เดิม (cart/sale ที่มี tableSplitPartId · lines: [] · expectedSplitVersion = quote.split.version)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { registerCancelSplit, registerSplitDetail, registerSplitTable } from "./table-split";
import { registerMergeTables, registerMoveTable, registerTablePreBill } from "./table";
import type { RegisterActor, RegisterCtx, RegisterRefusal } from "./register-shared";
import { cookieDeviceId } from "./device-request"; // POS P5.2 ▸ CD-P52-O4b ◂
import type { RegisterSplitTableInput, SplitPlanView } from "./table-split-shared";
import type { PreBillPayload } from "./pre-bill-render";

type Session = Awaited<ReturnType<typeof requireTenant>>;
type Target = { systemId: string; unitId: string; deviceId?: string };
type Ok<T = object> = ({ ok: true } & T) | RegisterRefusal;

function refusal(code: RegisterRefusal["code"], message: string): RegisterRefusal {
  return { ok: false, code, message };
}
function unexpected(where: string, e: unknown): RegisterRefusal {
  console.error(`[pos/table-split-actions] ${where}`, e);
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
/** session → ctx + actor · เข้าสาขาไม่ได้ = NOT_FOUND · ไม่มีทั้ง pos.sale.create และ pos.sale.read = PERMISSION_DENIED */
async function sessionScope(auth: Session, args: unknown): Promise<{ ctx: RegisterCtx; actor: RegisterActor } | RegisterRefusal> {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  let allowed = false;
  for (const action of ["pos.sale.create", "pos.sale.read"]) {
    try {
      assertCan(m, { module: "pos", action, unitId });
      allowed = true;
      break;
    } catch {
      /* ลองสิทธิ์ถัดไป */
    }
  }
  if (!allowed) return refusal("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ใช้หน้าขาย — ขอให้เจ้าของร้านเพิ่มสิทธิ์");
  const deviceId = await cookieDeviceId({ tenantId: auth.active.tenantId, unitId: unitId }); // POS P5.2 ▸ CD-P52-O4b: เครื่อง = คุกกี้ลงนามเท่านั้น (device-request.ts) · deviceId ของ client ถูกทิ้ง ◂
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}
/** โครงร่วมของทุก action: session → ขอบเขต → งาน · ขัดข้อง = UNKNOWN */
async function run<T>(where: string, args: unknown, body: (ctx: RegisterCtx, actor: RegisterActor) => Promise<T | RegisterRefusal>): Promise<T | RegisterRefusal> {
  const auth = await session(where);
  if ("ok" in auth) return auth;
  try {
    const s = await sessionScope(auth, args);
    if ("ok" in s) return s;
    return await body(s.ctx, s.actor);
  } catch (e) {
    return unexpected(where, e);
  }
}

/** สร้าง/แทนแผนแยกบิล (15B/15C) — TABLE_SPLIT_EXISTS พก splitId/version ของแผนปัจจุบัน */
export async function registerSplitTableAction(args: Target & { split: RegisterSplitTableInput }): Promise<Ok<{ split: SplitPlanView }>> {
  try {
    return await run("registerSplitTableAction", args, (ctx, actor) => registerSplitTable(ctx, actor, args.split));
  } catch (e) {
    return unexpected("registerSplitTableAction", e);
  }
}

/** ยกเลิกแผน (ยังไม่มีใบจ่าย) */
export async function registerCancelSplitAction(args: Target & { splitId: string; expectedVersion: number }): Promise<Ok> {
  try {
    return await run("registerCancelSplitAction", args, (ctx, actor) => registerCancelSplit(ctx, actor, { splitId: args.splitId, expectedVersion: args.expectedVersion }));
  } catch (e) {
    return unexpected("registerCancelSplitAction", e);
  }
}

/** แผนของโต๊ะ + รายการนอกแผน */
export async function registerSplitDetailAction(args: Target & { tableSessionId: string }): Promise<Ok<{ split: SplitPlanView | null; outsideItemIds: string[] }>> {
  try {
    return await run("registerSplitDetailAction", args, (ctx, actor) => registerSplitDetail(ctx, actor, { tableSessionId: args.tableSessionId }));
  } catch (e) {
    return unexpected("registerSplitDetailAction", e);
  }
}

/** ย้ายโต๊ะ (โต๊ะว่าง) */
export async function registerMoveTableAction(args: Target & { tableSessionId: string; toTableId: string }): Promise<Ok<{ changed: boolean; reservationOverridden?: true }>> {
  try {
    return await run("registerMoveTableAction", args, (ctx, actor) => registerMoveTable(ctx, actor, { tableSessionId: args.tableSessionId, toTableId: args.toTableId }));
  } catch (e) {
    return unexpected("registerMoveTableAction", e);
  }
}

/** รวมโต๊ะ (1–5 โต๊ะเข้าโต๊ะปลายทาง) */
export async function registerMergeTablesAction(args: Target & { intoSessionId: string; fromSessionIds: string[] }): Promise<Ok<{ changed: boolean }>> {
  try {
    return await run("registerMergeTablesAction", args, (ctx, actor) => registerMergeTables(ctx, actor, { intoSessionId: args.intoSessionId, fromSessionIds: args.fromSessionIds }));
  } catch (e) {
    return unexpected("registerMergeTablesAction", e);
  }
}

/** ใบรายการ (ทั้งโต๊ะ หรือใบแยกบิล) — payload พิมพ์ที่เครื่องด้วย pre-bill-render.ts */
export async function registerTablePreBillAction(
  args: Target & { tableSessionId?: string; tableSplitPartId?: string; locale?: "th" | "en"; copy?: boolean },
): Promise<Ok<{ payload: PreBillPayload }>> {
  try {
    return await run("registerTablePreBillAction", args, (ctx, actor) =>
      registerTablePreBill(
        ctx,
        actor,
        args.tableSplitPartId ? { tableSplitPartId: args.tableSplitPartId, locale: args.locale ?? null, copy: args.copy ?? null } : { tableSessionId: args.tableSessionId ?? "", locale: args.locale ?? null, copy: args.copy ?? null },
      ),
    );
  } catch (e) {
    return unexpected("registerTablePreBillAction", e);
  }
}
