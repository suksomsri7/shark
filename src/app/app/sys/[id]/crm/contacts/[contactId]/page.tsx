import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor } from "@/lib/modules/member";
import { convertOptions, getContact360, ownerOptions } from "@/lib/modules/crm/contacts";
import {
  CONTACT_SOURCE_LABEL,
  ContactsError,
  LEAD_STATUS_LABEL,
  LIFECYCLE_LABEL,
  SCORE_BAND_LABEL,
  contactLabel,
  type Contact360,
  type ContactScoreBand,
  type ConvertOptions,
} from "@/lib/modules/crm/contacts-shared";
import { COMPANY_CONTACT_ROLE_LABEL, formatSatangBaht, relativeThai, type CompanyContactRole } from "@/lib/modules/crm/companies-shared";
import { ConsentBlock, ContactMenu, ConvertButton } from "../_components/Contact360Actions";

// ผู้ติดต่อ 360 + แปลง lead (CRM v2 · ใบ C1.4 · พิมพ์เขียว §3.5 · ภาพ 05) — `/app/sys/{id}/crm/contacts/{contactId}`
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ / ผู้ติดต่อของระบบอื่น-ร้านอื่น = notFound() — ไม่บอกว่า "มีแต่ห้ามดู"
// 🔴 ทุกข้อมูลมาจากบริการ (`getContact360` → contactWhere · ค่าอ่อนไหวผ่าน engine D8) · หน้านี้ไม่ query ตารางผู้ติดต่อเอง · GET ไม่เขียน

const TONE: Record<ContactScoreBand, string> = { HOT: "var(--color-danger)", WARM: "var(--color-accent)", COLD: "var(--color-muted)" };
const ACTIVITY_ICON: Record<string, string> = { CALL: "☎", MEETING: "👥", EMAIL: "✉", LINE: "💬", CHAT: "💬", NOTE: "📝", TASK: "✓", VISIT: "📍", SMS: "✉", WHATSAPP: "💬", WEB: "🌐", PORTAL: "🔑" };
const DEAL_KIND_LABEL: Record<Contact360["deals"][number]["kind"], string> = { OPEN: "เปิดอยู่", WON: "ชนะ", LOST: "แพ้" };

