import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import {
  auditHistory,
  bookingFunnel,
  depositsReport,
  exportCsv,
  forecast30,
  housekeepingReport,
  isCsvKind,
  occupancyReport,
  revenueReport,
  type HotelReportCtx,
} from "@/lib/modules/hotel";

// SVC H.7 ▸ ส่งออก CSV รายงานโรงแรม (ใบสั่ง h.7 §0 · §2.8 · X6) — ตรวจสิทธิ์เดียวกับหน้า: requireUnit + "HOTEL" + hotel.reports.read
//   (ประวัติปิดวัน: hotel.reports.read หรือ hotel.audit.run) · ตัวรายงานตรวจ Membership สดซ้ำเอง · UTF-8 BOM · ทุกช่องผ่าน csvRow
//   ชื่อไฟล์ = ชนิด + id หน่วย + ช่วงวันที่ (ไม่มีชื่อร้าน/ชื่อหน่วย) · ?kind=&from=&to=&groupBy=
export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request, { params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "";
  if (!isCsvKind(kind)) notFound();
  const canRead = evaluate(m, { module: "hotel", action: "hotel.reports.read", unitId: unit.id });
  const canAudit = evaluate(m, { module: "hotel", action: "hotel.audit.run", unitId: unit.id });
  if (!(canRead || (kind === "history" && canAudit))) notFound();

  const fromQ = url.searchParams.get("from") ?? "";
  const toQ = url.searchParams.get("to") ?? "";
  const range = YMD.test(fromQ) && YMD.test(toQ) ? { from: fromQ, to: toQ } : {};
  const groupBy = url.searchParams.get("groupBy") ?? "";
  const ctx: HotelReportCtx = { tenantId: auth.active.tenantId, actorUserId: auth.active.userId };
  const base = { unitId: unit.id, ...range };

  let rows: Record<string, unknown>[] = [];
  let total: Record<string, unknown> | undefined;
  let tag = "";
  if (kind === "history") {
    const h = await auditHistory({ tenantId: auth.active.tenantId }, base);
    if (!h.ok) notFound();
    rows = h.rows;
  } else {
    const r =
      kind === "occupancy"
        ? await occupancyReport(ctx, { ...base, groupBy: groupBy === "month" ? "month" : "day" })
        : kind === "revenue"
          ? await revenueReport(ctx, { ...base, groupBy: groupBy === "ratePlan" || groupBy === "roomType" ? groupBy : "source" })
          : kind === "funnel"
            ? await bookingFunnel(ctx, base)
            : kind === "forecast"
              ? await forecast30(ctx, { unitId: unit.id })
              : kind === "housekeeping" || kind === "housekeepingUsers"
                ? await housekeepingReport(ctx, base)
                : await depositsReport(ctx, base);
    if (!r.ok) notFound();
    // r3: แถวรวมท้ายตาราง (occupancy/revenue = total ของรายงาน · funnel = ยอดรวมทุกแหล่ง · แม่บ้าน = Σ ห้องที่ทำเสร็จ)
    if ("rows" in r) rows = r.rows;
    else if ("byDay" in r) rows = kind === "housekeepingUsers" ? r.byUser : r.byDay;
    else rows = [r];
    if ("total" in r) total = r.total;
    else if ("confirmRateBps" in r) total = { created: r.created, confirmed: r.confirmed, cancelled: r.cancelled, noShow: r.noShow, confirmRateBps: r.confirmRateBps, cancelRateBps: r.cancelRateBps, leadTimeDaysAvg: r.leadTimeDaysAvg, alosNights: r.alosNights };
    else if ("byDay" in r) total = { cleaned: rows.reduce((s, x) => s + (typeof x.cleaned === "number" ? x.cleaned : 0), 0) };
    if ("from" in r && "to" in r) tag = `-${r.from}-${r.to}`;
    else if ("from" in r) tag = `-${r.from}`;
  }
  const csv = exportCsv(kind, rows, total);
  const safe = (v: string) => v.replace(/[^0-9A-Za-z_-]/g, "").slice(0, 64);
  const filename = `hotel-${kind}-${safe(unit.id)}${safe(tag)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
