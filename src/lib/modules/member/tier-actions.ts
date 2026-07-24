"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { setTierConfig, type TierConfigRow, type TierName } from "./service";

// Member tier-config actions — ตรวจสิทธิ์โมดูล member
// convention action = "member.<entity>.<verb>" (F6 ratchet บังคับให้ไฟล์ action เรียก assertCan)
function assertMemberCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "member", action },
  );
}

export type SaveTierConfigState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

// รับเป็นบาท → สตางค์ (ยอดขั้นต่ำของระดับ) — ค่าติดลบ/ไม่ใช่ตัวเลข → 0
const bahtToSatang = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

const TIERS: TierName[] = ["SILVER", "GOLD", "PLATINUM"];

// ── บันทึกเกณฑ์ระดับสมาชิก (ชื่อ + ยอดขั้นต่ำต่อระดับ) ──
export async function saveTierConfigAction(
  _prev: SaveTierConfigState,
  formData: FormData,
): Promise<SaveTierConfigState> {
  const auth = await requireTenant();
  assertMemberCan(auth, "member.tier.update");

  const systemId = String(formData.get("systemId") ?? "").trim();
  const rows: TierConfigRow[] = TIERS.map((tier) => ({
    tier,
    label: String(formData.get(`${tier}_label`) ?? "").trim(),
    minSpendSatang: bahtToSatang(formData.get(`${tier}_baht`)),
  }));

  try {
    await setTierConfig({ tenantId: auth.active.tenantId }, rows);
    if (systemId) revalidatePath(`/app/sys/${systemId}`);
    return { status: "ok" };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
}
