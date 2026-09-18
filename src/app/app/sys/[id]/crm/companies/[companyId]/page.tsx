import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor } from "@/lib/modules/member";
import { getCompany360, ownerOptions } from "@/lib/modules/crm/companies";
import { records } from "@/lib/modules/crm/objects";
import {
  CompaniesError,
  COMPANY_LIFECYCLE_LABEL,
  COMPANY_SIZE_LABEL,
  formatSatangBaht,
  formatTaxId,
  relativeThai,
  type Company360,
  type CompanyDealRow,
  type CompanyDocRow,
} from "@/lib/modules/crm/companies-shared";
import { AddContactButton, CompanyContactsTable, CompanyMenu } from "../_components/Company360Actions";
// CRM C1.6 ▸ บล็อกกิจกรรม/โน้ต + ไฟล์แนบ (คอมโพเนนต์ฝั่งเซิร์ฟเวอร์ · ใบ C1.6 เป็นเจ้าของ) ◂
import { CrmActivityBlock } from "@/components/crm/activity/CrmActivityBlock";
import { CrmFilesBlock } from "@/components/crm/files/CrmFilesBlock";

// บริษัท 360 (CRM v2 · ใบ C1.3 · พิมพ์เขียว §3.4 · ภาพ 04) — `/app/sys/{id}/crm/companies/{companyId}`
// URL state: ?tab=overview|contacts|deals|documents|timeline|obj-<objectKey>
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ / บริษัทของระบบอื่น-ร้านอื่น = notFound() — ไม่บอกว่า "มีแต่ห้ามดู"
// 🔴 ทุกข้อมูลมาจากบริการ (`getCompany360` → companyWhere) · หน้านี้ไม่ query ตารางบริษัทเอง

const DEAL_KIND_LABEL: Record<CompanyDealRow["kind"], string> = { OPEN: "เปิดอยู่", WON: "ชนะ", LOST: "แพ้" };
const CHANNEL_LABEL: Record<string, string> = { LINE: "LINE", EMAIL: "อีเมล", PHONE: "โทรศัพท์" };
const ACTIVITY_ICON: Record<string, string> = { CALL: "☎", MEETING: "👥", EMAIL: "✉", LINE: "💬", CHAT: "💬", NOTE: "📝", TASK: "✓", VISIT: "📍", SMS: "✉", WHATSAPP: "💬", WEB: "🌐", PORTAL: "🔑" };

const docTone = (d: CompanyDocRow): React.CSSProperties =>
  d.status === "AWAITING_PAYMENT" || d.status === "PARTIAL" || d.status === "OVERDUE"
    ? { color: "var(--color-danger)", borderColor: "var(--color-danger)", fontWeight: 600 }
    : d.status === "PAID"
      ? { color: "var(--color-accent)", borderColor: "var(--color-accent)", fontWeight: 600 }
      : { color: "var(--color-muted)", borderColor: "var(--color-line)" };

