import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
// CRM C1.7 ▸ ด่านคีย์ของ CRM (crm/access.ts) ◂
import { crmCan } from "@/lib/modules/crm/access";
import type { Role } from "@prisma/client";
import { toMemberActor } from "@/lib/modules/member";
import { dealFieldLayout, getDeal360, lostReasonOptions, ownerOptions, pipelineOptions } from "@/lib/modules/crm/deals";
import { DealsError, FORECAST_CATEGORY_LABEL, formatBaht, formatThaiDay, type Deal360, type DealHistoryRow } from "@/lib/modules/crm/deals-shared";
import { DealDocButtons, DealFieldsEditor, DealLinesEditor, DealMenu, DealStageStepper } from "../_components/Deal360Actions";
// CRM C1.6 ▸ บล็อกกิจกรรม/โน้ต + ไฟล์แนบ (คอมโพเนนต์ฝั่งเซิร์ฟเวอร์ · ใบ C1.6 เป็นเจ้าของ) ◂
import { CrmActivityBlock } from "@/components/crm/activity/CrmActivityBlock";
import { CrmFilesBlock } from "@/components/crm/files/CrmFilesBlock";
// CRM C1.9 ▸ แท็บวัตถุกำหนดเอง (คอมโพเนนต์ฝั่งเซิร์ฟเวอร์ · ใบ C1.9 เป็นเจ้าของ) ◂
import { CrmObjectTabs } from "@/components/crm/objects/ObjectTabs";
import { CrmDealCardsBlock } from "@/components/crm/activity/CrmDealCardsBlock";
// CRM C2.4 ▸ บันทึกการโทรของดีล (โมดัลเดียวกับผู้ติดต่อ 360) — ใบ C2.4 เป็นเจ้าของ
//   🔴 ไม่ส่งเบอร์มาที่นี่โดยเจตนา: `getDeal360` ไม่คืนเบอร์ของผู้ติดต่อ (และหน้านี้ห้าม query ตารางผู้ติดต่อเอง) ⇒
//      ปุ่มบนหน้าดีลคือ "บันทึกสาย" · การกดโทรจริงอยู่บนผู้ติดต่อ 360 ที่โหลดเบอร์มาแล้ว ◂
import { CrmClickToCall } from "@/components/crm/call/CrmClickToCall";
import { callAiStatus } from "@/lib/modules/crm/calls";
import { CRM_RECORDING_MAX_BYTES } from "@/lib/modules/crm/calls-shared";
import { ACTIVITY_OUTCOMES_DEFAULT } from "@/lib/modules/crm/activities-shared";
import { outcomeOptions } from "@/lib/modules/crm/activities";

// ดีล 360 (CRM v2 · ใบ C1.5 · พิมพ์เขียว §3.3 · ภาพ 03) — `/app/sys/{id}/crm/deals/{dealId}`
// URL state: ?tab=overview|lines|activities|docs|history
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ / ดีลของระบบอื่น-ร้านอื่น = notFound() — ไม่บอกว่า "มีแต่ห้ามดู"
// 🔴 ทุกข้อมูลมาจากบริการ (`getDeal360` → dealWhere) · หน้านี้ไม่ query ตารางดีลเอง · หน้า GET ไม่เขียนอะไร

const TABS = [
  { key: "overview", label: "ภาพรวม" },
  { key: "lines", label: "รายการสินค้า" },
  { key: "activities", label: "กิจกรรม" },
  { key: "docs", label: "เอกสาร" },
  { key: "history", label: "ประวัติขั้น" },
] as const;
const DOC_LABEL: Record<string, string> = { QUOTATION: "ใบเสนอราคา", INVOICE: "ใบแจ้งหนี้", RECEIPT: "ใบเสร็จ", TAX_INVOICE: "ใบกำกับภาษี" };

const durationText = (h: DealHistoryRow): string => {
  const sec = h.durationSec ?? Math.max(0, Math.floor((Date.now() - Date.parse(h.enteredAt)) / 1000));
  const days = Math.floor(sec / 86_400);
  if (days >= 1) return `${days.toLocaleString("th-TH")} วัน${h.leftAt ? "" : " (อยู่ปัจจุบัน)"}`;
  const hours = Math.floor(sec / 3600);
  return `${hours >= 1 ? `${hours} ชม.` : "ไม่ถึง 1 ชม."}${h.leftAt ? "" : " (อยู่ปัจจุบัน)"}`;
};

