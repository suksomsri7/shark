import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { listCompanies, ownerOptions } from "@/lib/modules/crm/companies";
import {
  COMPANY_LIFECYCLE_LABEL,
  COMPANY_SIZES,
  COMPANY_SIZE_LABEL,
  COMPANY_SORTS,
  formatSatangBaht,
  formatTaxId,
  relativeThai,
  type CompanySize,
  type CompanySort,
} from "@/lib/modules/crm/companies-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { CompanyExportButton, CompanyImportButton } from "./_components/CompanyListTools";

// รายชื่อบริษัท (CRM v2 · ใบ C1.3 · พิมพ์เขียว §3.4/§3.17) — `/app/sys/{id}/crm/companies`
// URL state: ?q · industry · size · owner · open=1 · archived=1 · sort · page (ลิงก์แชร์ได้ · ย้อนกลับได้)
// 🔴 404-not-403: ระบบที่ไม่ใช่ CRM ของร้านนี้ = notFound() · ทุกการอ่านผ่านบริการ (companyWhere) ไม่มี query บริษัทในหน้านี้

const PAGE_SIZE = 50;

export default async function CompaniesPage({
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
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const q = one("q").slice(0, 100);
  const industry = one("industry").slice(0, 100);
  const size = (COMPANY_SIZES as readonly string[]).includes(one("size")) ? (one("size") as CompanySize) : "";
  const owner = one("owner");
  const open = one("open") === "1";
  const archived = one("archived") === "1";
  const sort: CompanySort = (COMPANY_SORTS as readonly string[]).includes(one("sort")) ? (one("sort") as CompanySort) : "name";
  const page = Math.max(1, Math.floor(Number(one("page")) || 1));

  // 🔴 หน้า GET ไม่เขียนอะไร (รีวิว SF12) — ฟิลด์ระบบของบริษัทถูก seed ตอนเขียนครั้งแรก (สร้าง/แก้/นำเข้า)
  const [list, owners] = await Promise.all([
    listCompanies(ctx, actor, { q, industry, size: size || null, owner: owner || null, hasOpenDeals: open ? true : null, includeArchived: archived, sort, page, pageSize: PAGE_SIZE }),
    ownerOptions(ctx, actor),
  ]);
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  const def = systemDef(sys.type);
  const base = `/app/sys/${id}/crm/companies`;
  const filters = { q: q || null, industry: industry || null, size: size || null, owner: owner || null, hasOpenDeals: open ? true : null, includeArchived: archived };
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (industry) u.set("industry", industry);
    if (size) u.set("size", size);
    if (owner) u.set("owner", owner);
    if (open) u.set("open", "1");
    if (archived) u.set("archived", "1");
    if (sort !== "name") u.set("sort", sort);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const now = new Date();

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="companies-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        desc="บริษัท — ลูกค้าองค์กร ผู้ติดต่อ ดีล และยอดค้างชำระในที่เดียว"
        actions={
          <>
            <CompanyImportButton systemId={id} />
            <CompanyExportButton systemId={id} filters={filters} />
            <Link href={`${base}/new`} className="btn btn-primary text-sm" data-testid="companies-new-btn">
              + เพิ่มบริษัท
            </Link>
          </>
        }
      />
      <ModuleTabs items={crmNavItems(id)} />

      <form method="get" action={base} className="card flex flex-wrap items-end gap-2 p-3" data-testid="companies-filter-form">
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ค้นหา</span>
          <input name="q" defaultValue={q} placeholder="ชื่อ · เลขภาษี · โดเมนอีเมล" className="input text-sm" data-testid="companies-filter-q" />
        </label>
        <label className="flex w-[150px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>อุตสาหกรรม</span>
          <input name="industry" defaultValue={industry} className="input text-sm" data-testid="companies-filter-industry" />
        </label>
        <label className="flex w-[130px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ขนาด</span>
          <select name="size" defaultValue={size} className="input text-sm" data-testid="companies-filter-size">
            <option value="">ทุกขนาด</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {COMPANY_SIZE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[160px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ผู้ดูแล</span>
          <select name="owner" defaultValue={owner} className="input text-sm" data-testid="companies-filter-owner">
            <option value="">ทุกคน</option>
            <option value="none">ยังไม่มีผู้ดูแล</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[150px] flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>เรียงตาม</span>
          <select name="sort" defaultValue={sort} className="input text-sm" data-testid="companies-filter-sort">
            <option value="name">ชื่อ ก–ฮ</option>
            <option value="-lastActivityAt">กิจกรรมล่าสุด</option>
            <option value="-openDealCount">ดีลเปิดมากสุด</option>
            <option value="-wonValueSatang">มูลค่าชนะมากสุด</option>
            <option value="-createdAt">เพิ่มล่าสุด</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 py-2 text-sm">
          <input type="checkbox" name="open" value="1" defaultChecked={open} data-testid="companies-filter-open" />
          มีดีลเปิด
        </label>
        <label className="flex items-center gap-1.5 py-2 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={archived} data-testid="companies-filter-archived" />
          รวมที่เก็บถาวร
        </label>
        <button type="submit" className="btn btn-ghost text-sm" data-testid="companies-filter-submit">
          กรอง
        </button>
        {(q || industry || size || owner || open || archived) && (
          <Link href={base} className="py-2 text-sm text-[color:var(--color-muted)] underline" data-testid="companies-filter-clear">
            ล้างตัวกรอง
          </Link>
        )}
      </form>

      <div className="text-xs text-[color:var(--color-muted)]" data-testid="companies-count">
        ทั้งหมด {list.total.toLocaleString("th-TH")} บริษัท
      </div>

      {list.items.length === 0 ? (
        <div className="card py-10 text-center" data-testid="companies-empty">
          <p className="text-sm text-[color:var(--color-muted)]">
            {q || industry || size || owner || open ? "ไม่พบบริษัทที่ตรงกับตัวกรองนี้ — ลองล้างตัวกรองหรือค้นด้วยคำอื่น" : "ยังไม่มีบริษัทในระบบนี้ — เริ่มจากเพิ่มบริษัทแรก หรือนำเข้าจากไฟล์ CSV"}
          </p>
          <Link href={`${base}/new`} className="btn btn-ghost mt-3 text-sm" data-testid="companies-empty-new">
            + เพิ่มบริษัท
          </Link>
        </div>
      ) : (
        <>
          {/* จอกว้าง: ตาราง */}
          <div className="card hidden overflow-x-auto p-0 md:block" data-testid="companies-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
                  <th className="px-4 py-2.5 font-medium">บริษัท</th>
                  <th className="px-3 py-2.5 font-medium">อุตสาหกรรม</th>
                  <th className="px-3 py-2.5 font-medium">ขนาด</th>
                  <th className="px-3 py-2.5 font-medium">ผู้ดูแล</th>
                  <th className="px-3 py-2.5 text-right font-medium">ดีลเปิด</th>
                  <th className="px-3 py-2.5 text-right font-medium">มูลค่าชนะ</th>
                  <th className="px-3 py-2.5 text-right font-medium">ค้างชำระ</th>
                  <th className="px-4 py-2.5 font-medium">กิจกรรมล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5">
                      <Link href={`${base}/${c.id}`} className="font-medium hover:underline" data-testid="companies-row-link">
                        {c.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
                        {c.taxId ? <span>เลขภาษี {formatTaxId(c.taxId)}</span> : <span>ไม่มีเลขภาษี</span>}
                        <span>· {COMPANY_LIFECYCLE_LABEL[c.lifecycleStage]}</span>
                        {c.archivedAt && <span className="rounded-full border px-1.5">เก็บถาวร</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{c.industry ?? "—"}</td>
                    <td className="px-3 py-2.5">{c.size ? COMPANY_SIZE_LABEL[c.size] : "—"}</td>
                    <td className="px-3 py-2.5">{c.ownerUserId ? (ownerName.get(c.ownerUserId) ?? "—") : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.openDealCount.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatSatangBaht(c.wonValueSatang)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={c.outstandingSatang > 0 ? { color: "var(--color-danger)", fontWeight: 600 } : undefined}>
                      {formatSatangBaht(c.outstandingSatang)}
                    </td>
                    <td className="px-4 py-2.5 text-[color:var(--color-muted)]">{relativeThai(c.lastActivityAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* มือถือ: การ์ด */}
          <div className="flex flex-col gap-2 md:hidden" data-testid="companies-cards">
            {list.items.map((c) => (
              <Link key={c.id} href={`${base}/${c.id}`} className="card flex flex-col gap-1 p-3" data-testid="companies-card-link">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">{c.name}</span>
                  {c.outstandingSatang > 0 && (
                    <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--color-danger)" }}>
                      ค้าง {formatSatangBaht(c.outstandingSatang)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {[c.industry, c.size ? COMPANY_SIZE_LABEL[c.size] : null, c.ownerUserId ? ownerName.get(c.ownerUserId) : null].filter(Boolean).join(" · ") || "ยังไม่มีรายละเอียด"}
                </span>
                <span className="text-xs text-[color:var(--color-muted)]">
                  ดีลเปิด {c.openDealCount.toLocaleString("th-TH")} · ชนะ {formatSatangBaht(c.wonValueSatang)} · {relativeThai(c.lastActivityAt, now)}
                </span>
              </Link>
            ))}
          </div>
          {pages > 1 && (
            <nav className="flex items-center justify-center gap-3 text-sm" aria-label="เปลี่ยนหน้า">
              {page > 1 ? (
                <Link href={qs(page - 1)} className="btn btn-ghost text-sm" data-testid="companies-page-prev">
                  ‹ ก่อนหน้า
                </Link>
              ) : null}
              <span className="text-[color:var(--color-muted)]">
                หน้า {page.toLocaleString("th-TH")} / {pages.toLocaleString("th-TH")}
              </span>
              {page < pages ? (
                <Link href={qs(page + 1)} className="btn btn-ghost text-sm" data-testid="companies-page-next">
                  ถัดไป ›
                </Link>
              ) : null}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