export default async function Company360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, companyId }, sp] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const data = await getCompany360(ctx, actor, companyId).catch((e: unknown) => {
    if (e instanceof CompaniesError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!data) notFound();

  const c = data.company;
  const live = !c.archivedAt && !c.mergedIntoId;
  const owners = live ? await ownerOptions(ctx, actor) : [];
  const mergedFlag = sp.merged === "1";
  const acctFlag = typeof sp.acct === "string" ? sp.acct : "";

  const base = `/app/sys/${id}/crm/companies`;
  const self = `${base}/${c.id}`;
  const tabRaw = typeof sp.tab === "string" ? sp.tab : "overview";
  const objTab = tabRaw.startsWith("obj-") ? data.objectTabs.find((t) => `obj-${t.objectKey}` === tabRaw) ?? null : null;
  const tab = ["overview", "contacts", "deals", "documents", "timeline"].includes(tabRaw) || objTab ? tabRaw : "overview";
  const objRows = objTab
    ? await records.list(ctx, actor, objTab.objectKey, { parentId: c.id, pageSize: 50 }).catch(() => ({ items: [], total: 0, page: 1, pageSize: 50 }))
    : null;
  const now = new Date();
  const openDeals = data.deals.filter((d) => d.kind === "OPEN").length;
  const wonDeals = data.deals.filter((d) => d.kind === "WON").length;

  const TABS: { key: string; label: string; count?: number; custom?: boolean }[] = [
    { key: "overview", label: "ภาพรวม" },
    { key: "contacts", label: "ผู้ติดต่อ", count: data.contacts.length },
    { key: "deals", label: "ดีล", count: data.deals.length },
    { key: "documents", label: "เอกสารบัญชี" },
    ...data.objectTabs.map((t) => ({ key: `obj-${t.objectKey}`, label: t.labelPlural || t.label, count: t.count, custom: true })),
    { key: "timeline", label: "ไทม์ไลน์" },
  ];

  const subline = [
    c.taxId ? `เลขภาษี ${formatTaxId(c.taxId)}${c.branchCode && c.branchCode !== "00000" ? ` สาขา ${c.branchCode}` : ""}` : "ยังไม่มีเลขภาษี",
    c.industry ? `อุตสาหกรรม${c.industry}` : null,
    c.size ? `ขนาด${COMPANY_SIZE_LABEL[c.size]}` : null,
    data.owner ? `ผู้ดูแล ${data.owner.name}` : "ยังไม่มีผู้ดูแล",
    data.team ? `ทีม${data.team.name}` : null,
  ].filter(Boolean);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="company-360">
      {/* แถบหัวหน้า: ย้อนกลับ · ชื่อ · เมนู "…" */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={base} className="shrink-0 px-1 text-lg text-[color:var(--color-muted)]" aria-label="กลับไปรายชื่อบริษัท" data-testid="company-back-link">
            ‹
          </Link>
          <h1 className="min-w-0 truncate text-lg font-semibold sm:text-xl">บริษัท 360 — {c.name}</h1>
        </div>
        {live && <CompanyMenu systemId={id} company={c} owners={owners} parent={data.parent} />}
      </div>

      {mergedFlag && (
        <div
          className="card p-3 text-sm"
          style={acctFlag ? { borderColor: "var(--color-danger)" } : undefined}
          data-testid="company-merge-result-banner"
          role="status"
        >
          {acctFlag === "skipped"
            ? "รวมบริษัทแล้ว — แต่ยังไม่ได้ย้ายเอกสารบัญชี เพราะบัญชีนี้ไม่มีสิทธิ์รวมผู้ติดต่อในระบบบัญชี ให้ผู้มีสิทธิ์รวมผู้ติดต่อซ้ำที่หน้าระบบบัญชี"
            : acctFlag === "failed"
              ? "รวมบริษัทแล้ว — แต่ย้ายเอกสารบัญชีไม่สำเร็จ ให้รวมผู้ติดต่อซ้ำที่หน้าระบบบัญชีเอง (ข้อมูลฝั่ง CRM รวมครบแล้ว)"
              : acctFlag === "warn"
                ? "รวมบริษัทแล้ว — แต่บางรายการที่ผูกกับบริษัทที่ถูกรวมยังย้ายไม่ครบ ตรวจดูในแท็บของรายการนั้น"
                : "รวมบริษัทเรียบร้อยแล้ว"}
        </div>
      )}
      {c.mergedIntoId && (
        <div className="card p-3 text-sm" data-testid="company-merged-banner">
          บริษัทนี้ถูกรวมเข้ากับบริษัทอื่นแล้ว —{" "}
          <Link href={`${base}/${c.mergedIntoId}`} className="underline" data-testid="company-merged-link">
            เปิดบริษัทที่เก็บไว้
          </Link>
        </div>
      )}
      {!c.mergedIntoId && c.archivedAt && (
        <div className="card p-3 text-sm text-[color:var(--color-muted)]" data-testid="company-archived-banner">
          บริษัทนี้ถูกเก็บถาวรแล้ว — ดูข้อมูลย้อนหลังได้ แต่แก้ไขไม่ได้
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ── คอลัมน์หลัก ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="card flex flex-col gap-4 p-4" data-testid="company-360-header">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid shrink-0 place-items-center rounded-xl border text-lg" style={{ width: 52, height: 52, background: "var(--color-surface-2)" }} aria-hidden>
                  🏢
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-lg font-semibold">{c.name}</span>
                    <span className="rounded-md border px-1.5 py-0.5 text-xs font-semibold" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}>
                      {COMPANY_LIFECYCLE_LABEL[c.lifecycleStage]}
                    </span>
                    <span className="rounded-md border px-1.5 py-0.5 text-xs text-[color:var(--color-muted)]">คะแนน {c.score.toLocaleString("th-TH")}</span>
                  </div>
                  <span className="text-xs text-[color:var(--color-muted)]">{subline.join(" · ")}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AddContactButton systemId={id} companyId={c.id} disabled={!live} />
                <Link href={`/app/sys/${id}/crm/deals?companyId=${encodeURIComponent(c.id)}`} className="btn btn-primary text-sm" data-testid="company-new-deal-btn">
                  เปิดดีลใหม่
                </Link>
              </div>
            </div>
            <div className="grid gap-3 border-t pt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }} data-testid="company-360-kpis">
              <Kpi label="ดีลเปิด" value={data.kpis.openDealCount.toLocaleString("th-TH")} />
              <Kpi label="ดีลชนะสะสม" value={data.kpis.wonDealCount.toLocaleString("th-TH")} />
              <Kpi label="มูลค่ารวม (ชนะ)" value={formatSatangBaht(data.kpis.wonValueSatang)} />
              <Kpi label="ค้างชำระ" value={formatSatangBaht(data.kpis.outstandingSatang)} danger={data.kpis.outstandingSatang > 0} />
              <Kpi label="กิจกรรมล่าสุด" value={relativeThai(data.kpis.lastActivityAt, now)} small />
            </div>
          </section>

          <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px" aria-label="แท็บของบริษัท" data-testid="company-360-tabs">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "overview" ? self : `${self}?tab=${t.key}`}
                data-testid={`company-360-tab-${t.key}`}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm"
                style={t.key === tab ? { borderBottom: "2px solid var(--color-accent)", fontWeight: 600 } : { color: "var(--color-muted)" }}
              >
                {t.label}
                {t.count !== undefined && <span className="text-xs text-[color:var(--color-muted)]">{t.count.toLocaleString("th-TH")}</span>}
                {t.custom && <span className="rounded-md border px-1 text-[10px] text-[color:var(--color-muted)]">กำหนดเอง</span>}
              </Link>
            ))}
          </nav>

          {(tab === "overview" || tab === "contacts") && <ContactsCard data={data} systemId={id} live={live} />}
          {tab === "overview" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <DealsCard deals={data.deals} open={openDeals} won={wonDeals} />
              <DocsCard docs={data.documents} linked={data.accountLinked} />
            </div>
          )}
          {tab === "deals" && <DealsCard deals={data.deals} open={openDeals} won={wonDeals} />}
          {tab === "documents" && <DocsCard docs={data.documents} linked={data.accountLinked} />}
          {objTab && objRows && (
            <section className="card flex flex-col gap-2 p-4" data-testid="company-360-object">
              <h2 className="flex items-center gap-2 font-semibold">
                {objTab.labelPlural || objTab.label}
                <span className="rounded-md border px-1.5 text-xs font-normal text-[color:var(--color-muted)]">วัตถุกำหนดเอง</span>
              </h2>
              {objRows.items.length === 0 ? (
                <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการของบริษัทนี้</p>
              ) : (
                <ul className="flex flex-col divide-y text-sm">
                  {objRows.items.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 break-words font-medium">{r.title}</span>
                      <span className="shrink-0 text-xs text-[color:var(--color-muted)]">{relativeThai(r.createdAt, now)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {(tab === "overview" || tab === "timeline") && (
            <section className="card flex flex-col gap-1 p-4" data-testid="company-360-timeline">
              <h2 className="font-semibold">
                ไทม์ไลน์รวม <span className="text-xs font-normal text-[color:var(--color-muted)]">รวมทุกผู้ติดต่อในบริษัทนี้</span>
              </h2>
              {data.timeline.length === 0 ? (
                <p className="py-2 text-sm text-[color:var(--color-muted)]">ยังไม่มีกิจกรรม</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {(tab === "overview" ? data.timeline.slice(0, 8) : data.timeline).map((t) => (
                    <li key={t.id} className="flex gap-3 py-2.5">
                      <span className="w-5 shrink-0 text-center text-sm text-[color:var(--color-muted)]" aria-hidden>
                        {ACTIVITY_ICON[t.type] ?? "•"}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="break-words text-sm">{t.title}</span>
                        <span className="text-xs text-[color:var(--color-muted)]">
                          {relativeThai(t.at, now)}
                          {t.contactName ? ` · ${t.contactName}` : ""}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {/* CRM C1.6 ▸ กิจกรรมและโน้ต (แท็บภาพรวม/ไทม์ไลน์) */}
          {(tab === "overview" || tab === "timeline") && <CrmActivityBlock ctx={ctx} actor={actor} target={{ companyId: c.id }} />}
          {/* ◂ CRM C1.6 */}
        </div>

        {/* ── แถบขวา ── */}
        <aside className="flex w-full flex-col gap-3 lg:w-[300px] lg:shrink-0" data-testid="company-360-side">
          {/* CRM C1.6 ▸ ไฟล์แนบ */}
          <CrmFilesBlock ctx={ctx} actor={actor} entityType="COMPANY" entityId={c.id} />
          {/* ◂ CRM C1.6 */}
          <div className="card flex flex-col gap-2 p-4">
            <span className="font-semibold">ผู้ช่วย AI</span>
            <SideSoon title="สรุปบริษัทนี้" hint="ดีล + เอกสารบัญชีทั้งหมด" />
            <SideSoon title="แนะนำโอกาสต่อยอด" hint="อิงประวัติซื้อ" />
          </div>
          <div className="card flex flex-col gap-2 p-4">
            <span className="font-semibold">Portal ลูกค้า</span>
            <p className="text-xs text-[color:var(--color-muted)]">ให้ผู้ติดต่อของบริษัทเข้าดูใบเสนอราคา/ใบแจ้งหนี้เองได้ — เปิดใช้ได้เมื่อระบบ portal พร้อม</p>
          </div>
          <div className="card flex flex-col gap-2 p-4" data-testid="company-360-group">
            <span className="font-semibold">บริษัทในเครือ</span>
            {!data.parent && data.subsidiaries.length === 0 ? (
              <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีบริษัทแม่หรือบริษัทลูก</p>
            ) : (
              <>
                {data.parent && (
                  <Link href={`${base}/${data.parent.id}`} className="flex flex-col text-sm hover:underline" data-testid="company-parent-link">
                    <span>{data.parent.name}</span>
                    <span className="text-xs text-[color:var(--color-muted)]">บริษัทแม่</span>
                  </Link>
                )}
                {data.subsidiaries.map((s) => (
                  <Link key={s.id} href={`${base}/${s.id}`} className="flex flex-col text-sm hover:underline" data-testid="company-subsidiary-link">
                    <span>{s.name}</span>
                    <span className="text-xs text-[color:var(--color-muted)]">บริษัทลูก</span>
                  </Link>
                ))}
              </>
            )}
          </div>
          {data.kpis.outstandingSatang > 0 && (
            <Link href={`${self}?tab=documents`} className="card flex items-center gap-2 p-3 text-sm" style={{ borderColor: "var(--color-accent)" }} data-testid="company-outstanding-alert">
              <span aria-hidden>⚠</span>
              <span>
                ค้างชำระ <b>{formatSatangBaht(data.kpis.outstandingSatang)}</b> — ดูเอกสารบัญชี
              </span>
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, danger, small }: { label: string; value: string; danger?: boolean; small?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      <span className={`${small ? "text-base" : "text-xl"} font-semibold tabular-nums`} style={danger ? { color: "var(--color-danger)" } : undefined}>
        {value}
      </span>
    </div>
  );
}

function SideSoon({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t pt-2 first-of-type:border-t-0">
      <div className="flex flex-col">
        <span className="text-sm">{title}</span>
        <span className="text-xs text-[color:var(--color-muted)]">{hint}</span>
      </div>
      <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] text-[color:var(--color-muted)]">เร็ว ๆ นี้</span>
    </div>
  );
}

function ContactsCard({ data, systemId, live }: { data: Company360; systemId: string; live: boolean }) {
  return (
    <section className="card flex flex-col p-0" data-testid="company-360-contacts">
      <h2 className="px-4 pb-2 pt-4 font-semibold">
        ผู้ติดต่อ <span className="text-xs font-normal text-[color:var(--color-muted)]">{data.contacts.length.toLocaleString("th-TH")} คน</span>
      </h2>
      {data.contacts.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-[color:var(--color-muted)]">ยังไม่มีผู้ติดต่อในบริษัทนี้ — กด &quot;+ เพิ่มผู้ติดต่อ&quot; ด้านบน</p>
      ) : (
        <CompanyContactsTable
          systemId={systemId}
          companyId={data.company.id}
          disabled={!live}
          rows={data.contacts.map((p) => ({ contactId: p.contactId, name: p.name, jobTitle: p.jobTitle, role: p.role, isPrimary: p.isPrimary, channelLabel: p.channel ? CHANNEL_LABEL[p.channel] ?? null : null }))}
        />
      )}
    </section>
  );
}

function DealsCard({ deals, open, won }: { deals: CompanyDealRow[]; open: number; won: number }) {
  return (
    <section className="card flex min-w-0 flex-col p-0" data-testid="company-360-deals">
      <h2 className="px-4 pb-2 pt-4 font-semibold">
        ดีล <span className="text-xs font-normal text-[color:var(--color-muted)]">{open.toLocaleString("th-TH")} เปิด · {won.toLocaleString("th-TH")} ชนะ</span>
      </h2>
      {deals.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-[color:var(--color-muted)]">ยังไม่มีดีลของบริษัทนี้</p>
      ) : (
        <table className="w-full table-fixed border-t text-sm">
          <thead>
            <tr className="bg-[color:var(--color-surface-2)] text-left text-xs text-[color:var(--color-muted)]">
              <th className="px-4 py-2 font-medium">ดีล</th>
              <th className="w-[96px] px-2 py-2 font-medium">ขั้น</th>
              <th className="w-[104px] px-4 py-2 text-right font-medium">มูลค่า</th>
            </tr>
          </thead>
          <tbody>
            {deals.slice(0, 20).map((d) => (
              <tr key={d.id} className="border-t">
                <td className="break-words px-4 py-2.5" style={d.kind === "OPEN" ? { fontWeight: 600 } : { color: "var(--color-muted)" }}>
                  {d.title}
                </td>
                <td className="px-2 py-2.5">
                  <span
                    className="inline-block max-w-full truncate rounded-md border px-1.5 py-0.5 text-[11px]"
                    style={d.kind === "WON" ? { color: "var(--color-accent)", borderColor: "var(--color-accent)", fontWeight: 600 } : d.kind === "LOST" ? { color: "var(--color-muted)" } : undefined}
                  >
                    {d.kind === "OPEN" ? d.stageName || DEAL_KIND_LABEL.OPEN : `${d.kind === "WON" ? "✓ " : ""}${DEAL_KIND_LABEL[d.kind]}`}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatSatangBaht(d.kind === "WON" && d.wonValueSatang !== null ? d.wonValueSatang : d.valueSatang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DocsCard({ docs, linked }: { docs: CompanyDocRow[]; linked: boolean }) {
  return (
    <section className="card flex min-w-0 flex-col p-0" data-testid="company-360-documents">
      <h2 className="px-4 pb-2 pt-4 font-semibold">เอกสารบัญชี</h2>
      {!linked ? (
        <p className="px-4 pb-4 text-sm text-[color:var(--color-muted)]">ระบบ CRM นี้ยังไม่ได้เชื่อมกับระบบบัญชี — เชื่อมแล้วใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จของบริษัทจะขึ้นที่นี่</p>
      ) : docs.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-[color:var(--color-muted)]">ยังไม่มีเอกสารของบริษัทนี้ในระบบบัญชี</p>
      ) : (
        <table className="w-full table-fixed border-t text-sm">
          <thead>
            <tr className="bg-[color:var(--color-surface-2)] text-left text-xs text-[color:var(--color-muted)]">
              <th className="px-4 py-2 font-medium">เลขที่</th>
              <th className="hidden px-2 py-2 font-medium sm:table-cell">ประเภท</th>
              <th className="w-[96px] px-2 py-2 text-right font-medium">ยอด</th>
              <th className="w-[92px] px-3 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {docs.slice(0, 20).map((d) => (
              <tr key={d.id} className="border-t">
                <td className="break-words px-4 py-2.5 font-semibold">
                  {d.href ? (
                    <Link href={d.href} className="hover:underline" data-testid="company-doc-link">
                      {d.docNo ?? "ฉบับร่าง"}
                    </Link>
                  ) : (
                    (d.docNo ?? "ฉบับร่าง")
                  )}
                  <span className="block text-xs font-normal text-[color:var(--color-muted)] sm:hidden">{d.docLabel}</span>
                </td>
                <td className="hidden break-words px-2 py-2.5 text-[color:var(--color-muted)] sm:table-cell">{d.docLabel}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{formatSatangBaht(d.totalSatang)}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-block max-w-full truncate rounded-md border px-1.5 py-0.5 text-[11px]" style={docTone(d)}>
                    {d.statusLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
