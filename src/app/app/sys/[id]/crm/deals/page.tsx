import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
// CRM C1.7 ▸ ด่านคีย์ของ CRM (MANAGER ปริยายไม่มี crm.settings.manage — §6.1) ◂
import { crmCan } from "@/lib/modules/crm/access";
import type { Role } from "@prisma/client";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { dealFieldLayout, forecast, getBoard, listDeals, lostReasonOptions, ownerOptions, pipelineOptions, savedViewOptions } from "@/lib/modules/crm/deals";
import {
  DEAL_SORTS,
  DEAL_SORT_LABEL,
  DEAL_VIEWS,
  DealsError,
  FORECAST_CATEGORIES,
  FORECAST_CATEGORY_LABEL,
  FORECAST_GROUPS,
  formatBaht,
  thaiToday,
  type BoardDto,
  type DealListInput,
  type DealListResult,
  type DealView,
  type ForecastResult,
} from "@/lib/modules/crm/deals-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
// CRM uiVersion gate ▸ uiVersion ≠ 2 = หน้า v1 เดิมทุกตัวอักษร (มติ C23 · R-E.14) ◂
import { crmUiVersion, pickCrmPage } from "@/lib/modules/crm/ui-version";
import { DealsV1Page } from "./_components/DealsV1Page";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { DealBoard } from "./_components/DealBoard";
import { DealTable } from "./_components/DealTable";

// ดีล (CRM v2 · ใบ C1.5 · พิมพ์เขียว §3.2 · ภาพ 02) — `/app/sys/{id}/crm/deals`
// forecast ใช้เฉพาะ pipeline + ช่วงวันปิด + หมวด ⇒ ซ่อนตัวกรองที่มุมมองนี้ไม่ใช้ (ไม่หลอกผู้ใช้ว่ากรองแล้ว)
// URL state (§2.3): ?pipeline · view=board|table|forecast · owner · team · stage · closeFrom · closeTo · stale=1 · tag · f.<key> · q · saved · sort · cursor
//   + forecast: group=month|owner|team · category
// C1.3 บริษัท 360 "เปิดดีลใหม่" → `?companyId=<id>` ⇒ ส่งต่อไปฟอร์ม `/deals/new?companyId=` (resolve บริษัทฝั่งเซิร์ฟเวอร์อีกครั้ง)
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ = notFound() · ทุกข้อมูลผ่านบริการ (dealWhere) · หน้า GET ไม่เขียนอะไร

const GROUP_LABEL: Record<string, string> = { month: "รายเดือน", owner: "รายคน", team: "รายทีม" };

