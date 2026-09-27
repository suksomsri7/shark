import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { mine, mineTotals } from "@/lib/modules/crm/commissions";
import {
  COMMISSION_BASIS_LABELS,
  COMMISSION_PAYROLL_LABELS,
  COMMISSION_REWON_LABEL,
  COMMISSION_STATUSES,
  COMMISSION_STATUS_LABELS,
  COMMISSION_WAITING_LABEL,
  PERIOD_KEY_RE,
  commissionPeriodOf,
  nextPeriodKey,
} from "@/lib/modules/crm/commissions-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { CrmMyCommissions } from "@/components/crm/commissions/CrmMyCommissions";
import type { CrmMyCommissionsData } from "@/components/crm/commissions/types";

// คอมมิชชันของฉัน (ใบ C3.3 · พิมพ์เขียว §5.9) — `/app/sys/{id}/crm/commissions`
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ (type: "CRM") · ยังไม่เปิด CRM v2 = notFound()
// 🔴 พนักงาน CRM v2 ทุกคนเห็นหน้านี้ (ไม่ต้องมีคีย์) — แต่เห็นเฉพาะแถวของตัวเอง: โหลดผ่าน `mine(ctx, actor)` ด้วย actor ของ session
// 🔴 หน้า GET ไม่เขียนอะไร · ยอดรวมจาก `mineTotals` (SQL bigint ของแถวตัวเองทั้งหมด — มติผู้คุมงาน S7)
export default async function CrmMyCommissionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string; status?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (actor.role === "CUSTOMER") notFound();
  const period = typeof sp?.period === "string" && PERIOD_KEY_RE.test(sp.period) ? sp.period : "";
  const status = typeof sp?.status === "string" && (COMMISSION_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const filter = { periodKey: period || null, status: status || null };
  const [rows, totals] = await Promise.all([mine(ctx, actor, filter), mineTotals(ctx, actor, filter)]);
  // ตัวเลือกงวด: 12 เดือนย้อนหลังถึงเดือนหน้า (เดือนไทย) + งวดที่อยู่ในรายการ
  const periods = new Set<string>(rows.map((r) => r.periodKey));
  let k = commissionPeriodOf(new Date(Date.now() - 365 * 86_400_000));
  for (let i = 0; i < 14; i += 1) {
    periods.add(k);
    k = nextPeriodKey(k);
  }
  const data: CrmMyCommissionsData = {
    systemId: id,
    period,
    status,
    periods: [...periods].sort().reverse().map((p) => ({ value: p, label: p })),
    statuses: COMMISSION_STATUSES.map((s) => ({ value: s, label: COMMISSION_STATUS_LABELS[s] })),
    rows: rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      dealTitle: r.dealTitle ?? "(ดีลถูกลบ)",
      userName: r.userName ?? "",
      amountSatang: r.amountSatang,
      status: r.status,
      statusLabel: COMMISSION_STATUS_LABELS[r.status],
      basisLabel: COMMISSION_BASIS_LABELS[r.basis],
      periodKey: r.periodKey,
      payroll: r.payroll,
      payrollLabel: r.payroll ? COMMISSION_PAYROLL_LABELS[r.payroll] : null,
      rewon: r.rewon,
      isReversal: !!r.reversedOfId,
    })),
    // มติผู้คุมงาน S7: ยอดรวมคิดใน SQL (bigint) จากแถวของตัวเองทั้งหมด ไม่ใช่รวมใน JS จาก 500 แถวที่แสดง
    totals,
    waitingLabel: COMMISSION_WAITING_LABEL,
    rewonLabel: COMMISSION_REWON_LABEL,
  };
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}`, label: "ภาพรวม CRM" }}
        desc="คอมมิชชันของฉัน — ค่าคอมที่เกิดจากดีลที่คุณดูแล (รออนุมัติ · อนุมัติแล้ว · จ่ายกับเงินเดือนแล้ว)"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <CrmMyCommissions data={data} />
    </div>
  );
}
