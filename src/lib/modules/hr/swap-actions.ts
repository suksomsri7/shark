"use server";
// HR H2.3 ▸ server actions ของคำขอสลับกะ (brief R11 · แบบ H1.2 settings-actions.ts) — ร้าน/ผู้ใช้มาจาก session เสมอ ·
//   ไม่รับ id พนักงานจากฟอร์ม (ผู้ขอ = เจ้าของกะที่ผูกบัญชีผู้กด · §C.7) · ระบบ HR จากฟอร์มใช้คู่กับร้านจาก session (ระบบอื่น = ไม่พบ) ·
//   ข้อความปฏิเสธ = ข้อความเดียวกับ service ทุกไบต์ · ผลลัพธ์ = DTO ของ service เท่านั้น (id/สถานะ/คำเตือน — ไม่มีชื่อ/เหตุผลของคนอื่น)
//   respond/cancel ใช้กับ ConfirmDialog (form action → void · ปฏิเสธ = โยนข้อความไทยคงที่ แบบ cancelLeaveAction) ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { cancelSwap, decideSwap, requestSwap, respondSwap, SWAP_REFUSAL, type SwapActor, type SwapStatus } from "./swap";
import type { RosterWarning } from "./roster-rules";

type Auth = Awaited<ReturnType<typeof requireTenant>>;
type Ctx = { tenantId: string; systemId: string };
type Fail = { ok: false; reason: string };

/** ปฏิเสธจาก action แบบฟอร์ม (ConfirmDialog) — ข้อความไทยคงที่ */
class HrSwapActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HrSwapActionError";
  }
}

const actorOf = (auth: Auth): SwapActor => hrViewerOf(auth);
const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** ระบบ HR จากฟอร์ม + ร้านจาก session — service ค้นทุกแถวด้วย (tenantId, systemId) คู่นี้ ⇒ ระบบที่ไม่ใช่ของร้าน/ไม่ใช่ HR = ไม่พบ */
function ctxOf(auth: Auth, fd: FormData): Ctx | null {
  const systemId = field(fd, "systemId");
  return systemId ? { tenantId: auth.active.tenantId, systemId } : null;
}
const done = () => revalidatePath("/app/approvals");

export async function requestSwapAction(fd: FormData): Promise<{ ok: true; id: string } | Fail> {
  const auth = await requireTenant();
  const ctx = ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: SWAP_REFUSAL.shiftNotFound };
  const r = await requestSwap(ctx, actorOf(auth), {
    fromEntryId: field(fd, "fromEntryId"),
    targetEmployeeId: field(fd, "targetEmployeeId") || null,
    toEntryId: field(fd, "toEntryId") || null,
    reason: field(fd, "reason") || null,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  done();
  return { ok: true, id: r.id };
}

export async function respondSwapAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const ctx = ctxOf(auth, fd);
  if (!ctx) throw new HrSwapActionError(SWAP_REFUSAL.stale);
  const r = await respondSwap(ctx, actorOf(auth), field(fd, "swapId"), { accept: field(fd, "accept") === "1" });
  if (!r.ok) throw new HrSwapActionError(r.reason);
  done();
}

export async function cancelSwapAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const ctx = ctxOf(auth, fd);
  if (!ctx) throw new HrSwapActionError(SWAP_REFUSAL.stale);
  const r = await cancelSwap(ctx, actorOf(auth), field(fd, "swapId"));
  if (!r.ok) throw new HrSwapActionError(r.reason);
  done();
}

export async function decideSwapAction(fd: FormData): Promise<{ ok: true; status: SwapStatus; warnings: RosterWarning[] } | Fail> {
  const auth = await requireTenant();
  const ctx = ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: SWAP_REFUSAL.stale };
  // ด่านคีย์ระดับร้าน (Q9: ผู้จัดตาราง) — service ตรวจซ้ำแบบเข้ม (คีย์ที่ให้ไว้ชัด · สาขาของทั้งสองกะ · ไม่ใช่คู่กรณี)
  //   ยื่น/ตอบรับ/ยกเลิก ไม่มีด่านคีย์: สิทธิ์ = ตัวตน (ผู้กดต้องเป็นพนักงานที่ผูกกับกะ/คำขอนั้น — service ตรวจใต้ล็อก) แบบใบลาของตัวเอง
  try {
    assertCan(hrViewerOf(auth), { module: "hr", action: "hr.employee.create" });
  } catch {
    return { ok: false, reason: SWAP_REFUSAL.noPermission };
  }
  const d = field(fd, "decision");
  const r = await decideSwap(ctx, actorOf(auth), field(fd, "swapId"), { decision: d === "APPROVED" ? "APPROVED" : d === "REJECTED" ? "REJECTED" : ("" as "APPROVED") });
  if (!r.ok) return { ok: false, reason: r.reason };
  done();
  return { ok: true, status: r.status, warnings: r.warnings };
}
// ◂ HR H2.3