export default async function Contact360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; contactId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, contactId }, sp] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const data = await getContact360(ctx, actor, contactId).catch((e: unknown) => {
    if (e instanceof ContactsError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!data) notFound();

  const c = data.contact;
  const live = !c.archivedAt && !c.mergedIntoId;
  const noOptions: ConvertOptions = { memberSystems: [], pipelines: [] };
  const [owners, options]: [{ id: string; name: string }[], ConvertOptions] = live ? await Promise.all([ownerOptions(ctx, actor), convertOptions(ctx, actor)]) : [[], noOptions];
  const base = `/app/sys/${id}/crm/contacts`;
  const name = contactLabel(c);
  const now = new Date();
  const openDeals = data.deals.filter((d) => d.kind === "OPEN");
  const utm = data.sourceDetail && typeof data.sourceDetail.utm === "object" && data.sourceDetail.utm ? (data.sourceDetail.utm as Record<string, string>) : null;
  const subline = [
    data.company ? `${data.company.name}${c.jobTitle ? ` — ${c.jobTitle}` : ""}` : c.jobTitle,
    data.owner ? `ผู้ดูแล ${data.owner.name}` : "ยังไม่มีผู้ดูแล",
    c.sourceKind ? `ที่มาแรก ${CONTACT_SOURCE_LABEL[c.sourceKind]}${c.sourceChannel ? ` (${c.sourceChannel})` : ""}` : null,
    c.lastActivityAt ? `ติดต่อล่าสุด ${relativeThai(c.lastActivityAt, now)}` : null,
  ].filter(Boolean);
  const infoRows: [string, string][] = [
    ["มือถือ", c.phone ?? "—"],
    ["อีเมล", c.email ?? "—"],
    ["LINE", c.lineUserId ? "ผูกจากแชทแล้ว" : "—"],
    ["ตำแหน่ง", c.jobTitle ?? "—"],
    ["บริษัท", data.company?.name ?? (c.companyText ? `${c.companyText} (ยังไม่ผูกเป็นบริษัท)` : "—")],
  ];
  const sections = data.fields.sections.filter((s) => !s.isSystem && s.fields.length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="contact-360">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={base} className="shrink-0 px-1 text-lg text-[color:var(--color-muted)]" aria-label="กลับไปรายชื่อผู้ติดต่อ" data-testid="contact-back-link">
            ‹
          </Link>
          <h1 className="min-w-0 truncate text-lg font-semibold sm:text-xl">ผู้ติดต่อ 360 — {name}</h1>
        </div>
        <ContactMenu
          systemId={id}
          owners={owners}
          contact={{
            id: c.id,
            firstName: c.firstName ?? c.name,
            lastName: c.lastName ?? "",
            phone: c.phone ?? "",
            email: c.email ?? "",
            jobTitle: c.jobTitle ?? "",
            ownerUserId: c.ownerUserId ?? "",
            lifecycleStage: c.lifecycleStage,
            leadStatus: c.leadStatus,
            tags: c.tags,
            archived: !!c.archivedAt,
            companyId: c.companyId,
          }}
        />
      </div>

      {sp.merged === "1" && (
        <div className="card p-3 text-sm" data-testid="contact-merge-result-banner" role="status">
          รวมผู้ติดต่อเรียบร้อยแล้ว — ดีล กิจกรรม และบริษัทของคนที่ถูกรวมย้ายมาที่นี่
        </div>
      )}
      {sp.warn === "company" && (
        <div className="card p-3 text-sm" style={{ borderColor: "var(--color-danger)" }} data-testid="contact-company-warn-banner" role="status">
          เพิ่มผู้ติดต่อแล้ว แต่ผูกบริษัทไม่สำเร็จ — ผูกบริษัทได้จากเมนู “แก้ไขข้อมูลติดต่อ”
        </div>
      )}
      {c.mergedIntoId && (
        <div className="card p-3 text-sm" data-testid="contact-merged-banner">
          ผู้ติดต่อนี้ถูกรวมเข้ากับอีกคนแล้ว —{" "}
          <Link href={`${base}/${c.mergedIntoId}`} className="underline" data-testid="contact-merged-link">
            เปิดผู้ติดต่อที่เก็บไว้
          </Link>
        </div>
      )}
      {!c.mergedIntoId && c.archivedAt && (
        <div className="card p-3 text-sm text-[color:var(--color-muted)]" data-testid="contact-archived-banner">
          ผู้ติดต่อนี้ถูกเก็บถาวรแล้ว — ดูข้อมูลย้อนหลังได้ แต่แก้ไขไม่ได้ (กู้คืนได้จากเมนู …)
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ── คอลัมน์หลัก ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="card flex flex-col gap-3 p-4" data-testid="contact-360-header">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid shrink-0 place-items-center rounded-full border text-lg font-semibold" style={{ width: 52, height: 52, background: "var(--color-surface-2)" }} aria-hidden>
                  {name.slice(0, 1)}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-lg font-semibold">{name}</span>
                    {data.member && (
                      <span className="rounded-md border px-1.5 py-0.5 text-xs font-semibold" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }} data-testid="contact-member-badge">
                        เป็นสมาชิก{data.member.tierName ? ` ${data.member.tierName}` : ""}
                      </span>
                    )}
                    <span className="rounded-md border px-1.5 py-0.5 text-xs text-[color:var(--color-muted)]">{LIFECYCLE_LABEL[c.lifecycleStage]}</span>
                    <span className="rounded-md border px-1.5 py-0.5 text-xs font-semibold">{LEAD_STATUS_LABEL[c.leadStatus]}</span>
                    {c.scoreBand && (
                      <span className="rounded-md border px-1.5 py-0.5 text-xs font-semibold" style={{ color: TONE[c.scoreBand], borderColor: TONE[c.scoreBand] }}>
                        {SCORE_BAND_LABEL[c.scoreBand]} {c.score.toLocaleString("th-TH")}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[color:var(--color-muted)]">{subline.join(" · ") || "ยังไม่มีรายละเอียด"}</span>
                  {c.tags.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="rounded-full border px-2 text-xs text-[color:var(--color-muted)]">
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="btn btn-ghost text-sm" data-testid="contact-call-link">
                    โทร
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="btn btn-ghost text-sm" data-testid="contact-email-link">
                    ✉ ส่งอีเมล
                  </a>
                )}
                {live && (
                  <ConvertButton
                    systemId={id}
                    contactId={c.id}
                    contactName={name}
                    options={options}
                    member={data.member ? { label: [data.member.tierName, data.member.memberCode].filter(Boolean).join(" ") || "สมาชิก" } : null}
                    companyName={data.company?.name ?? c.companyText}
                    jobTitle={c.jobTitle}
                    converted={!!c.convertedAt}
                  />
                )}
              </div>
            </div>
            {c.convertedAt && <p className="text-xs text-[color:var(--color-muted)]">แปลงแล้วเมื่อ {relativeThai(c.convertedAt, now)}</p>}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card flex flex-col gap-2 p-4" data-testid="contact-360-info">
              <h2 className="font-semibold">ข้อมูลติดต่อ</h2>
              <dl className="flex flex-col divide-y text-sm">
                {infoRows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[110px_1fr] gap-2 py-2">
                    <dt className="text-[color:var(--color-muted)]">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              {data.previousEmails.length > 0 && <p className="text-xs text-[color:var(--color-muted)]">อีเมลเดิม: {data.previousEmails.join(", ")}</p>}
              {utm && (
                <p className="break-words text-xs text-[color:var(--color-muted)]">
                  UTM: {Object.entries(utm).map(([k, v]) => `${k}=${v}`).join(" · ")}
                </p>
              )}
            </section>
            {sections.length === 0 ? (
              <section className="card flex flex-col gap-2 p-4 text-sm text-[color:var(--color-muted)]" data-testid="contact-360-fields-empty">
                <h2 className="font-semibold text-[color:var(--color-ink)]">ข้อมูลเพิ่มเติม</h2>
                ยังไม่มีฟิลด์กำหนดเองของผู้ติดต่อ — เพิ่มได้ที่หน้าตั้งค่าฟิลด์
              </section>
            ) : (
              sections.map((s) => (
                <section key={s.key} className="card flex flex-col gap-2 p-4" data-testid="contact-360-fields">
                  <h2 className="flex items-center gap-2 font-semibold">
                    {s.label}
                    <span className="rounded-md border px-1 text-[10px] font-normal text-[color:var(--color-muted)]">กำหนดเอง</span>
                    {s.sensitive && <span className="rounded-md border px-1 text-[10px] font-normal text-[color:var(--color-danger)]">อ่อนไหว</span>}
                  </h2>
                  <dl className="flex flex-col divide-y text-sm">
                    {s.fields.map((f) => (
                      <div key={f.key} className="grid grid-cols-[minmax(110px,40%)_1fr] gap-2 py-2">
                        <dt className="text-[color:var(--color-muted)]">{f.label}</dt>
                        <dd className="min-w-0 break-words">{f.hidden ? <span className="text-[color:var(--color-muted)]">ซ่อน (ข้อมูลอ่อนไหว)</span> : f.display || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))
            )}
          </div>

          <section className="card flex flex-col gap-2 p-4" data-testid="contact-360-timeline">
            <h2 className="font-semibold">🕒 ไทม์ไลน์</h2>
            {data.timeline.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีกิจกรรมกับผู้ติดต่อนี้</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {data.timeline.map((t) => (
                  <li key={t.id} className="flex gap-3 py-2 text-sm">
                    <span aria-hidden className="w-5 shrink-0 text-center">
                      {ACTIVITY_ICON[t.type] ?? "•"}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="break-words">{t.title}</span>
                      <span className="text-xs text-[color:var(--color-muted)]">
                        {relativeThai(t.at, now)}
                        {t.done ? " · เสร็จแล้ว" : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── แถบขวา ── */}
        <aside className="flex w-full min-w-0 flex-col gap-4 lg:w-[320px] lg:shrink-0">
          <section className="card flex flex-col gap-2 p-4 text-sm" data-testid="contact-360-ai">
            <h2 className="font-semibold">✦ ผู้ช่วย AI</h2>
            <p className="text-xs text-[color:var(--color-muted)]">สรุปเหตุผลคะแนน · ร่างข้อความปิดการขาย — เปิดใช้เมื่อระบบคะแนนและผู้ช่วย AI ของ CRM พร้อม</p>
          </section>

          <section className="card flex flex-col gap-2 p-4 text-sm" data-testid="contact-360-connections">
            <h2 className="font-semibold">🔗 การเชื่อมต่อ</h2>
            <ul className="flex flex-col divide-y">
              <li className="flex items-center justify-between gap-2 py-2">
                <span>สมาชิก{data.member?.tierName ? ` ${data.member.tierName}` : ""}</span>
                {data.member ? (
                  data.member.systemId ? (
                    <Link href={`/app/sys/${data.member.systemId}/member/members/${data.member.customerId}`} className="rounded-md border px-1.5 text-xs font-semibold" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }} data-testid="contact-conn-member-link">
                      ผูกแล้ว{data.member.memberCode ? ` · ${data.member.memberCode}` : ""}
                    </Link>
                  ) : (
                    <span className="rounded-md border px-1.5 text-xs text-[color:var(--color-muted)]">ผูกแล้ว (ไม่พบในระบบสมาชิก)</span>
                  )
                ) : (
                  <span className="rounded-md border px-1.5 text-xs text-[color:var(--color-muted)]">ยังไม่ผูก</span>
                )}
              </li>
              <li className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">บริษัท{data.company ? ` · ${data.company.name}` : ""}</span>
                {data.company ? (
                  <Link href={`/app/sys/${id}/crm/companies/${data.company.id}`} className="rounded-md border px-1.5 text-xs font-semibold" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }} data-testid="contact-conn-company-link">
                    {COMPANY_CONTACT_ROLE_LABEL[data.company.role as CompanyContactRole] ?? "ผูกแล้ว"}
                    {data.company.isPrimary ? " · หลัก" : ""}
                  </Link>
                ) : (
                  <span className="rounded-md border px-1.5 text-xs text-[color:var(--color-muted)]">ยังไม่ผูก</span>
                )}
              </li>
              <li className="flex items-center justify-between gap-2 py-2">
                <span>ดีล CRM</span>
                <span className="rounded-md border px-1.5 text-xs text-[color:var(--color-muted)]">{openDeals.length > 0 ? `เปิดอยู่ ${openDeals.length.toLocaleString("th-TH")}` : "ยังไม่มี"}</span>
              </li>
            </ul>
          </section>

          <section className="card flex flex-col gap-2 p-4 text-sm" data-testid="contact-360-deals">
            <h2 className="font-semibold">ดีลของผู้ติดต่อ</h2>
            {data.deals.length === 0 ? (
              <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีดีล — กด “แปลง lead” เพื่อเปิดดีลแรก</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {data.deals.map((d) => (
                  <li key={d.id} className="flex flex-col gap-0.5 py-2">
                    <span className="break-words font-medium">{d.title}</span>
                    <span className="text-xs text-[color:var(--color-muted)]">
                      {d.pipelineName} · {d.stageName} · {DEAL_KIND_LABEL[d.kind]} · {formatSatangBaht(d.valueSatang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ConsentBlock systemId={id} contactId={c.id} consent={data.consent} disabled={!live} />
        </aside>
      </div>
    </div>
  );
}
