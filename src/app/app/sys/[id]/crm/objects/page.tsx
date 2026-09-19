import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import * as objects from "@/lib/modules/crm/objects";
import { OBJECT_PARENT_LABEL } from "@/lib/modules/crm/objects-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// ข้อมูลกำหนดเอง — สารบัญวัตถุ (CRM v2 · ใบ C1.9 · รีวิว S3) — `/app/sys/{id}/crm/objects`
// ทางเข้าเดียวที่ทุกคนที่มีคีย์ crm.record.read ไปถึงรายการของทุกวัตถุได้ (รวมวัตถุที่ "ไม่ผูกกับใคร" ซึ่งไม่มีแท็บใน 360)
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM v2 · ไม่มีคีย์ crm.record.read = notFound() · หน้า GET ไม่เขียน
// 🔴 จำนวนรายการในหน้านี้ = ตัวนับรวมของวัตถุ (ไม่ใช่ "ที่คุณเห็น") จึงไม่แสดงให้ผู้ที่ถูกจำกัดการมองเห็น — เปิดหน้ารายการเพื่อดูจำนวนจริง
export default async function ObjectsIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  // AUDIT-CLASS X2: สารบัญวัตถุ = อ่านรายการของวัตถุ ต้องมีคีย์ crm.record.read
  if (!crmCan(actor, "crm.record.read")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const list = await objects.list(ctx, actor);
  const showCounts = actor.role === "OWNER";
  const canManage = crmCan(actor, "crm.object.manage");

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="objects-index-page">
      <PageHeader title="ข้อมูลกำหนดเอง" back={{ href: `/app/sys/${id}`, label: sys.name }} desc="ข้อมูลเฉพาะกิจการของระบบ CRM นี้ เช่น รถ สัตว์เลี้ยง สัญญา — เลือกเพื่อดูรายการ" />
      <ModuleTabs items={crmNavItems(id)} />
      {list.length === 0 ? (
        <section className="card p-4 text-sm text-[color:var(--color-muted)]" data-testid="objects-index-empty">
          ระบบนี้ยังไม่มีข้อมูลกำหนดเอง
          {canManage && (
            <>
              {" — "}
              <Link href={`/app/sys/${id}/crm/settings/objects`} className="underline" data-testid="objects-index-settings-link">
                เพิ่มได้ที่หน้าตั้งค่าวัตถุ
              </Link>
            </>
          )}
        </section>
      ) : (
        <ul className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {list.map((o) => (
            <li key={o.key}>
              <Link href={`/app/sys/${id}/crm/objects/${o.key}`} className="card flex flex-col gap-1 p-4 hover:underline" data-testid="objects-index-link">
                <span className="font-semibold">{o.labelPlural || o.label}</span>
                <span className="text-xs text-[color:var(--color-muted)]">
                  ผูกกับ{OBJECT_PARENT_LABEL[o.parentType]}
                  {showCounts ? ` · ${o.recordCount.toLocaleString("th-TH")} รายการ` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
