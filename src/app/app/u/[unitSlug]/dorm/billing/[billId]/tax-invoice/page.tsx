import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { billTaxInvoice, dormAccess } from "@/lib/modules/dorm";
import TaxInvoicePrint from "@/components/dorm/TaxInvoicePrint";

// SVC D.3 ▸ ใบกำกับภาษีเต็มรูปของบิลหอ (พิมพ์ A4) — ด่านเดียวกับหน้าพิมพ์ใบแจ้งหนี้ D.8 (requireUnit · DORM · dormAccess(...).board)
//   ข้อมูลผ่าน facade `billTaxInvoice` เท่านั้น · ?doc=<docId> = ฉบับที่ระบุ (รวมฉบับที่ถูกยกเลิก) · ไม่ส่ง = ฉบับที่ยังมีผล · ?copy=1 = สำเนา
export default async function DormTaxInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string; billId: string }>;
  searchParams: Promise<{ doc?: string | string[]; copy?: string | string[] }>;
}) {
  const { unitSlug, billId } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!dormAccess(membership, unit.id).board) notFound();
  const docId = typeof sp.doc === "string" && sp.doc ? sp.doc : undefined;
  const model = await billTaxInvoice({ tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, { unitId: unit.id, billId, ...(docId ? { docId } : {}) });
  if (!model) notFound();
  return <TaxInvoicePrint model={model} copy={sp.copy === "1"} />;
}
