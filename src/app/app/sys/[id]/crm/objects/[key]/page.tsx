import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { fields, toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import * as objects from "@/lib/modules/crm/objects";
import { OBJECT_PARENT_LABEL, ObjectsError, type RecordDto } from "@/lib/modules/crm/objects-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { customerLinks, formFieldsOf, objectViewFilters, objectViews, sensitivePresence } from "@/components/crm/objects/server";
import { ImportRecordsButton, ManageViewsButton, SaveViewButton } from "../_components/ListTools";
import { NewRecordToggle } from "../_components/RecordForm";
import { displayValue } from "@/components/crm/objects/types";

// รายการของวัตถุกำหนดเอง (CRM v2 · ใบ C1.9 · พิมพ์เขียว §3.6 §11.2) — `/app/sys/{id}/crm/objects/{key}`
// URL state: ?q (ค้นชื่อรายการ) · ?f.<fieldKey>=<ไวยากรณ์ของ engine: คำ · =ตรงตัว · a..b · a.. · true> · ?view=<มุมมองที่บันทึก> · ?page
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM v2 · ไม่มีคีย์ crm.record.read · วัตถุของระบบอื่น/ร้านอื่น/เก็บถาวร = notFound()
// 🔴 AUDIT-CLASS X1: รายการตามการมองเห็นของแม่ (C1.7) — บริการ `records.list` ใช้เส้น EXISTS ในฐานข้อมูล ไม่ส่งรายการ id ของแม่ทั้งระบบ
// 🔴 ตัวกรองที่ใช้ไม่ได้ (key ที่วัตถุไม่มี · มุมมองของวัตถุ/ระบบอื่น) = ข้อความในหน้าและ "ไม่มีแถว" — ไม่ใช่ "แสดงทั้งหมด" · หน้า GET ไม่เขียน

const PAGE_SIZE = 50;

const FILTER_HINT: Record<string, string> = {
  NUMBER: "เช่น 10..30",
  MONEY: "เช่น 100..500",
  DATE: "เช่น 2026-01-01..",
  DATETIME: "เช่น 2026-01-01..",
  BOOLEAN: "true / false",
  SELECT: "ค่าตัวเลือก",
};

const PARENT_PATH: Record<string, string> = { CONTACT: "contacts", COMPANY: "companies", DEAL: "deals" };

export default async function ObjectRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, key }, sp] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  // AUDIT-CLASS X2: อ่านรายการของวัตถุต้องมีคีย์ crm.record.read (ไม่มี = 404 ไม่บอกว่ามีหน้านี้)
  if (!crmCan(actor, "crm.record.read")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  // Next ถอดรหัส [key] ให้แล้ว — ไม่ decode ซ้ำ (ค่า % ที่ผิดรูปจะทำหน้าพัง)
  const objectKey = String(key ?? "");
  // AUDIT-CLASS X1: วัตถุของระบบ CRM นี้เท่านั้น · เก็บถาวรแล้ว = 404 (มติ C1.2b: archived object = NOT FOUND)
  const obj = await objects.get(ctx, actor, objectKey).catch((e: unknown) => {
    if (e instanceof ObjectsError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!obj || obj.archivedAt) notFound();

  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const explicitF: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (k.startsWith("f.") && k.length > 2 && typeof v === "string" && v.trim()) explicitF[k.slice(2)] = v.trim();
  const viewId = one("view");
  const page = Math.max(1, Math.floor(Number(one("page")) || 1));
  let q = one("q").trim().slice(0, 100);
  let f = explicitF;
  let message: string | null = null;
  if (viewId) {
    const vf = await objectViewFilters(ctx, actor, obj.key, viewId);
    if (!vf) message = "ไม่พบมุมมองที่บันทึกไว้นี้สำหรับรายการนี้ (อาจเป็นของรายการอื่นหรือถูกลบไปแล้ว) — เลือกมุมมองใหม่ หรือล้างตัวกรอง";
    else {
      f = { ...vf.f, ...explicitF };
      q = q || vf.q;
    }
  }
  const empty = { items: [] as RecordDto[], total: 0, page: 1, pageSize: PAGE_SIZE };
  const list = message
    ? empty
    : await objects.records.list(ctx, actor, obj.key, { q: q || null, f, page, pageSize: PAGE_SIZE }).catch((e: unknown) => {
        // ตัวกรองที่วัตถุไม่มี/ค่าผิดรูป = บอกในหน้า และไม่มีแถว (ไม่ใช่หน้า error และไม่ใช่ "ทั้งหมด")
        if (e instanceof ObjectsError && (e.code === "VALIDATION" || e.code === "NOT_FOUND")) {
          message = e.message;
          return empty;
        }
        throw e;
      });

  // CRM C1.9 ▸ รีวิว B1: `hidden` = ผู้ดูคนนี้ไม่มีสิทธิ์เห็นค่าอ่อนไหว (คำตัดสิน D8 เดียวกับ engine) ◂
  const [layout, access] = await Promise.all([fields.listLayout({ ...ctx, objectKey: obj.key, actor }, {}), formFieldsOf(ctx, actor, obj.key)]);
  const accessOf = new Map(access.map((f) => [f.key, f]));
  const all = layout.sections.flatMap((s) => s.fields.filter((x) => !x.isSystem && !x.archivedAt).map((x) => ({ ...x, hidden: accessOf.get(x.key)?.hidden === true })));
  const columns = all.filter((x) => x.showInList && x.key !== obj.titleFieldKey).slice(0, 6);
  // รีวิว note: ช่องกรองของฟิลด์อ่อนไหวไม่แสดงให้ผู้ที่ไม่มีสิทธิ์ (engine ปฏิเสธอยู่แล้ว — ไม่ชวนกด)
  const filterable = all.filter((x) => x.filterable && !x.hidden);
  const [views, present, custHref] = await Promise.all([
    objectViews(ctx, actor, obj.key),
    sensitivePresence(tenantId, list.items.map((r) => r.id), columns.filter((c) => c.hidden).map((c) => c.id)),
    obj.parentType === "CUSTOMER" ? customerLinks(tenantId, actor, list.items.map((r) => r.parentId ?? "").filter(Boolean)) : Promise.resolve(new Map<string, string>()),
  ]);
  const formFields = obj.parentType === "NONE" && crmCan(actor, "crm.record.create") ? access : null;
  const canImport = crmCan(actor, "crm.record.create");
  const base = `/app/sys/${id}/crm/objects/${obj.key}`;
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (one("q")) u.set("q", one("q"));
    for (const [k, v] of Object.entries(explicitF)) u.set(`f.${k}`, v);
    if (viewId) u.set("view", viewId);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const anyFilter = !!(one("q") || Object.keys(explicitF).length || viewId);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="object-records-page">
      <PageHeader
        title={obj.labelPlural || obj.label}
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc={`วัตถุกำหนดเอง · ผูกกับ${OBJECT_PARENT_LABEL[obj.parentType]} · ${list.total.toLocaleString("th-TH")} รายการ`}
        actions={canImport ? <ImportRecordsButton systemId={id} objectKey={obj.key} label={obj.label} columns={["title", ...(obj.parentType === "NONE" ? [] : ["parentId"]), ...all.filter((x) => !x.hidden).map((x) => x.key)]} /> : undefined}
      />
      <ModuleTabs items={crmNavItems(id)} />

      <form method="get" action={base} className="card flex flex-wrap items-end gap-2 p-3" data-testid="object-filter-form">
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ค้นหาชื่อรายการ</span>
          <input name="q" defaultValue={one("q")} className="input text-sm" data-testid="object-filter-q" />
        </label>
        {filterable.map((x) => (
          <label key={x.key} className="flex w-[160px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>{x.label}</span>
            <input name={`f.${x.key}`} defaultValue={explicitF[x.key] ?? ""} placeholder={FILTER_HINT[x.type] ?? "คำที่มี"} className="input text-sm" data-testid={`object-filter-f-${x.key}`} />
          </label>
        ))}
        {viewId && <input type="hidden" name="view" value={viewId} />}
        <button type="submit" className="btn btn-primary text-sm" data-testid="object-filter-apply">
          กรอง
        </button>
        {anyFilter && (
          <Link href={base} className="btn btn-ghost text-sm" data-testid="object-filter-clear">
            ล้างตัวกรอง
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="object-views">
        <span className="text-xs text-[color:var(--color-muted)]">มุมมอง:</span>
        <Link href={base} className="rounded-md border px-2 py-0.5 text-xs" style={!viewId ? { borderColor: "var(--color-accent)", color: "var(--color-accent)" } : undefined} data-testid="object-view-all">
          ทั้งหมด
        </Link>
        {views.map((v) => (
          <Link
            key={v.id}
            href={`${base}?view=${v.id}`}
            className="rounded-md border px-2 py-0.5 text-xs"
            style={v.id === viewId ? { borderColor: "var(--color-accent)", color: "var(--color-accent)" } : undefined}
            data-testid="object-view-link"
          >
            {v.name}
            {v.scope === "TEAM" ? " · ทั้งร้าน" : ""}
          </Link>
        ))}
        {!message && (Object.keys(f).length > 0 || q) && (
          <SaveViewButton systemId={id} objectKey={obj.key} filters={{ f, q }} canShare={actor.role === "OWNER" || actor.role === "MANAGER"} />
        )}
        {/* CRM C1.9 ▸ รีวิว S5: มุมมองที่ผู้ใช้คนนี้แก้ได้ (ของตัวเอง · ทั้งร้านสำหรับเจ้าของร้าน/ผู้จัดการ) ◂ */}
        <ManageViewsButton
          systemId={id}
          objectKey={obj.key}
          views={views.filter((v) => v.ownerUserId === actor.userId || (v.scope === "TEAM" && (actor.role === "OWNER" || actor.role === "MANAGER"))).map((v) => ({ id: v.id, name: v.name }))}
        />
      </div>

      {message && (
        <div className="card p-3 text-sm" role="status" data-testid="object-list-message">
          {message}
        </div>
      )}

      <section className="card min-w-0 overflow-x-auto p-0" data-testid="object-records-table">
        {list.items.length === 0 ? (
          <p className="p-4 text-sm text-[color:var(--color-muted)]">
            {message ? "ไม่มีรายการที่ตรงกับตัวกรองนี้" : anyFilter ? "ไม่พบรายการที่ตรงกับตัวกรอง" : `ยังไม่มีรายการ${obj.label}`}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color:var(--color-surface-2)] text-left text-xs text-[color:var(--color-muted)]">
                <th className="px-4 py-2 font-medium">{obj.label}</th>
                {columns.map((c) => (
                  <th key={c.key} className="hidden px-3 py-2 font-medium sm:table-cell">
                    {c.label}
                  </th>
                ))}
                {obj.parentType !== "NONE" && <th className="px-3 py-2 font-medium">ผูกกับ</th>}
              </tr>
            </thead>
            <tbody>
              {list.items.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2.5">
                    <Link href={`${base}/${r.id}`} className="break-words font-medium hover:underline" data-testid="object-record-link">
                      {r.title}
                    </Link>
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className="hidden px-3 py-2.5 sm:table-cell">
                      {c.hidden && present.has(`${r.id}:${c.id}`) ? <span className="text-[color:var(--color-muted)]">ซ่อน</span> : displayValue(r.values[c.key], c.options.choices ?? [], c.type)}
                    </td>
                  ))}
                  {obj.parentType !== "NONE" && (
                    <td className="px-3 py-2.5 text-xs">
                      {r.parentId && (PARENT_PATH[r.parentType] || custHref.has(r.parentId)) ? (
                        <Link href={PARENT_PATH[r.parentType] ? `/app/sys/${id}/crm/${PARENT_PATH[r.parentType]}/${r.parentId}` : (custHref.get(r.parentId) as string)} className="underline" data-testid="object-record-parent-link">
                          เปิด{OBJECT_PARENT_LABEL[r.parentType]}
                        </Link>
                      ) : (
                        <span className="text-[color:var(--color-muted)]">{OBJECT_PARENT_LABEL[r.parentType]}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-2 text-sm" aria-label="หน้า" data-testid="object-pager">
          {page > 1 ? (
            <Link href={qs({ page: String(page - 1) })} className="btn btn-ghost btn-sm" data-testid="object-page-prev">
              ‹ ก่อนหน้า
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-[color:var(--color-muted)]">
            หน้า {page.toLocaleString("th-TH")} / {pages.toLocaleString("th-TH")}
          </span>
          {page < pages ? (
            <Link href={qs({ page: String(page + 1) })} className="btn btn-ghost btn-sm" data-testid="object-page-next">
              ถัดไป ›
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      {obj.parentType === "NONE" ? (
        formFields && <NewRecordToggle systemId={id} objectKey={obj.key} label={obj.label} fields={formFields} />
      ) : (
        <p className="text-xs text-[color:var(--color-muted)]" data-testid="object-add-hint">
          เพิ่ม{obj.label}ได้จากแท็บ &quot;{obj.labelPlural || obj.label}&quot; ในหน้า 360 ของ{OBJECT_PARENT_LABEL[obj.parentType]} หรือนำเข้า CSV (คอลัมน์ parentId)
        </p>
      )}
    </div>
  );
}
