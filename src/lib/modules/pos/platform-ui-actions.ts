"use server";
// platform-ui-actions.ts — POS P3-SKEL U ▸ CD-SKELU-2: server action ของจอโครงแพลตฟอร์ม · เปลือกบาง: session → membership → ฟังก์ชันโมดูล
//   ตัวช่วยพิมพ์ LAN (print-relay.ts: list · register · revoke · enqueue) · กระทบยอดรับเงิน (payment-reconcile.ts: รายงาน · CSV) · แถวชำระที่แนบสลิปได้ (slip-targets.ts)
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ไฟล์โมดูล
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ร้าน + บทบาทมาจาก membership ของ SESSION เท่านั้น · systemId/unitId ถูกตรวจซ้ำในโมดูล
// 🔴 ด่านที่นี่ = ด่านหยาบระดับโมดูล (มีสิทธิ์อย่างใดอย่างหนึ่ง) · ด่านละเอียดต่อสาขาอยู่ในโมดูลทุกตัว
// 🔴 ไม่ log ข้อมูลที่ส่งมา (โทเคน agent · ไบต์งานพิมพ์) — log ได้แค่ชื่อ error

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { enqueuePrintJob, listPrintAgents, registerPrintAgent, revokePrintAgent, type PrintAgentView, type PrintJobView, type PrintRelayRefusal } from "./print-relay";
import { reportIntentReconcile, reportIntentReconcileCsv, type ReconcileRefusal, type ReconcileResult } from "./payment-reconcile";
import { slipTargets, type SlipTargetsResult } from "./slip-targets";

type Ctx = { tenantId: string; systemId: string; unitId: string };
type Actor = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown> };
type Target = { systemId: string; unitId: string };
type Refusal = { ok: false; code: "PERMISSION_DENIED" | "UNKNOWN"; message: string };
const DENIED: Refusal = { ok: false, code: "PERMISSION_DENIED", message: "ไม่มีสิทธิ์ทำรายการนี้" };
const UNKNOWN: Refusal = { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };

/** ด่านหยาบระดับโมดูล (ไม่มีสาขา) — มีสิทธิ์อย่างใดอย่างหนึ่งในชุด */
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

async function run<T>(where: string, gate: string[], args: Partial<Target> | undefined, fn: (ctx: Ctx, actor: Actor) => Promise<T>): Promise<T | Refusal> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    if (!gateOk(m, gate)) return DENIED;
    const ctx = { tenantId: auth.active.tenantId, systemId: typeof args?.systemId === "string" ? args.systemId : "", unitId: typeof args?.unitId === "string" ? args.unitId : "" };
    return await fn(ctx, { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions });
  } catch (e) {
    unstable_rethrow(e);
    console.error(`[pos/platform-ui-actions] ${where}`, e instanceof Error ? e.name : "error");
    return UNKNOWN;
  }
}

/** ตัวช่วยพิมพ์ของสาขา (ไม่มีโทเคน/แฮช) — ผู้จัดการเครื่อง หรือคนขาย (ทางพิมพ์ LAN เลือก agent) */
export async function listPrintAgentsAction(args: Target): Promise<{ ok: true; agents: PrintAgentView[] } | PrintRelayRefusal | Refusal> {
  return run("agents", ["pos.device.manage", "pos.sale.create"], args, (c, a) => listPrintAgents(c, a));
}

/** ลงทะเบียนตัวช่วยพิมพ์ — โทเคนคืนครั้งเดียว (จอแสดงครั้งเดียวแล้วล้าง) */
export async function registerPrintAgentAction(args: Target & { input: unknown }): Promise<{ ok: true; agent: PrintAgentView; token: string } | PrintRelayRefusal | Refusal> {
  return run("register", ["pos.device.manage"], args, (c, a) => registerPrintAgent(c, a, args?.input));
}

/** เพิกถอนตัวช่วยพิมพ์ — โทเคนใช้ไม่ได้ทันที */
export async function revokePrintAgentAction(args: Target & { agentId: string }): Promise<{ ok: true; agent: PrintAgentView } | PrintRelayRefusal | Refusal> {
  return run("revoke", ["pos.device.manage"], args, (c, a) => revokePrintAgent(c, a, { agentId: args?.agentId }));
}

/** ส่งงานพิมพ์ (ไบต์ ESC/POS ที่เบราว์เซอร์เรนเดอร์แล้ว) เข้าคิวของตัวช่วยพิมพ์ — ผล = "ส่งเข้าคิวแล้ว" ไม่ใช่ "พิมพ์แล้ว" (W5) */
export async function enqueuePrintJobAction(args: Target & { input: unknown }): Promise<{ ok: true; job: PrintJobView; replayed?: boolean } | PrintRelayRefusal | Refusal> {
  return run("enqueue", ["pos.sale.create"], args, (c, a) => enqueuePrintJob(c, a, args?.input));
}

/** รายงานกระทบยอดใบขอรับเงิน (อ่านอย่างเดียว · ทีละสาขา · ≤ 92 วัน) */
export async function reconcileReportAction(args: Target & { from: string; to: string }): Promise<ReconcileResult | Refusal> {
  return run("reconcile", ["pos.report.view"], args, (c, a) => reportIntentReconcile(c, a, { from: args?.from, to: args?.to }));
}

/** CSV ของรายงานกระทบยอด (หัวตรึง · มี BOM) */
export async function reconcileCsvAction(args: Target & { from: string; to: string }): Promise<{ ok: true; csv: string; filename: string } | ReconcileRefusal | Refusal> {
  return run("reconcile-csv", ["pos.report.view"], args, (c, a) => reportIntentReconcileCsv(c, a, { from: args?.from, to: args?.to }));
}

/** แถวชำระโอน/พร้อมเพย์ของบิล (paymentId สำหรับแนบสลิป) + สลิปของบิล — อ่านอย่างเดียว */
export async function slipTargetsAction(args: Target & { saleId: string }): Promise<SlipTargetsResult | Refusal> {
  return run("slip-targets", ["pos.sale.read", "pos.sale.create"], args, (c, a) => slipTargets(c, a, { saleId: args?.saleId }));
}
