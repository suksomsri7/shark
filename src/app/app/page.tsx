import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";

// หน้าแรก — "ระบบทั้งหมด" ของร้าน (ทุกระบบเท่าเทียมกัน: ธุรกิจ + feature)
export default async function OverviewPage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [units, appSystems, links] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
    prisma.appSystemUnit.findMany({ where: { tenantId } }),
  ]);
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? "";

  const cards = [
    ...units.map((u) => {
      const def = systemDef(u.type);
      const linked = links.filter((l) => l.unitId === u.id).length;
      return {
        key: `u-${u.id}`,
        href: `/app/u/${u.slug}`,
        icon: def?.icon ?? "•",
        typeLabel: `ระบบ${def?.label ?? u.type}`,
        name: u.name,
        detail: linked > 0 ? `เชื่อมต่อ ${linked} ระบบ` : "ยังไม่เชื่อมต่อระบบอื่น",
        createdAt: u.createdAt,
      };
    }),
    ...appSystems.map((s) => {
      const def = systemDef(s.type);
      const linkedUnits = links.filter((l) => l.systemId === s.id).map((l) => unitName(l.unitId));
      return {
        key: `s-${s.id}`,
        href: `/app/sys/${s.id}`,
        icon: def?.icon ?? "•",
        typeLabel: `ระบบ${def?.label ?? s.type}`,
        name: s.name,
        detail: linkedUnits.length > 0 ? `เชื่อมกับ ${linkedUnits.join(", ")}` : "ยังไม่เชื่อมต่อ",
        createdAt: s.createdAt,
      };
    }),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ระบบทั้งหมด</h1>
        <Link href="/app/settings/systems" className="btn btn-primary text-sm">
          + เพิ่มระบบ
        </Link>
      </div>

      {cards.length === 0 ? (
        <div className="card text-center text-sm text-[color:var(--color-muted)]">
          ยังไม่มีระบบ — กด "เพิ่มระบบ" เพื่อเริ่มต้น
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.key} href={c.href} className="card hover:bg-[color:var(--color-surface-2)]">
              <div className="flex items-center gap-2 text-sm text-[color:var(--color-muted)]">
                <span>{c.icon}</span>
                <span>{c.typeLabel}</span>
              </div>
              <div className="mt-1 text-lg font-medium">{c.name}</div>
              <div className="mt-3 text-xs text-[color:var(--color-muted)]">{c.detail}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