export default async function Deal360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; dealId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, dealId }, sp] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  // CRM C1.6 ▸ ชนิดตามผลจริงของ getDeal360 (มี kanbanCards[] — การ์ดบอร์ดงานของดีลใช้จากที่นี่ ไม่ query ซ้ำ) ◂
  const data: Awaited<ReturnType<typeof getDeal360>> | null = await getDeal360(ctx, actor, dealId).catch((e: unknown) => {
    if (e instanceof DealsError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!data) notFound();

  const [owners, lostReasons, pipelines, layout] = await Promise.all([ownerOptions(ctx, actor), lostReasonOptions(ctx, actor), pipelineOptions(ctx, actor), dealFieldLayout(ctx, actor)]);
  // CRM C2.4 ▸ ของที่โมดัลบันทึกการโทรต้องรู้ (อ่านล้ม/ไม่มีสิทธิ์ = ค่าปลอดภัย · หน้าไม่ล้ม) ◂
  const [callOutcomes, callAi] = await Promise.all([
    outcomeOptions(ctx, actor)
      .then((r) => r.CALL ?? [...(ACTIVITY_OUTCOMES_DEFAULT.CALL ?? [])])
      .catch(() => [...(ACTIVITY_OUTCOMES_DEFAULT.CALL ?? [])]),
    callAiStatus(ctx, actor).catch(() => ({ state: "OFF" as const, message: "" })),
  ]);
  const m = { role: auth.active.role as Role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> };
  const canEdit = crmCan(m, "crm.deal.update");
  const canManage = actor.role === "OWNER" || actor.role === "MANAGER";
  const d = data.deal;
  // CRM C1.9 ▸ มติผู้คุมงาน C1.9 ข้อ 2: `?tab=obj-<key>` = แท็บวัตถุกำหนดเอง (รู้จักแท็บนี้ ⇒ ภาพรวมไม่แสดงใต้แผงวัตถุ) ◂
  const tab: (typeof TABS)[number]["key"] | "object" = TABS.some((t) => t.key === sp.tab)
    ? (sp.tab as (typeof TABS)[number]["key"])
    : typeof sp.tab === "string" && sp.tab.startsWith("obj-")
      ? "object"
      : "overview";
  // ◂ CRM C1.9
  const base = `/app/sys/${id}/crm/deals`;
  const stage = data.stages.find((s) => s.current);
  const fieldLabels = Object.fromEntries(layout.map((x) => [x.key, x.label]));
  const kindBadge = d.kind === "WON" ? { t: "ชนะ", c: "var(--color-accent)" } : d.kind === "LOST" ? { t: "แพ้", c: "var(--color-danger)" } : null;

  const linesTable = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
          <th className="py-2 font-semibold">สินค้า/บริการ</th>
          <th className="hidden py-2 text-right font-semibold sm:table-cell">จำนวน</th>
          <th className="hidden py-2 text-right font-semibold sm:table-cell">ราคา/หน่วย</th>
          <th className="hidden py-2 text-right font-semibold sm:table-cell">ส่วนลด</th>
          <th className="py-2 text-right font-semibold">ยอดรวม</th>
        </tr>
      </thead>
      <tbody>
        {data.lines.map((l) => (
          <tr key={l.id} className="border-b last:border-0">
            <td className="py-2">
              {l.name}
              {l.priceChanged && (
                <span className="ml-1 rounded-md border px-1 text-[11px]" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }} title={`ราคาในคลังตอนนี้ ${formatBaht(l.currentPriceSatang)}`}>
                  ราคาเปลี่ยน
                </span>
              )}
              {(l.note || l.vatRateBp !== null) && (
                <span className="block text-xs text-[color:var(--color-muted)]">
                  {l.vatRateBp === null ? "" : l.vatRateBp === -1 ? "ยกเว้น VAT" : `VAT ${l.vatRateBp / 100}%`}
                  {l.vatRateBp !== null && l.note ? " · " : ""}
                  {l.note ?? ""}
                </span>
              )}
              <span className="block text-xs text-[color:var(--color-muted)] sm:hidden">
                {l.qty.toLocaleString("th-TH")} × {formatBaht(l.unitPriceSatang)}
                {l.discountBp ? ` · ลด ${l.discountBp / 100}%` : ""}
              </span>
            </td>
            <td className="hidden py-2 text-right sm:table-cell">{l.qty.toLocaleString("th-TH")}</td>
            <td className="hidden py-2 text-right sm:table-cell">{formatBaht(l.unitPriceSatang)}</td>
            <td className="hidden py-2 text-right sm:table-cell">{l.discountBp / 100}%</td>
            <td className="py-2 text-right">{formatBaht(l.amountSatang)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="deal-360">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`${base}?pipeline=${encodeURIComponent(d.pipelineId)}`} className="shrink-0 px-1 text-lg text-[color:var(--color-muted)]" aria-label="กลับไปกระดานดีล" data-testid="deal-back-link">
            ‹
          </Link>
          <h1 className="min-w-0 truncate text-lg font-semibold sm:text-xl">ดีล 360 — {d.title}</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* CRM C2.4 ▸ บันทึกการโทรของดีลนี้ (ผูกทั้งดีลและผู้ติดต่อหลัก) ◂ */}
          <CrmClickToCall
            systemId={id}
            target={{ dealId: d.id, contactId: data.contact.id, companyId: d.companyId }}
            outcomes={callOutcomes}
            maxRecordingBytes={CRM_RECORDING_MAX_BYTES}
            aiState={callAi.state}
            aiMessage={callAi.message}
          />
          {canEdit && <DealMenu systemId={id} dealId={d.id} pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))} currentPipelineId={d.pipelineId} canManage={canManage} deletable={d.kind !== "WON" && !d.quotationDocId && !d.invoiceDocId} />}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="card flex flex-col gap-4 p-4" data-testid="deal-360-header">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words text-lg font-semibold">{d.title}</span>
                  {kindBadge && (
                    <span className="rounded-md border px-1.5 py-0.5 text-xs font-semibold" style={{ color: kindBadge.c, borderColor: kindBadge.c }}>
                      {kindBadge.t}
                    </span>
                  )}
                  {d.stalledAt && (
                    <span className="rounded-md border px-1.5 py-0.5 text-xs font-semibold" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
                      นิ่ง
                    </span>
                  )}
                </div>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {data.company ? (
                    <Link href={`/app/sys/${id}/crm/companies/${data.company.id}`} className="font-medium underline" data-testid="deal-company-link">
                      {data.company.name}
                    </Link>
                  ) : (
                    "ไม่ผูกบริษัท"
                  )}
                  {" · ผู้ติดต่อหลัก "}
                  <Link href={`/app/sys/${id}/crm/contacts/${data.contact.id}`} className="font-medium underline" data-testid="deal-contact-link">
                    {data.contact.name}
                  </Link>
                  {` · pipeline ${data.pipeline.name}`}
                </span>
              </div>
              {canEdit && <DealDocButtons systemId={id} dealId={d.id} hasQuotation={!!d.quotationDocId} hasInvoice={!!d.invoiceDocId} />}
            </div>
            <DealStageStepper
              systemId={id}
              dealId={d.id}
              kind={d.kind}
              currentStageId={d.stageId}
              stages={data.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, probability: s.probability }))}
              lostReasons={lostReasons}
              fieldLabels={fieldLabels}
              canReopen={canManage}
              daysInStage={data.daysInStage}
            />
            <div className="grid gap-3 border-t pt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }} data-testid="deal-360-kpis">
              <div className="flex flex-col">
                <span className="text-xs text-[color:var(--color-muted)]">มูลค่าดีล</span>
                <span className="text-lg font-semibold">{formatBaht(d.valueSatang)}</span>
              </div>
              {/* CRM C2.7 ▸ เงินที่รับจริงของดีล (ใบแจ้งหนี้ที่ชำระ + บิลหน้าร้านที่ผูกไว้) — ยังไม่มีเงินเข้า = ไม่แสดงช่องนี้
                  ⇒ ดีลของร้านที่ยังไม่ใช้ทางเดินเงิน เห็นแถว KPI เดิมทุกช่อง ◂ */}
              {data.paidSatang > 0 && (
                <div className="flex flex-col">
                  <span className="text-xs text-[color:var(--color-muted)]">เงินที่รับแล้ว</span>
                  <span className="text-lg font-semibold">{formatBaht(data.paidSatang)}</span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs text-[color:var(--color-muted)]">วันปิดคาด</span>
                <span className="font-semibold">{formatThaiDay(d.expectedCloseAt)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-[color:var(--color-muted)]">ผู้ดูแล</span>
                <span className="font-semibold">{data.owner?.name ?? "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-[color:var(--color-muted)]">หมวด forecast</span>
                <span className="font-semibold">{FORECAST_CATEGORY_LABEL[d.forecastCategory]}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-[color:var(--color-muted)]">โอกาสปิด</span>
                <span className="font-semibold">{d.probabilityOverride ?? stage?.probability ?? 0}%</span>
              </div>
            </div>
            {d.kind === "LOST" && data.lostReason && (
              <p className="text-sm" data-testid="deal-lost-reason-view">
                แพ้เพราะ: <span className="font-medium">{data.lostReason.label}</span>
                {d.lostNote ? ` — ${d.lostNote}` : ""}
              </p>
            )}
          </section>

          <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px" aria-label="แท็บของดีล" data-testid="deal-360-tabs">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "overview" ? `${base}/${d.id}` : `${base}/${d.id}?tab=${t.key}`}
                className="whitespace-nowrap px-3 py-2 text-sm"
                style={tab === t.key ? { borderBottom: "2px solid var(--color-accent)", fontWeight: 700 } : { color: "var(--color-muted)" }}
                aria-current={tab === t.key ? "page" : undefined}
                data-testid={`deal-tab-${t.key}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          {/* CRM C1.9 ▸ แท็บวัตถุกำหนดเอง (วัตถุที่ผูกกับดีล · showAsTab) — `?tab=obj-<key>` เปิดรายการของดีลนี้ */}
          <CrmObjectTabs ctx={ctx} actor={actor} parentType="DEAL" parentId={d.id} selfHref={`${base}/${d.id}`} tab={sp.tab} />
          {/* ◂ CRM C1.9 */}

          {tab === "overview" && (
            <>
              {/* CRM C2.7 ▸ เอกสารบัญชีของดีลถูกยกเลิก — เตือนก่อนใคร เพราะยอด "เงินที่รับ" ของดีลถูกถอนคืนไปแล้ว ◂ */}
              {data.documentVoided && (
                <p className="rounded-xl border p-2.5 text-xs" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
                  เอกสารบัญชีของดีลนี้ถูกยกเลิก — ตรวจยอดเงินที่รับอีกครั้ง แล้วออกเอกสารใหม่ถ้ายังต้องเก็บเงิน
                </p>
              )}
              <section className="card flex flex-col gap-2 p-4" data-testid="deal-360-lines">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">รายการสินค้า</h2>
                  {data.quotationDiffers && (
                    <span className="rounded-md border px-1.5 text-xs font-semibold" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }} data-testid="deal-quote-differs">
                      ต่างจากใบเสนอราคา
                    </span>
                  )}
                </div>
                {data.lines.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการ — เพิ่มได้ที่แท็บรายการสินค้า</p> : linesTable}
                {data.lines.length > 0 && (
                  <p className="text-right text-sm">
                    ยอดรวม {formatBaht(data.subtotalSatang)}
                    {data.discountSatang > 0 ? ` · ส่วนลด ${formatBaht(data.discountSatang)}` : ""} · <span className="font-semibold">มูลค่าดีล (ก่อน VAT) {formatBaht(d.valueSatang)}</span>
                  </p>
                )}
              </section>
              {canEdit && (
                <section className="card flex flex-col gap-3 p-4" data-testid="deal-360-fields">
                  <h2 className="font-semibold">ข้อมูลดีล</h2>
                  <DealFieldsEditor
                    systemId={id}
                    dealId={d.id}
                    title={d.title}
                    valueSatang={d.valueSatang}
                    hasLines={data.lines.length > 0}
                    open={d.kind === "OPEN"}
                    expectedCloseAt={d.expectedCloseAt}
                    ownerUserId={d.ownerUserId}
                    owners={owners}
                    forecastCategory={d.forecastCategory}
                    nextStep={d.nextStep}
                  />
                </section>
              )}
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="card flex flex-col gap-2 p-4" data-testid="deal-360-history">
                  <h2 className="font-semibold">ประวัติขั้น</h2>
                  <HistoryTable rows={data.history.slice(0, 8)} />
                </section>
                <section className="card flex flex-col gap-1 p-4" data-testid="deal-360-timeline">
                  <h2 className="font-semibold">ไทม์ไลน์</h2>
                  <ul className="flex flex-col divide-y text-sm">
                    {data.timeline.slice(0, 12).map((t, i) => (
                      <li key={`${t.at}-${i}`} className="flex flex-col py-2">
                        <span className="break-words">{t.title}</span>
                        <span className="text-xs text-[color:var(--color-muted)]">
                          {formatThaiDay(t.at.slice(0, 10))}
                          {t.detail ? ` · ${t.detail}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </>
          )}

          {tab === "lines" && (
            <section className="card flex flex-col gap-3 p-4" data-testid="deal-360-lines-edit">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">รายการสินค้า</h2>
                {data.quotationDiffers && (
                  <span className="rounded-md border px-1.5 text-xs font-semibold" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
                    ต่างจากใบเสนอราคา
                  </span>
                )}
              </div>
              <DealLinesEditor systemId={id} dealId={d.id} lines={data.lines} discountBp={d.discountBp} editable={canEdit && d.kind === "OPEN"} pendingApproval={d.hasPendingLines} />
            </section>
          )}

          {tab === "activities" && (
            <section className="card flex flex-col gap-1 p-4" data-testid="deal-360-activities">
              <h2 className="font-semibold">กิจกรรม</h2>
              {data.timeline.filter((t) => t.kind === "ACTIVITY").length === 0 ? (
                <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีกิจกรรมของดีลนี้</p>
              ) : (
                <ul className="flex flex-col divide-y text-sm">
                  {data.timeline
                    .filter((t) => t.kind === "ACTIVITY")
                    .map((t, i) => (
                      <li key={`${t.at}-${i}`} className="flex items-center justify-between gap-2 py-2">
                        <span className="min-w-0 break-words">{t.title}</span>
                        <span className="shrink-0 text-xs text-[color:var(--color-muted)]">{t.detail ?? formatThaiDay(t.at.slice(0, 10))}</span>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )}

          {/* CRM C1.6 ▸ กิจกรรมและโน้ต (แท็บกิจกรรม) + การ์ดบอร์ดงานของดีล */}
          {tab === "activities" && <CrmActivityBlock ctx={ctx} actor={actor} target={{ dealId: d.id }} recordings="deal" />}
          {tab === "activities" && <CrmDealCardsBlock cards={data.kanbanCards} />}
          {/* ◂ CRM C1.6 */}

          {tab === "docs" && (
            <section className="card flex flex-col gap-2 p-4" data-testid="deal-360-docs">
              <h2 className="font-semibold">เอกสารบัญชี</h2>
              {data.docs.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีเอกสาร — ออกใบเสนอราคาจากปุ่มด้านบน</p> : <DocList docs={data.docs} />}
            </section>
          )}

          {tab === "history" && (
            <section className="card flex flex-col gap-2 p-4" data-testid="deal-360-history-full">
              <h2 className="font-semibold">ประวัติขั้นทั้งหมด</h2>
              <HistoryTable rows={data.history} />
            </section>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[300px]" data-testid="deal-360-rail">
          {/* CRM C1.6 ▸ ไฟล์แนบ */}
          <CrmFilesBlock ctx={ctx} actor={actor} entityType="DEAL" entityId={d.id} />
          {/* ◂ CRM C1.6 */}
          <section className="card flex flex-col gap-2 p-4" data-testid="deal-360-people">
            <h2 className="font-semibold">ผู้ติดต่อและผู้ร่วมดูแล</h2>
            <p className="text-sm">
              {data.contact.name} <span className="text-xs text-[color:var(--color-muted)]">· ผู้ติดต่อหลัก</span>
            </p>
            {data.collaborators.length === 0 ? (
              <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีผู้ร่วมดูแล</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.collaborators.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            )}
          </section>
          <section className="card flex flex-col gap-2 p-4" data-testid="deal-360-docs-rail">
            <h2 className="font-semibold">เอกสารบัญชี</h2>
            {data.docs.length === 0 ? <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีเอกสาร</p> : <DocList docs={data.docs} />}
          </section>
          {d.tags.length > 0 && (
            <section className="card flex flex-wrap gap-1 p-4 text-xs" data-testid="deal-360-tags">
              {d.tags.map((t) => (
                <span key={t} className="rounded-full border px-2 py-0.5">
                  {t}
                </span>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function HistoryTable({ rows }: { rows: DealHistoryRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีประวัติ</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
          <th className="py-2 font-semibold">จาก → ไป</th>
          <th className="hidden py-2 font-semibold sm:table-cell">ใคร</th>
          <th className="py-2 text-right font-semibold">อยู่กี่วัน</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.id} className="border-b last:border-0">
            <td className="py-2">{h.fromStageName ? `${h.fromStageName} → ${h.toStageName}` : `สร้างดีล → ${h.toStageName}`}</td>
            <td className="hidden py-2 text-[color:var(--color-muted)] sm:table-cell">{h.byName ?? "—"}</td>
            <td className="py-2 text-right">{durationText(h)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DocList({ docs }: { docs: Deal360["docs"] }) {
  return (
    <ul className="flex flex-col divide-y text-sm">
      {docs.map((doc) => (
        <li key={doc.id} className="flex flex-col py-2">
          <span className="font-medium">
            {DOC_LABEL[doc.docType] ?? "เอกสาร"} {doc.docNo ?? "(ร่าง)"}
          </span>
          <span className="text-xs text-[color:var(--color-muted)]">
            {formatBaht(doc.grandTotal)}
            {doc.paidTotal > 0 ? ` · รับแล้ว ${formatBaht(doc.paidTotal)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
