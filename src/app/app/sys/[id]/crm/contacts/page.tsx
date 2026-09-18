import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { customFieldLayout, listContacts, ownerOptions, savedViewOptions } from "@/lib/modules/crm/contacts";
import {
  CONTACT_SOURCES,
  CONTACT_SOURCE_LABEL,
  ContactsError,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LIFECYCLE_LABEL,
  LIFECYCLE_STAGES,
  SCORE_BANDS,
  SCORE_BAND_LABEL,
  contactLabel,
  type ContactListInput,
} from "@/lib/modules/crm/contacts-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
// CRM uiVersion gate ▸ uiVersion ≠ 2 = หน้า v1 เดิมทุกตัวอักษร (มติ C23 · R-E.14) ◂
import { crmUiVersion, pickCrmPage } from "@/lib/modules/crm/ui-version";
import { ContactsV1Page } from "./_components/ContactsV1Page";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { ContactExportButton, ContactImportButton, ContactTable, type ContactRowView } from "./_components/ContactListTools";

// รายชื่อผู้ติดต่อ (CRM v2 · ใบ C1.4 · พิมพ์เขียว §3.5/§3.17) — `/app/sys/{id}/crm/contacts`
// URL state: ?q · stage · lead · owner · source · band · view (มุมมองบันทึก) · archived=1 · sort · cursor (ลิงก์แชร์ได้ · ย้อนกลับได้)
// 🔴 404-not-403: ระบบที่ไม่ใช่ CRM ของร้านนี้ = notFound() · ทุกการอ่านผ่านบริการ v2 (listContacts → contactWhere)
// 🔴 หน้า GET ไม่เขียนอะไร

const PAGE_SIZE = 50;

