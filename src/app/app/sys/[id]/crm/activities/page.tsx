import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { evaluate } from "@/lib/core/rbac";
import type { Role } from "@prisma/client";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { boardOptions, listActivities, mentionOptions, outcomeOptions } from "@/lib/modules/crm/activities";
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_LABEL, ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL, ActivitiesError, type ActivityStatus, type ActivityType } from "@/lib/modules/crm/activities-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { NewActivityButton } from "./_components/NewActivityButton";
import { ActivityRow } from "./_components/ActivityItems";
// CRM uiVersion gate ▸ uiVersion ≠ 2 = หน้า v1 เดิมทุกตัวอักษร (มติ C23 · R-E.14) ◂
import { crmUiVersion, pickCrmPage } from "@/lib/modules/crm/ui-version";
import { ActivitiesV1Page } from "./_components/ActivitiesV1Page";

// หน้า "กิจกรรม" v2 (CRM v2 · ใบ C1.6 · พิมพ์เขียว §5.5 · ภาพ 08) — `/app/sys/{id}/crm/activities`
// URL state: ?status=pending|today|week|overdue|done · ?scope=mine|team · ?type=<CrmActivityType> · ?cursor= ·
//            ?contactId= | ?companyId= | ?dealId= (ลิงก์ "ดูทั้งหมด" จากบล็อกใน 360)
// 🔴 uiVersion gate (ui-version.ts `pickCrmPage`): ระบบที่ยังไม่เปิด v2 ได้หน้า v1 เดิมเป๊ะ (`ActivitiesV1Page`)
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ = notFound() · ทุกข้อมูลมาจากบริการ (activityWhere) · หน้า GET ไม่เขียนอะไร
// 🔴 หน้า v1 เดิม (`CrmActivitiesSection` ใน crm/ui.tsx) ยังอยู่ให้ของเก่าที่อ้างถึง — หน้านี้เป็นกิจกรรม v2 ทั้งหน้า

const PAGE_SIZE = 50;

export default async function CrmActivitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  if (pickCrmPage(await crmUiVersion({ tenantId, systemId: id })) === "v1") return <ActivitiesV1Page params={params} />;
  const def = systemDef(sys.type);
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const status: ActivityStatus = (ACTIVITY_STATUSES as readonly string[]).includes(one("status")) ? (one("status") as ActivityStatus) : "pending";
  const target = { contactId: one("contactId") || null, companyId: one("companyId") || null, dealId: one("dealId") || null };
  const hasTarget = !!(target.contactId || target.companyId || target.dealId);
  // กรองเฉพาะระเบียนเดียว (มาจาก "ดูทั้งหมด") = ค่าตั้งต้นเป็นของทั้งทีม
  const scope = one("scope") === "team" || (hasTarget && one("scope") !== "mine") ? "team" : "mine";
  const type = (ACTIVITY_TYPES as readonly string[]).includes(one("type")) ? (one("type") as ActivityType) : null;
  const cursor = one("cursor");

  const failed = { message: null as string | null };
  const [list, outcomes, mentions, boards] = await Promise.all([
    listActivities(ctx, actor, { status, scope, type, ...target, cursor: cursor || null, pageSize: PAGE_SIZE }).catch((e: unknown) => {
      if (e instanceof ActivitiesError && (e.code === "VALIDATION" || e.code === "NOT_FOUND")) {
        failed.message = e.message;
        return { items: [], nextCursor: null };
      }
      throw e;
    }),
    outcomeOptions(ctx, actor),
    mentionOptions(ctx, actor),
    boardOptions(ctx, actor),
  ]);
  const m = { role: auth.active.role as Role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> };
  const canLog = evaluate(m, { module: "crm", action: "crm.activity.create" });
  const canComplete = evaluate(m, { module: "crm", action: "crm.activity.complete" });
  const canManage = actor.role === "OWNER" || actor.role === "MANAGER";
  const base = `/app/sys/${id}/crm/activities`;
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const cur: Record<string, string | null> = { status, scope, type, ...target, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) q.set(k, v);
    return `${base}?${q.toString()}`;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-activities-page">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="กิจกรรม — โทร · นัดพบ · งาน · โน้ต" />
      <ModuleTabs items={crmNavItems(id)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          กิจกรรม
          {hasTarget && (
            <Link href={`${base}?status=${status}`} className="text-xs font-normal underline" data-testid="activities-clear-target">
              เฉพาะรายการเดียว · ดูทั้งหมด
            </Link>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/app/sys/${id}/crm/calendar`} className="btn btn-ghost text-sm" data-testid="activities-calendar-link">
            ปฏิทิน
          </Link>
          {canLog && <NewActivityButton systemId={id} outcomes={outcomes} mentionOptions={mentions} />}
        </div>
      </div>

      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px" aria-label="สถานะกิจกรรม" data-testid="activities-status-tabs">
        {ACTIVITY_STATUSES.map((s) => (
          <Link
            key={s}
            href={href({ status: s, cursor: null })}
            className="whitespace-nowrap px-3 py-2 text-sm"
            style={status === s ? { borderBottom: "2px solid var(--color-accent)", fontWeight: 700 } : { color: "var(--color-muted)" }}
            aria-current={status === s ? "page" : undefined}
            data-testid={`activities-status-${s}`}
          >
            {ACTIVITY_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="ของใคร">
          <Link href={href({ scope: "mine", cursor: null })} className="px-3 py-1.5" style={scope === "mine" ? { fontWeight: 700, color: "var(--color-accent)" } : undefined} data-testid="activities-scope-mine">
            ของฉัน
          </Link>
          <Link href={href({ scope: "team", cursor: null })} className="border-l px-3 py-1.5" style={scope === "team" ? { fontWeight: 700, color: "var(--color-accent)" } : undefined} data-testid="activities-scope-team">
            ทีม
          </Link>
        </div>
        <form action={base} method="get" className="flex items-center gap-2" data-testid="activities-type-form">
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="scope" value={scope} />
          {target.contactId && <input type="hidden" name="contactId" value={target.contactId} />}
          {target.companyId && <input type="hidden" name="companyId" value={target.companyId} />}
          {target.dealId && <input type="hidden" name="dealId" value={target.dealId} />}
          <select name="type" defaultValue={type ?? ""} className="input text-sm" aria-label="ชนิดกิจกรรม" data-testid="activities-type">
            <option value="">ทุกชนิด</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-ghost text-sm" data-testid="activities-type-apply">
            กรอง
          </button>
        </form>
      </div>

      {failed.message && (
        <p className="rounded-lg border px-3 py-2 text-sm" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }} role="alert">
          {failed.message}
        </p>
      )}

      <section className="card flex min-w-0 flex-col p-4" data-testid="activities-list">
        {list.items.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">
            {status === "done" ? "ยังไม่มีกิจกรรมที่เสร็จแล้วในมุมมองนี้" : "ไม่มีงานค้างในมุมมองนี้ — เยี่ยมมาก"}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {list.items.map((i) => (
              <ActivityRow key={i.id} systemId={id} item={i} currentUserId={auth.user.id} canManage={canManage} boards={canLog ? boards : []} canComplete={canComplete} showTarget />
            ))}
          </ul>
        )}
        {list.nextCursor && (
          <Link href={href({ cursor: list.nextCursor })} className="btn btn-ghost mt-2 self-center text-sm" data-testid="activities-next-page">
            ถัดไป
          </Link>
        )}
      </section>
    </div>
  );
}
