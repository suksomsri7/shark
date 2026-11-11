import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { resolveSettings } from "@/lib/core/settings";
import { addDaysYmd, auditHistory, auditPreview, businessDateOf, normalizeTimezone } from "@/lib/modules/hotel";
import { closeNightAuditAction, reopenNightAuditAction } from "@/lib/modules/hotel/actions";
import NightAuditPanel from "@/components/hotel/NightAuditPanel";
import AuditHistory from "@/components/hotel/AuditHistory";
import { exportHref } from "@/components/hotel/reports-shared";

// SVC H.7 ▸ จอ "ปิดวัน" (night audit · ใบสั่ง h.7 §4) — การ์ดวันที่จะปิด + ตัวอย่าง + ปุ่มปิดวัน (ยืนยัน) · ประวัติวันปิด + เปิดอีกครั้ง (ผู้จัดการ · เหตุผล)
//   ด่าน: requireUnit · หน่วยต้องเป็น "HOTEL" · สิทธิ์ hotel.audit.run (ไม่มี ⇒ notFound) · ปุ่มเปิดอีกครั้ง = OWNER/MANAGER เท่านั้น (ตรวจซ้ำใน night-audit.ts)
//   ?date= ใช้ได้เฉพาะหน่วยที่ยังไม่เคยปิด (เลือกวันเริ่มใช้ ≤ เมื่อวาน)
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { params: Promise<{ unitSlug: string }> } & { searchParams: Promise<SearchParams> };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default async function HotelAuditPage({ params, searchParams }: PageProps) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  if (!evaluate(actor, { module: "hotel", action: "hotel.audit.run", unitId: unit.id })) notFound();
  const canReopen = auth.active.role === "OWNER" || auth.active.role === "MANAGER";
  const ctx = { tenantId: auth.active.tenantId };
  const tz = normalizeTimezone(unit.settings && typeof unit.settings === "object" && !Array.isArray(unit.settings) ? (unit.settings as Record<string, unknown>).timezone : null);
  const today = businessDateOf(tz, new Date());
  const maxStart = addDaysYmd(today, -1);

  let preview = await auditPreview(actor, ctx, { unitId: unit.id });
  const wanted = typeof sp.date === "string" && YMD.test(sp.date) && sp.date <= maxStart ? sp.date : null;
  if (preview.ok && preview.firstAudit && wanted) preview = await auditPreview(actor, ctx, { unitId: unit.id, businessDate: wanted });
  if (!preview.ok) notFound();
  const [history, st] = await Promise.all([
    auditHistory(ctx, { unitId: unit.id, from: addDaysYmd(today, -60), to: today }),
    resolveSettings(ctx, ["rooms.hotel.audit.autoClose", "rooms.hotel.nightAuditTime"], { unitId: unit.id }),
  ]);
  const auditTime = typeof st["rooms.hotel.nightAuditTime"]?.value === "string" ? String(st["rooms.hotel.nightAuditTime"]?.value) : "03:00";
  const autoClose = st["rooms.hotel.audit.autoClose"]?.value !== false;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">ปิดวัน (night audit)</h1>
        <span className="flex-1" />
        <a href={`/app/u/${unitSlug}/hotel/reports`} className="flex min-h-[44px] items-center rounded-xl border border-[color:var(--color-line)] px-4 text-sm font-medium">
          กลับไปหน้ารายงาน
        </a>
      </header>
      <NightAuditPanel preview={preview} canClose autoClose={autoClose} auditTime={auditTime} maxStart={maxStart} actions={{ close: closeNightAuditAction.bind(null, unitSlug) }} />
      <AuditHistory
        rows={history.ok ? history.rows : []}
        canReopen={canReopen}
        csvHref={exportHref(`/app/u/${unitSlug}`, "history", { from: addDaysYmd(today, -60), to: today })}
        actions={{ reopen: reopenNightAuditAction.bind(null, unitSlug) }}
      />
    </div>
  );
}