export default async function ContactsPage({
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
  if (pickCrmPage(await crmUiVersion({ tenantId, systemId: id })) === "v1") return <ContactsV1Page params={params} />;
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const pick = <T extends string>(k: string, list: readonly T[]): T | "" => ((list as readonly string[]).includes(one(k)) ? (one(k) as T) : "");

  const q = one("q").slice(0, 100);
  const stage = pick("stage", LIFECYCLE_STAGES);
  const lead = pick("lead", LEAD_STATUSES);
  const source = pick("source", CONTACT_SOURCES);
  const band = pick("band", SCORE_BANDS);
  const owner = one("owner");
  const view = one("view");
  const archived = one("archived") === "1";
  const sort = one("sort") || "-createdAt";
  const cursor = one("cursor");

  const filters: ContactListInput = {
    q: q || null,
    stage: stage || null,
    leadStatus: lead || null,
    source: source || null,
    scoreBand: band || null,
    owner: owner || null,
    savedViewId: view || null,
    includeArchived: archived,
    sort,
  };
  const [owners, views, customFields] = await Promise.all([ownerOptions(ctx, actor), savedViewOptions(ctx, actor), customFieldLayout(ctx, actor).catch(() => [])]);
  const failed = { message: null as string | null };
  const list = await listContacts(ctx, actor, { ...filters, cursor: cursor || null, pageSize: PAGE_SIZE }).catch((e: unknown) => {
    // ตัวกรอง/มุมมอง/ลิงก์หน้าถัดไปที่ใช้ไม่ได้แล้ว = บอกในหน้า (ไม่ใช่หน้า error)
    if (e instanceof ContactsError && (e.code === "VALIDATION" || e.code === "NOT_FOUND")) {
      failed.message = e.message;
      return { items: [], nextCursor: null };
    }
    throw e;
  });
  const listError = failed.message;
  const def = systemDef(sys.type);
  const base = `/app/sys/${id}/crm/contacts`;
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (stage) u.set("stage", stage);
    if (lead) u.set("lead", lead);
    if (source) u.set("source", source);
    if (band) u.set("band", band);
    if (owner) u.set("owner", owner);
    if (view) u.set("view", view);
    if (archived) u.set("archived", "1");
    if (sort !== "-createdAt") u.set("sort", sort);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };
  const anyFilter = !!(q || stage || lead || source || band || owner || view || archived);
  const rows: ContactRowView[] = list.items.map((c) => ({
    id: c.id,
    name: contactLabel(c),
    phone: c.phone,
    email: c.email,
    companyName: c.companyName,
    jobTitle: c.jobTitle,
    lifecycleStage: c.lifecycleStage,
    leadStatus: c.leadStatus,
    scoreBand: c.scoreBand,
    ownerName: c.ownerName,
    isMember: !!c.memberCustomerId,
    archived: !!c.archivedAt,
    optOut: c.marketingOptOut,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="contacts-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        desc="ผู้ติดต่อ — lead และลูกค้าทุกคนของทีมขาย พร้อมสถานะ ผู้ดูแล และที่มา"
        actions={
          <>
            <ContactImportButton systemId={id} customFields={customFields.map((f) => ({ id: f.key, name: f.label }))} />
            <ContactExportButton systemId={id} filters={filters} />
            <Link href={`${base}/new`} className="btn btn-primary text-sm" data-testid="contacts-new-btn">
              + เพิ่มผู้ติดต่อ
            </Link>
          </>
        }
      />
      <ModuleTabs items={crmNavItems(id)} />

      <form method="get" action={base} className="card flex flex-wrap items-end gap-2 p-3" data-testid="contacts-filter-form">
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ค้นหา</span>
          <input name="q" defaultValue={q} placeholder="ชื่อ · เบอร์ · อีเมล" className="input text-sm" data-testid="contacts-filter-q" />
        </label>
        <label className="flex w-[150px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ขั้น</span>
          <select name="stage" defaultValue={stage} className="input text-sm" data-testid="contacts-filter-stage">
            <option value="">ทุกขั้น</option>
            {LIFECYCLE_STAGES.map((s) => (
              <option key={s} value={s}>
                {LIFECYCLE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[130px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>สถานะ lead</span>
          <select name="lead" defaultValue={lead} className="input text-sm" data-testid="contacts-filter-lead">
            <option value="">ทุกสถานะ</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[110px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>คะแนน</span>
          <select name="band" defaultValue={band} className="input text-sm" data-testid="contacts-filter-band">
            <option value="">ทั้งหมด</option>
            {SCORE_BANDS.map((s) => (
              <option key={s} value={s}>
                {SCORE_BAND_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[150px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ที่มา</span>
          <select name="source" defaultValue={source} className="input text-sm" data-testid="contacts-filter-source">
            <option value="">ทุกที่มา</option>
            {CONTACT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {CONTACT_SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[160px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ผู้ดูแล</span>
          <select name="owner" defaultValue={owner} className="input text-sm" data-testid="contacts-filter-owner">
            <option value="">ทุกคน</option>
            <option value="none">ยังไม่มีผู้ดูแล</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {views.length > 0 && (
          <label className="flex w-[160px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>มุมมองที่บันทึกไว้</span>
            <select name="view" defaultValue={view} className="input text-sm" data-testid="contacts-filter-view">
              <option value="">ไม่ใช้</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex w-[150px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>เรียงตาม</span>
          <select name="sort" defaultValue={sort} className="input text-sm" data-testid="contacts-filter-sort">
            <option value="-createdAt">เพิ่มล่าสุด</option>
            <option value="name">ชื่อ ก–ฮ</option>
            <option value="-lastActivityAt">กิจกรรมล่าสุด</option>
            <option value="-score">คะแนนสูงสุด</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 py-2 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={archived} data-testid="contacts-filter-archived" />
          รวมที่เก็บถาวร
        </label>
        <button type="submit" className="btn btn-ghost text-sm" data-testid="contacts-filter-submit">
          กรอง
        </button>
        {anyFilter && (
          <Link href={base} className="py-2 text-sm text-[color:var(--color-muted)] underline" data-testid="contacts-filter-clear">
            ล้างตัวกรอง
          </Link>
        )}
      </form>

      {listError && (
        <div className="card p-3 text-sm" style={{ borderColor: "var(--color-danger)" }} data-testid="contacts-list-error" role="alert">
          {listError}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card py-10 text-center" data-testid="contacts-empty">
          <p className="text-sm text-[color:var(--color-muted)]">
            {anyFilter ? "ไม่พบผู้ติดต่อที่ตรงกับตัวกรองนี้ — ลองล้างตัวกรองหรือค้นด้วยคำอื่น" : "ยังไม่มีผู้ติดต่อในระบบนี้ — เริ่มจากเพิ่มผู้ติดต่อคนแรก หรือนำเข้าจากไฟล์ CSV"}
          </p>
          <Link href={`${base}/new`} className="btn btn-ghost mt-3 text-sm" data-testid="contacts-empty-new">
            + เพิ่มผู้ติดต่อ
          </Link>
        </div>
      ) : (
        <>
          <ContactTable systemId={id} rows={rows} owners={owners} />
          <nav className="flex items-center justify-center gap-3 text-sm" aria-label="เปลี่ยนหน้า">
            {cursor ? (
              <Link href={qs({})} className="btn btn-ghost text-sm" data-testid="contacts-page-first">
                ‹ หน้าแรก
              </Link>
            ) : null}
            {list.nextCursor ? (
              <Link href={qs({ cursor: list.nextCursor })} className="btn btn-ghost text-sm" data-testid="contacts-page-next">
                ถัดไป ›
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
