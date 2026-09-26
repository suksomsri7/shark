import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { quotaBoard } from "@/lib/modules/crm/quotas";
import { isPeriodKey, periodKeyOf, periodLabel, prevPeriodKey } from "@/lib/modules/crm/quotas-shared";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { QuotaManager } from "@/components/crm/quotas/QuotaManager";
import { setQuotaAction } from "./actions";

// โควตา (ใบ C3.2 · ภาพ 10 ขวา "โควตารายเดือน" · พิมพ์เขียว §11.6) — `/app/sys/{id}/crm/settings/quotas?period=2026-09`
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ (type "CRM") · ยังไม่เปิด CRM v2 (requireCrmV2Page) ·
//    ไม่มีคีย์ `crm.quota.manage` (crmCan) = notFound() — ไม่บอกว่ามีหน้านี้
// 🔴 หน้า GET ไม่เขียนอะไร · งวดเป็นปี ค.ศ. ใน URL (`2026-09` · `2026-Q3` · `2026`) แสดงเป็นปี พ.ศ. · งวดที่ใช้ไม่ได้ = เดือนนี้
// 🔴 ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ แถวของตารางถูกแปลงเป็น props ที่นี่ · action ส่งทาง props
export default async function CrmQuotasPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.quota.manage")) notFound();
  const now = new Date();
  const raw = typeof sp.period === "string" ? sp.period : Array.isArray(sp.period) ? (sp.period[0] ?? "") : "";
  const periodKey = isPeriodKey(raw) ? raw : periodKeyOf(now, "MONTH");
  const board = await quotaBoard({ tenantId, systemId: id, actorUserId: auth.user.id }, actor, { periodKey, now });

  // ตัวเลือกงวด: 6 เดือนย้อนหลัง → เดือนนี้ → 6 เดือนข้างหน้า + ไตรมาสนี้/หน้า + ปีนี้ (+ งวดที่เปิดอยู่ถ้าอยู่นอกรายการ)
  const months: string[] = [];
  let m = periodKeyOf(now, "MONTH");
  for (let i = 0; i < 6; i += 1) m = prevPeriodKey(m) ?? m;
  for (let i = 0; i < 13; i += 1) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number) as [number, number];
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  }
  const q = periodKeyOf(now, "QUARTER");
  const [qy, qn] = [Number(q.slice(0, 4)), Number(q.slice(6))];
  const nextQ = qn === 4 ? `${qy + 1}-Q1` : `${qy}-Q${qn + 1}`;
  const options = [...months, q, nextQ, periodKeyOf(now, "YEAR")];
  if (!options.includes(periodKey)) options.push(periodKey);
  const def = systemDef(sys.type);
  const base = `/app/sys/${id}/crm/settings/quotas`;

  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}`, label: "หน้าแรก CRM" }}
        desc="โควตา — ตั้งเป้ายอดขายของพนักงานและทีมต่องวด ความคืบหน้าคิดจากเงินที่รับจริงหรือดีลที่ชนะ (ตามการตั้งค่าคอมมิชชันของร้าน)"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="flex min-w-0 flex-wrap items-baseline gap-2 text-base font-semibold">
          โควตา<span className="text-sm font-normal text-[color:var(--color-muted)]">{board.periodLabel}</span>
        </h2>
        <p className="text-xs text-[color:var(--color-muted)]">
          “ทำได้” นับจาก{board.basis === "PAID" ? "เงินที่รับจริงในงวด (ใบเสร็จ/บิลที่ชำระแล้ว)" : "มูลค่าดีลที่ชนะในงวด"} · ทีมที่ไม่ได้ตั้งเป้าเอง = รวมเป้าของสมาชิก
        </p>
      </div>
      <form action={base} method="get" className="flex min-w-0 flex-wrap items-center gap-2" data-testid="crm-quota-period-form">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
          <span className="shrink-0 text-[color:var(--color-muted)]">งวด</span>
          <select name="period" defaultValue={periodKey} className="input" data-testid="crm-quota-period">
            {options.map((o) => (
              <option key={o} value={o}>
                {periodLabel(o)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-sm" data-testid="crm-quota-period-apply">
          เปิดงวดนี้
        </button>
      </form>
      {board.truncated && (
        <p className="text-xs text-[color:var(--color-muted)]" role="status">
          แสดง 500 คนแรก — ร้านนี้มีพนักงานมากกว่านั้น ตั้งเป้าของทีมเพื่อครอบคนที่เหลือได้
        </p>
      )}
      <QuotaManager
        systemId={id}
        periodKey={board.periodKey}
        locked={board.ended && !board.canEditEnded}
        rows={board.rows.map((r) => ({ ownerType: r.ownerType, ownerId: r.ownerId, name: r.name, targetSatang: r.targetSatang, targetDeals: r.targetDeals, derived: r.derived, achievedSatang: r.achievedSatang, pct: r.pct }))}
        save={setQuotaAction}
      />
    </div>
  );
}
