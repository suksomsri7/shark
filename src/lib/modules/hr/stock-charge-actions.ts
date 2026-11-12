"use server";
// HR H4.6 ▸ server actions ของรายการหักค่าของ/ค่าเสียหาย (brief R11) — ร้าน/ผู้ใช้มาจาก session เสมอ · ระบบ HR จากฟอร์มตรวจว่าเป็นของร้านนี้ ·
//   สิทธิ์ สาขา แถวของตัวเอง ตัดสินใน service (stock-charge.ts) · ไม่ส่งเวลาปัจจุบันเข้า service · requestKey = ช่องซ่อนที่หน้าสร้างตอนแสดงผล ·
//   บาท → สตางค์ต้องตรงทุกสตางค์ (ทศนิยมเกิน 2 ตำแหน่ง/รูปแบบผิด = ข้อความยอดหัก) · ผล = redirect ?stock=<รหัสจากรายการอนุญาต> ไม่ใช่ข้อความอิสระ ◂
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { STOCK_MSG, markStockRefundRepaid, requestStockCharge, stockMsgCode, withdrawStockCharge } from "./stock-charge";

type Auth = Awaited<ReturnType<typeof requireTenant>>;
const field = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
async function ctxOf(auth: Auth, fd: FormData): Promise<{ tenantId: string; systemId: string } | null> {
  const systemId = field(fd, "systemId");
  if (!systemId) return null;
  const sys = await tenantDb({ tenantId: auth.active.tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys ? { tenantId: auth.active.tenantId, systemId: sys.id } : null;
}
/** "1,234.50" → 123450 สตางค์ (จำนวนเต็มล้วน ไม่ผ่านทศนิยมลอยตัว) · ว่าง = undefined · รูปแบบผิด = NaN (service ตอบข้อความยอดหัก) */
function bahtToSatang(raw: string): number | undefined {
  const s = raw.replace(/,/g, "");
  if (!s) return undefined;
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return Number.NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}
/** จำนวน: ตัวเลขล้วน → number · ว่าง = undefined · อื่น ๆ = NaN (service ตอบข้อความจำนวน) */
function qtyOf(raw: string): number | undefined {
  if (!raw) return undefined;
  return /^\d{1,6}$/.test(raw) ? Number(raw) : Number.NaN;
}
/** ด่านคีย์ระดับร้านก่อนเรียก service (service ตรวจซ้ำละเอียดกว่า: สาขา · แถวของตัวเอง · ผู้อนุมัติเงินเดือน) */
function keyGate(auth: Auth, actions: string[]): boolean {
  return actions.some((action) => {
    try {
      assertCan(hrViewerOf(auth), { module: "hr", action });
      return true;
    } catch {
      return false;
    }
  });
}
/** r4 F4: ข้อผิดพลาดที่ไม่คาดคิดของ service — ไม่ส่งข้อความฐานข้อมูลถึงจอ (console.error + ข้อความไทยคงที่) */
async function safe<R>(fn: () => Promise<R>): Promise<R | { ok: false; reason: string }> {
  try {
    return await fn();
  } catch (e) {
    console.error("[hr.stock_charge]", e instanceof Error ? e.name : "error");
    return { ok: false, reason: STOCK_MSG["s.failed"]! };
  }
}
const back = (systemId: string, code: string): never => {
  const c = code in STOCK_MSG ? code : "s.failed";
  redirect(`/app/sys/${systemId}/hr/payroll?stock=${encodeURIComponent(c)}#hr-stock`);
};

/** ยื่นรายการหักค่าของ/ค่าเสียหาย (รออนุมัติเสมอ) */
export async function requestStockChargeAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const ctx = await ctxOf(auth, fd);
  if (!ctx) redirect("/app");
  if (!keyGate(auth, ["hr.payadjust.request"])) back(ctx.systemId, "s.noAccess");
  const r = await safe(() => requestStockCharge(ctx, hrViewerOf(auth), {
    requestKey: field(fd, "requestKey"),
    employeeId: field(fd, "employeeId"),
    kind: field(fd, "kind"),
    inventorySystemId: field(fd, "inventorySystemId") || undefined,
    itemId: field(fd, "itemId") || undefined,
    qty: qtyOf(field(fd, "qty")),
    takeStock: field(fd, "takeStock") === "on",
    amountSatang: bahtToSatang(field(fd, "amountBaht")),
    description: field(fd, "description") || undefined,
    consent: { confirmed: field(fd, "consent") === "on", ref: field(fd, "consentRef"), at: field(fd, "consentAt") },
  }));
  if (r.ok) revalidatePath(`/app/sys/${ctx.systemId}/hr/payroll`);
  back(ctx.systemId, r.ok ? "ok.request" : stockMsgCode(r.reason));
}

/** ถอนรายการ (ผู้ยื่นขณะรออนุมัติ / ผู้อนุมัติรายการเงินเดือน — service ตรวจ) */
export async function withdrawStockChargeAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const ctx = await ctxOf(auth, fd);
  if (!ctx) redirect("/app");
  if (!keyGate(auth, ["hr.payadjust.request", "hr.payadjust.approve"])) back(ctx.systemId, "s.noAccess");
  const r = await safe(() => withdrawStockCharge(ctx, hrViewerOf(auth), field(fd, "chargeId"), { reason: field(fd, "reason") }));
  if (r.ok) revalidatePath(`/app/sys/${ctx.systemId}/hr/payroll`);
  back(ctx.systemId, r.ok ? (r.outcome === "REFUND_OWED" ? "ok.refund" : "ok.withdraw") : stockMsgCode(r.reason));
}

/** บันทึกว่าคืนเงินค้างคืนแล้ว (นอกเงินเดือน — เจ้าของ/ผู้อนุมัติรายการเงินเดือน) */
export async function markStockRefundRepaidAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const ctx = await ctxOf(auth, fd);
  if (!ctx) redirect("/app");
  if (!keyGate(auth, ["hr.payadjust.approve"])) back(ctx.systemId, "s.repayPerm");
  const r = await safe(() => markStockRefundRepaid(ctx, hrViewerOf(auth), field(fd, "chargeId"), { ref: field(fd, "repaidRef") }));
  if (r.ok) revalidatePath(`/app/sys/${ctx.systemId}/hr/payroll`);
  back(ctx.systemId, r.ok ? "ok.repaid" : stockMsgCode(r.reason));
}
