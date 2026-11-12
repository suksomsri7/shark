import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { hrTabs, hrViewerOf } from "@/lib/modules/hr/ui";
import { inboxUnits, listInbox, teamLeaveQuota } from "@/lib/modules/hr/inbox";
import { INBOX_TYPES } from "@/lib/modules/hr/inbox-shared";
import { HrRequestsView } from "@/lib/modules/hr/overview-ui";

// HR H2.11 ▸ หน้า "คำขอรออนุมัติ" (ภาพ 05) — ลา · OT · สลับกะ · แก้เวลา · เพิ่ม/หักเงิน ในกล่องเดียว · ผู้ไม่เห็นคำขอชนิดใดเลย = 404 ·
//   ลิงก์ตรง ?type=<ชนิด>&focus=<id> (ชนิดจากรายการที่อนุญาต · id ที่ไม่อยู่ในรายการ = ไม่สนใจ · ไม่สะท้อนค่าที่ส่งมา) · ?unit= ?age= ?cursor= ·
//   action ของหน้านี้ตัดสินได้ถึง 50 รายการต่อครั้ง ⇒ เวลาสูงสุดของหน้า 60 วิ (R11) ◂
export const maxDuration = 60;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export default async function HrRequestsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string; unit?: string; age?: string; cursor?: string; focus?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);
  const t = await getTranslations("hr.inbox");
  const v = hrViewerOf(auth);
  const ctx = { tenantId: auth.active.tenantId, systemId: id };
  const one = (x: unknown) => (typeof x === "string" ? x : undefined);
  const type = INBOX_TYPES.find((k) => k === one(sp.type)) ?? null;
  const units = await inboxUnits(ctx, v);
  const unitId = units.some((u) => u.id === one(sp.unit)) ? one(sp.unit)! : null;
  const age = Number(one(sp.age));
  const minAgeDays = age === 3 || age === 7 ? age : 0;
  const cursor = one(sp.cursor) && one(sp.cursor)!.length <= 200 ? one(sp.cursor)! : null;
  const list = await listInbox(ctx, v, { type, unitId, minAgeDays, cursor });
  if (!list) notFound();
  const focusRaw = one(sp.focus);
  const focus = focusRaw && ID_RE.test(focusRaw) && list.items.some((i) => i.id === focusRaw) ? focusRaw : null;
  const quota = await teamLeaveQuota(ctx, v, { unitId });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={hrTabs(id)} />
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <HrRequestsView systemId={id} list={list} quota={quota} units={units} filter={{ type, unitId, minAgeDays, cursor }} focus={focus} />
    </div>
  );
}
