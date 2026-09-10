import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { listPointLedgerForMemberSystem, pointKpiForMemberSystem } from "@/lib/modules/point";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { PointLedgerView } from "@/components/member/PointLedgerView";

// หน้า "แต้ม" — ledger รวม + KPI (M2.2 · พิมพ์เขียว §3.5 · ภาพ 16 ใช้อ้างอิงหน้าตั้งค่า หน้านี้เป็นหน้ารวม)
//
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ / อ่านโมดูลสมาชิกไม่ได้ → notFound()
// 🔴 ตัวเลขทุกก้อนมาจาก `point/service.ts` — หน้าไม่คิดเลขเอง

const LEDGER_TYPES = new Set(["EARN", "BURN", "ADJUST", "REVERSE", "EXPIRE", "TRANSFER"]);

export default async function PointsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const typeRaw = one(rawQuery.type).toUpperCase();
  const type = LEDGER_TYPES.has(typeRaw) ? (typeRaw as "EARN" | "BURN" | "ADJUST" | "REVERSE" | "EXPIRE" | "TRANSFER") : undefined;
  const unitId = one(rawQuery.unitId) || undefined;
  const q = one(rawQuery.q) || undefined;

  const [kpi, ledger, units] = await Promise.all([
    pointKpiForMemberSystem(tenantId, id),
    listPointLedgerForMemberSystem(tenantId, id, { type, unitId, q, take: 60 }),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div data-testid="points-page" className="flex flex-col gap-5">
      <PageHeader
        title="แต้ม"
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="ระบบแต้มสะสม — ยอดออก ใช้ หมดอายุ และหนี้สินคงค้างทั้งหมดอยู่ที่นี่"
        actions={
          <>
            <Link href={`/app/sys/${id}/member/points/expiring`} className="btn btn-ghost text-sm">
              ใกล้หมดอายุ
            </Link>
            {hasMemberPerm(actor, "member.point.adjust") || canReadMember(actor) ? (
              <Link href={`/app/sys/${id}/member/points/adjust`} className="btn btn-ghost text-sm">
                ปรับแต้ม
              </Link>
            ) : null}
            {hasMemberPerm(actor, "member.settings.manage") ? (
              <Link href={`/app/sys/${id}/member/points/settings`} className="btn btn-primary text-sm">
                ตั้งค่าแต้ม
              </Link>
            ) : null}
          </>
        }
      />
      <MemberTabs systemId={id} actor={actor} />
      <PointLedgerView
        systemId={id}
        kpi={kpi}
        rows={ledger.rows}
        total={ledger.total}
        units={units}
        filter={{ type: type ?? "", q: q ?? "", unitId: unitId ?? "" }}
      />
    </div>
  );
}
