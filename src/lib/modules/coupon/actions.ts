"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import {
  createCoupon,
  toggleCoupon,
  validate,
  type ValidateReason,
} from "./service";

const bahtToSatang = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};
const intOrNull = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
};
const dateOrNull = (v: FormDataEntryValue | null): Date | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export type CreateState = { status: "idle" } | { status: "error"; message: string } | { status: "ok" };

// สร้างคูปอง
export async function createCouponAction(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const systemId = String(formData.get("systemId") ?? "");
  if (!systemId) return { status: "error", message: "ไม่พบระบบคูปอง" };

  const type = String(formData.get("type") ?? "PERCENT") === "FIXED" ? "FIXED" : "PERCENT";
  const res = await createCoupon({
    tenantId,
    systemId,
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? "").trim() || String(formData.get("code") ?? ""),
    type,
    percent: type === "PERCENT" ? intOrNull(formData.get("percent")) : null,
    valueSatang: type === "FIXED" ? bahtToSatang(formData.get("value")) : null,
    minSpendSatang: bahtToSatang(formData.get("minSpend")),
    maxDiscountSatang: type === "PERCENT" ? bahtToSatang(formData.get("maxDiscount")) : null,
    usageLimit: intOrNull(formData.get("usageLimit")),
    perMemberLimit: intOrNull(formData.get("perMemberLimit")),
    applicableUnitIds: formData.getAll("unitIds").map(String).filter(Boolean),
    startAt: dateOrNull(formData.get("startAt")),
    endAt: dateOrNull(formData.get("endAt")),
  });
  if (!res.ok) return { status: "error", message: res.reason };
  revalidatePath(`/app/sys/${systemId}`);
  return { status: "ok" };
}

// เปิด/ปิด คูปอง
export async function toggleCouponAction(formData: FormData) {
  const auth = await requireTenant();
  const systemId = String(formData.get("systemId") ?? "");
  const couponId = String(formData.get("couponId") ?? "");
  if (systemId && couponId) await toggleCoupon(auth.active.tenantId, systemId, couponId);
  revalidatePath(`/app/sys/${systemId}`);
}

// ── ทดลอง validate ผ่าน UI ──
export type ValidateState =
  | { status: "idle" }
  | { status: "ok"; discountSatang: number; name: string; code: string }
  | { status: "error"; reason: ValidateReason | "INPUT" };

export async function testValidateAction(
  _prev: ValidateState,
  formData: FormData,
): Promise<ValidateState> {
  const auth = await requireTenant();
  const systemId = String(formData.get("systemId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const amount = Number(String(formData.get("amount") ?? "").trim());
  if (!systemId || !code || !Number.isFinite(amount) || amount < 0) {
    return { status: "error", reason: "INPUT" };
  }
  const memberId = String(formData.get("memberId") ?? "").trim() || null;
  const unitId = String(formData.get("unitId") ?? "").trim() || null;
  const res = await validate({
    code,
    tenantId: auth.active.tenantId,
    systemId,
    memberId,
    unitId,
    amountSatang: Math.round(amount * 100),
  });
  if (res.ok) {
    return { status: "ok", discountSatang: res.discountSatang, name: res.name, code: res.code };
  }
  return { status: "error", reason: res.reason };
}
