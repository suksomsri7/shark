import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { linkUnitAction, unlinkUnitAction } from "@/lib/actions/systems";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

// หน้ารวมการเชื่อมระบบ (คำสั่งเจ้าของ 24 ก.ค.) — จัดการที่เดียวสำหรับกิจการหลายสาขา
// ตาราง: แถว = ระบบ feature · คอลัมน์ = สาขา · ช่อง = ปุ่มติ๊กเชื่อม/ถอด (reuse action เดิม)
// สาขาเดียว = ทุกระบบเชื่อมกันอัตโนมัติ (createSystemAutoLink) → ไม่ต้องมีตาราง
export default async function ConnectionsSettingsPage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const back = "/app/settings/connections";

  const [units, systems, links] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.appSystem.findMany({
      where: { tenantId },
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    }),
    prisma.appSystemUnit.findMany({ where: { tenantId } }),
  ]);
  // key = `${systemId}:${unitId}` → เชื่อมอยู่
  const linkedSet = new Set(links.map((l) => `${l.systemId}:${l.unitId}`));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="สาขาและการเชื่อมระบบ"
        desc="เลือกว่าระบบไหนทำงานกับสาขาใด — ติ๊กเพื่อเชื่อม กดเครื่องหมายถูกเพื่อถอด"
      />

      {units.length <= 1 ? (
        <EmptyState text="กิจการมีสาขาเดียว — ทุกระบบเชื่อมกันอัตโนมัติ" />
      ) : systems.length === 0 ? (
        <EmptyState
          text="ยังไม่มีระบบให้เชื่อม — เพิ่มระบบก่อนจากเมนู"
          action={{ href: "/app", label: "ไปหน้าหลัก" }}
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 z-10 bg-[color:var(--color-surface)] px-3 py-2 text-left font-medium">
                  ระบบ
                </th>
                {units.map((u) => (
                  <th key={u.id} className="px-3 py-2 text-center font-medium">
                    {u.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {systems.map((s) => {
                const def = systemDef(s.type);
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 bg-[color:var(--color-surface)] px-3 py-2 whitespace-nowrap">
                      {`${def?.icon ?? ""} ${s.name}`.trim()}
                    </td>
                    {units.map((u) => {
                      const linked = linkedSet.has(`${s.id}:${u.id}`);
                      return (
                        <td key={u.id} className="px-3 py-2 text-center">
                          {linked ? (
                            <ConfirmDialog
                              triggerLabel="✓"
                              triggerClassName="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--color-accent)] text-sm font-bold text-white hover:opacity-90"
                              title="ยกเลิกการเชื่อมระบบนี้?"
                              detail={`สาขา "${u.name}" จะถูกตัดการเชื่อมกับระบบ "${s.name}"`}
                              confirmLabel="ยืนยันยกเลิกการเชื่อม"
                              danger
                              action={unlinkUnitAction}
                              fields={{ systemId: s.id, unitId: u.id, back }}
                            />
                          ) : (
                            <form action={linkUnitAction} className="flex justify-center">
                              <input type="hidden" name="systemId" value={s.id} />
                              <input type="hidden" name="unitId" value={u.id} />
                              <input type="hidden" name="back" value={back} />
                              <button
                                type="submit"
                                aria-label={`เชื่อม ${s.name} กับ ${u.name}`}
                                title="กดเพื่อเชื่อม"
                                className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
                              >
                                +
                              </button>
                            </form>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
