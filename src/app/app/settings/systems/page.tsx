import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { removeSystemAction } from "@/lib/actions/systems";
import { AddSystemForm } from "@/components/add-system-form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// จัดการระบบของกิจการ: ดูว่าเปิดอะไรไว้บ้าง · เอาออก · เพิ่มใหม่
// (เดิมหน้านี้มีแต่ฟอร์มเพิ่ม — เจ้าของสั่ง 31 ส.ค. "ขาดฟังก์ชันลบระบบ ลบกิจการ")
export default async function ManageSystemsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  const { removed } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const isOwner = auth.active.role === "OWNER";
  // สิทธิ์แก้ข้อมูลสาขา — ถามเป็นราย **สาขา** เพราะ `unitAccess` จำกัดคนให้คุมได้แค่บางสาขา
  // 🔴 ปุ่มที่กดแล้วเจอ 404 = โกหกผู้ใช้ ⇒ ต้องใช้ตัวตัดสินตัวเดียวกับหน้าปลายทางและ server action
  const membership = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  const canEditUnit = (unitId: string) =>
    evaluate(membership, { module: "systems", action: "systems.unit.update", unitId });

  const [units, systems] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const rows = [
    ...units.map((u) => ({
      kind: "business" as const,
      id: u.id,
      name: u.name,
      def: systemDef(u.type),
      href: `/app/u/${u.slug}`,
      // ทางเข้าหน้าตั้งค่าสาขา (ที่อยู่/แผนที่) — WO-CV14 ข · มีเฉพาะแถวที่เป็น "กิจการ/สาขา"
      // 🔴 หน้าที่ไม่มีทางเข้าคือหน้าที่ไม่มีใครใช้ (ปุ่ม "แผนที่ร้าน" ในแชทชี้ทางมาที่นี่)
      settingsHref: canEditUnit(u.id) ? `/app/settings/units/${u.id}` : null,
    })),
    ...systems.map((s) => ({
      kind: "feature" as const,
      id: s.id,
      name: s.name,
      def: systemDef(s.type),
      href: `/app/sys/${s.id}`,
      settingsHref: null as string | null,
    })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <PageHeader
        title="จัดการระบบ"
        desc="ระบบที่เปิดใช้อยู่ในกิจการนี้ — เพิ่มใหม่หรือเอาออกได้"
      />

      {removed === "1" && <p className="text-sm">เอาระบบออกแล้ว ✓</p>}

      <Section title={`ระบบที่เปิดอยู่ (${rows.length})`}>
        {rows.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่ได้เปิดระบบใด</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="text-lg">{r.def?.icon ?? "📦"}</span>
                <div className="min-w-0 flex-1">
                  <Link href={r.href} className="block truncate text-sm font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    {r.def?.label ?? r.kind}
                  </div>
                </div>
                {r.settingsHref && (
                  <Link href={r.settingsHref} className="btn btn-ghost text-xs">
                    ตั้งค่าสาขา
                  </Link>
                )}
                {isOwner && (
                  <ConfirmDialog
                    triggerLabel="เอาออก"
                    triggerClassName="btn btn-ghost text-xs"
                    title={`เอา "${r.name}" ออกจากกิจการ?`}
                    detail="ระบบจะหายจากเมนูและหน้าแรกทันที · ข้อมูลเดิม (บิล นัดหมาย สต็อก) ยังถูกเก็บไว้ตามกฎหมายบัญชี ไม่ได้ถูกลบ"
                    confirmLabel="ยืนยัน เอาออก"
                    danger
                    action={removeSystemAction}
                    fields={{ kind: r.kind, id: r.id }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {!isOwner && (
          <p className="mt-2 text-xs text-[color:var(--color-muted)]">
            เฉพาะเจ้าของกิจการเท่านั้นที่เอาระบบออกได้
          </p>
        )}
      </Section>

      <Section title="เพิ่มระบบ">
        <p className="text-xs text-[color:var(--color-muted)]">
          เลือกระบบที่ต้องการ สร้างกี่ระบบก็ได้ — ทุกระบบเชื่อมถึงกันได้
        </p>
        <AddSystemForm />
      </Section>

      <Section title="กิจการนี้">
        <div className="flex flex-wrap gap-2">
          <Link href="/onboarding?add=1" className="btn btn-ghost text-sm">
            + เพิ่มกิจการใหม่
          </Link>
          <Link href="/app/settings/privacy" className="btn btn-ghost text-sm">
            ขอลบกิจการนี้ →
          </Link>
        </div>
        <p className="mt-2 text-xs text-[color:var(--color-muted)]">
          การลบกิจการมีระยะพัก 30 วันก่อนลบจริง (ยกเลิกได้ในช่วงนั้น) — ทำที่หน้าความเป็นส่วนตัว
        </p>
      </Section>
    </div>
  );
}