export default async function DealsPage({
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
  if (pickCrmPage(await crmUiVersion({ tenantId, systemId: id })) === "v1") return <DealsV1Page params={params} />;
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const base = `/app/sys/${id}/crm/deals`;

  const companyId = one("companyId");
  if (companyId) redirect(`/app/sys/${id}/crm/deals/new?companyId=${encodeURIComponent(companyId)}`);

  const m = { role: auth.active.role as Role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> };
  const canMove = crmCan(m, "crm.deal.move");
  const canReopen = actor.role === "OWNER" || actor.role === "MANAGER";
  const canSettings = crmCan(m, "crm.settings.manage");
  const view: DealView = (DEAL_VIEWS as readonly string[]).includes(one("view")) ? (one("view") as DealView) : "board";

  const [pipelines, owners, savedViews, lostReasons, layout] = await Promise.all([
    pipelineOptions(ctx, actor),
    ownerOptions(ctx, actor),
    savedViewOptions(ctx, actor),
    lostReasonOptions(ctx, actor),
    dealFieldLayout(ctx, actor),
  ]);
  const def = systemDef(sys.type);
  const header = (
    <>
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        desc="ดีล — กระดานตามขั้น ตาราง และพยากรณ์ยอดขาย"
        actions={
          <>
            <Link href={`/app/sys/${id}/crm/pipelines`} className="btn btn-ghost text-sm" data-testid="deals-pipelines-link">
              pipeline ทั้งหมด
            </Link>
            <Link href={`${base}/new${one("pipeline") ? `?pipeline=${encodeURIComponent(one("pipeline"))}` : ""}`} className="btn btn-primary text-sm" data-testid="deals-new-btn">
              + เพิ่มดีล
            </Link>
          </>
        }
      />
      <ModuleTabs items={crmNavItems(id)} />
    </>
  );

  if (pipelines.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-4" data-testid="deals-page">
        {header}
        <div className="card flex flex-col items-start gap-2 p-4 text-sm" data-testid="deals-empty">
          {canSettings ? (
            <>
              <p>ระบบ CRM นี้ยังไม่มี pipeline — สร้าง pipeline แรกก่อน แล้วค่อยเพิ่มดีล</p>
              <Link href={`/app/sys/${id}/crm/settings/pipelines`} className="btn btn-primary text-sm" data-testid="deals-empty-create-pipeline">
                ไปตั้งค่า pipeline
              </Link>
            </>
          ) : (
            <p>ระบบ CRM นี้ยังไม่มี pipeline — ขอให้ผู้ดูแลระบบ CRM สร้าง pipeline ก่อน แล้วค่อยเพิ่มดีล</p>
          )}
        </div>
      </div>
    );
  }

  const pipe = pipelines.find((p) => p.id === one("pipeline")) ?? pipelines[0]!;
  const customFilters = layout.filter((f) => f.filterable && !f.isSystem);
  const f: Record<string, string> = {};
  for (const cf of customFilters) {
    const v = one(`f.${cf.key}`).slice(0, 100);
    if (v) f[cf.key] = v;
  }
  const filters: DealListInput = {
    pipelineId: pipe.id,
    owner: one("owner") || null,
    team: one("team") || null,
    stage: view === "board" ? null : one("stage") || null,
    closeFrom: one("closeFrom") || null,
    closeTo: one("closeTo") || null,
    stale: one("stale") === "1" ? true : null,
    tag: one("tag").slice(0, 64) || null,
    q: one("q").slice(0, 100) || null,
    savedViewId: one("saved") || null,
    f: Object.keys(f).length ? f : null,
    sort: (DEAL_SORTS as readonly string[]).includes(one("sort")) ? one("sort") : null,
  };
  const fieldLabels = Object.fromEntries(layout.map((x) => [x.key, x.label]));

  let board: BoardDto | null = null;
  let table: DealListResult | null = null;
  let fc: ForecastResult | null = null;
  let loadError: string | null = null;
  const group = (FORECAST_GROUPS as readonly string[]).includes(one("group")) ? one("group") : "month";
  const category = (FORECAST_CATEGORIES as readonly string[]).includes(one("category")) ? one("category") : "";
  try {
    if (view === "board") board = await getBoard(ctx, actor, filters);
    else if (view === "table") table = await listDeals(ctx, actor, { ...filters, cursor: one("cursor") || null, pageSize: 50 });
    else fc = await forecast(ctx, actor, { pipelineId: pipe.id, groupBy: group, category: category || null, from: filters.closeFrom, to: filters.closeTo });
  } catch (e) {
    if (!(e instanceof DealsError)) throw e;
    loadError = e.message;
  }

  const qs = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "cursor" && k !== "notice") u.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") u.delete(k);
      else u.set(k, v);
    }
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };
  const totalCount = board ? board.columns.reduce((n, c) => n + c.count, 0) : null;
  const anyFilter = !!(filters.owner || filters.team || filters.closeFrom || filters.closeTo || filters.stale || filters.tag || filters.q || filters.savedViewId || filters.f || (view !== "board" && filters.stage));

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="deals-page">
      {header}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 truncate text-lg font-semibold">ดีล — {pipe.name}</h1>
          {totalCount !== null && <span className="rounded-md border px-1.5 text-xs text-[color:var(--color-muted)]">{totalCount.toLocaleString("th-TH")} ดีล</span>}
        </div>
        <nav className="flex rounded-lg border p-0.5 text-sm" aria-label="มุมมองของดีล" data-testid="deals-views">
          {(["board", "table", "forecast"] as const).map((v) => (
            <Link
              key={v}
              href={qs({ view: v === "board" ? null : v })}
              className="rounded-md px-3 py-1"
              style={view === v ? { background: "var(--color-ink, #111)", color: "#fff" } : undefined}
              aria-current={view === v ? "page" : undefined}
              data-testid={`deals-view-${v}`}
            >
              {v === "board" ? "บอร์ด" : v === "table" ? "ตาราง" : "forecast"}
            </Link>
          ))}
        </nav>
      </div>

      <form method="get" action={base} className="card flex flex-wrap items-end gap-2 p-3" data-testid="deals-filter-form">
        {view !== "board" && <input type="hidden" name="view" value={view} />}
        <label className="flex w-[180px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>pipeline</span>
          <select name="pipeline" defaultValue={pipe.id} className="input text-sm" data-testid="deals-filter-pipeline">
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {view !== "forecast" && (
          <>
        <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ค้นหา</span>
          <input name="q" defaultValue={filters.q ?? ""} placeholder="ชื่อดีล" className="input text-sm" data-testid="deals-filter-q" />
        </label>
        <label className="flex w-[150px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ผู้ดูแล</span>
          <select name="owner" defaultValue={filters.owner ?? ""} className="input text-sm" data-testid="deals-filter-owner">
            <option value="">ทุกคน</option>
            <option value="none">ยังไม่มีผู้ดูแล</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
          </>
        )}
        {view === "table" && (
          <label className="flex w-[150px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ขั้น</span>
            <select name="stage" defaultValue={filters.stage ?? ""} className="input text-sm" data-testid="deals-filter-stage">
              <option value="">ทุกขั้น</option>
              {pipe.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex w-[140px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ปิดคาดตั้งแต่</span>
          <input type="date" name="closeFrom" defaultValue={filters.closeFrom ?? ""} className="input text-sm" data-testid="deals-filter-close-from" />
        </label>
        <label className="flex w-[140px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ถึง</span>
          <input type="date" name="closeTo" defaultValue={filters.closeTo ?? ""} className="input text-sm" data-testid="deals-filter-close-to" />
        </label>
        {view !== "forecast" && (
          <>
        <label className="flex w-[110px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>แท็ก</span>
          <input name="tag" defaultValue={filters.tag ?? ""} className="input text-sm" data-testid="deals-filter-tag" />
        </label>
        {customFilters.map((cf) => (
          <label key={cf.key} className="flex w-[140px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>{cf.label}</span>
            <input name={`f.${cf.key}`} defaultValue={f[cf.key] ?? ""} className="input text-sm" data-testid={`deals-filter-f-${cf.key}`} />
          </label>
        ))}
        {savedViews.length > 0 && (
          <label className="flex w-[170px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>มุมมองที่บันทึกไว้</span>
            <select name="saved" defaultValue={filters.savedViewId ?? ""} className="input text-sm" data-testid="deals-filter-saved">
              <option value="">ไม่ใช้</option>
              {savedViews.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
          </>
        )}
        {view === "table" && (
          <label className="flex w-[140px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>เรียงตาม</span>
            <select name="sort" defaultValue={filters.sort ?? "-createdAt"} className="input text-sm" data-testid="deals-filter-sort">
              {DEAL_SORTS.map((s) => (
                <option key={s} value={s}>
                  {DEAL_SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        {view !== "forecast" && (
        <label className="flex items-center gap-1.5 py-2 text-sm">
          <input type="checkbox" name="stale" value="1" defaultChecked={!!filters.stale} data-testid="deals-filter-stale" />
          เฉพาะดีลนิ่ง
        </label>
        )}
        <button type="submit" className="btn btn-ghost text-sm" data-testid="deals-filter-submit">
          กรอง
        </button>
        {anyFilter && (
          <Link href={qs({ q: null, owner: null, team: null, stage: null, closeFrom: null, closeTo: null, stale: null, tag: null, saved: null, sort: null, ...Object.fromEntries(customFilters.map((cf) => [`f.${cf.key}`, null])) })} className="py-2 text-sm underline" data-testid="deals-filter-clear">
            ล้างตัวกรอง
          </Link>
        )}
      </form>

      {one("notice") && (
        <p className="card p-3 text-sm" role="status" style={{ color: "var(--color-danger)" }} data-testid="deals-notice">
          {one("notice").slice(0, 300)}
        </p>
      )}
      {loadError && (
        <p className="card p-3 text-sm text-[color:var(--color-danger)]" role="alert" data-testid="deals-load-error">
          {loadError}
        </p>
      )}

      {board && (
        <DealBoard
          systemId={id}
          pipelineId={pipe.id}
          columns={board.columns}
          canDrag={canMove}
          canReopen={canReopen}
          lostReasons={lostReasons}
          fieldLabels={fieldLabels}
          nowKey={thaiToday()}
        />
      )}

      {table && (
        <>
          <DealTable systemId={id} rows={table.items} stages={pipe.stages.map((s) => ({ id: s.id, name: s.name }))} owners={owners} filters={filters} />
          <div className="flex justify-end gap-3 text-sm">
            {one("cursor") && (
              <Link href={qs({ cursor: null })} className="underline" data-testid="deals-first-page">
                หน้าแรก
              </Link>
            )}
            {table.nextCursor && (
              <Link href={qs({ cursor: table.nextCursor })} className="underline" data-testid="deals-next-page">
                หน้าถัดไป →
              </Link>
            )}
          </div>
        </>
      )}

      {fc && (
        <section className="card flex flex-col gap-3 p-4" data-testid="deals-forecast">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">พยากรณ์ยอดขาย (เฉพาะดีลที่เปิดอยู่ · ไม่นับหมวด &quot;ไม่นับ&quot;)</h2>
            <div className="flex flex-wrap gap-1 text-sm">
              {FORECAST_GROUPS.map((g) => (
                <Link key={g} href={qs({ group: g === "month" ? null : g })} className="rounded-md border px-2 py-0.5" style={group === g ? { fontWeight: 700 } : undefined} data-testid={`deals-forecast-group-${g}`}>
                  {GROUP_LABEL[g]}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            <Link href={qs({ category: null })} className="rounded-full border px-2 py-0.5" style={!category ? { fontWeight: 700 } : undefined} data-testid="deals-forecast-category-all">
              ทุกหมวด
            </Link>
            {FORECAST_CATEGORIES.filter((c) => c !== "OMITTED").map((c) => (
              <Link key={c} href={qs({ category: c })} className="rounded-full border px-2 py-0.5" style={category === c ? { fontWeight: 700 } : undefined} data-testid={`deals-forecast-category-${c}`}>
                {FORECAST_CATEGORY_LABEL[c]}
              </Link>
            ))}
          </div>
          {fc.rows.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีดีลที่เปิดอยู่ตามตัวกรองนี้</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
                  <th className="py-2 font-semibold">{GROUP_LABEL[group]}</th>
                  <th className="py-2 text-right font-semibold">ดีล</th>
                  <th className="hidden py-2 text-right font-semibold sm:table-cell">มูลค่ารวม</th>
                  <th className="py-2 text-right font-semibold">ถ่วงน้ำหนัก</th>
                </tr>
              </thead>
              <tbody>
                {fc.rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0">
                    <td className="py-2">{r.label}</td>
                    <td className="py-2 text-right">{r.count.toLocaleString("th-TH")}</td>
                    <td className="hidden py-2 text-right sm:table-cell">{formatBaht(r.valueSatang)}</td>
                    <td className="py-2 text-right font-medium">{formatBaht(r.weightedSatang)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">รวม</td>
                  <td className="py-2 text-right">{fc.rows.reduce((n, r) => n + r.count, 0).toLocaleString("th-TH")}</td>
                  <td className="hidden py-2 text-right sm:table-cell">{formatBaht(fc.rows.reduce((n, r) => n + r.valueSatang, 0))}</td>
                  <td className="py-2 text-right">{formatBaht(fc.rows.reduce((n, r) => n + r.weightedSatang, 0))}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
