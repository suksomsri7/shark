// home.tsx — หน้าแรกของระบบ CRM เมื่อเปิด CRM ใหม่แล้ว (uiVersion 2) · ใบ C1.11 (RESOLUTIONS R-A "หน้าแรก v2 ขั้นต่ำ" · ภาพ 13(ก))
//
// ฝังใน `/app/sys/[id]` (หน้า "ระบบ" รวม) แทน CrmHub เมื่อ `settings.crm.uiVersion = 2` — uiVersion 1 ยังเป็น CrmHub เดิมทุกตัวอักษร
// ไฟล์นี้ = ตัวโหลดข้อมูล (ฝั่งโมดูล) · หน้าตาอยู่ที่ `src/components/crm/home/CrmHomeView.tsx` (แสดงผลล้วน · testid ครบ)
// เนื้อหา: เมนู CRM (แถบแท็บจากทะเบียน nav.ts) · ตัวเลือกเทมเพลตกิจการ (ครั้งแรก · เฉพาะคนที่ตั้งค่า CRM ได้) · "ดีลของฉัน" ·
//   "งานของฉันวันนี้" · **"ดีลที่ต้องดู"** (ใบ C2.10 · ภาพ 01)
// 🔴 หน้า GET ไม่เขียนอะไร (ไม่สร้าง pipeline ค่าเริ่มต้น — ต่างจาก CrmHub v1) · ทุกแถวผ่านการมองเห็น (brief.ts#homeFor)
//
// CRM C2.10 ▸ บล็อก "ดีลที่ต้องดู" ของภาพ 01 ถูกวาด **ที่นี่** แล้วส่งเข้า `CrmHomeView` เป็นช่อง (slot) ข้าง
//   "งานของฉันวันนี้" (ภาพ 01 วางสองการ์ดคู่กัน) — ที่นี่เพราะ `data-testid` ของบล็อกนี้ต้องเป็นสตริงตรง ๆ ที่อ่านได้
//   จากไฟล์เดียวกับที่โหลดข้อมูล (ทะเบียนปุ่ม `scripts/crm-ui-inventory.json` + ด่าน F14.1/F14.2 อ่านค่าจากโค้ด
//   ไม่ใช่จาก props ที่วิ่งข้ามไฟล์) · ไม่มีชื่อ/เบอร์/อีเมลของลูกค้าในบล็อกนี้ — ชื่อดีล · ชื่อบริษัท · มูลค่า · จำนวนวันที่นิ่ง
import Link from "next/link";
import type { ReactNode } from "react";
import type { MemberActor } from "@/lib/modules/member";
import { requireTenant } from "@/lib/core/context";
import { toMemberActor } from "@/lib/modules/member";
import { CrmHomeView } from "@/components/crm/home/CrmHomeView";
import { prisma } from "./db";
import { crmCan } from "./access";
import { homeFor } from "./brief";
import { crmNavItems } from "./nav";
import { crmBusinessTemplateOf, crmStaleDaysDefaultOf } from "./settings";
import { CRM_STALE_DAYS_DEFAULT } from "./notifications-shared";
import { applyBusinessTemplateAction, skipBusinessTemplateAction } from "./templates-actions";
// CRM C3.2 ▸ หน้าแรกเต็มของภาพ 01 — KPI 6 · ตัวกรอง/มุมมองที่บันทึก · leaderboard · ผู้ช่วย AI (ปุ่ม) · ที่มา lead · "ไม่มีเจ้าของ" ◂
import { HomeKpis } from "@/components/crm/home/HomeKpis";
import { HomeFilters, type HomeFilterOption } from "@/components/crm/home/HomeFilters";
import { HomeLeaderboard } from "@/components/crm/home/HomeLeaderboard";
import { HomeAside } from "@/components/crm/home/HomeAside";
// CRM C3.4 ▸ ผู้ช่วย AI ของหน้าแรก (ดีลเสี่ยงเดือนนี้) ◂
import { CrmAiHomeAtRisk } from "@/components/crm/ai/CrmAiHomeAtRisk";
import { AT_RISK_REASON_LABEL } from "./ai-bridges-shared";
import { HomeUnowned } from "@/components/crm/home/HomeUnowned";
import { homeData, unowned as homeUnowned, type HomeData } from "./home-data";
import { reportScopeOf } from "./quotas";
import { LEAD_SOURCE_LABEL, QuotaError, isPeriodKey, periodKeyOf, periodKindOf, periodLabel, prevPeriodKey } from "./quotas-shared";
import { listViews } from "./views";
import { ownerOptions, pipelineOptions } from "./deals";
import { bulkReassignAction } from "./deals-actions";

const baht = (satang: number) => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;

// CRM C2.10 ▸ (รอบแก้ ข้อ 9 — PARITY ภาพ 01 บรรทัด 77–85) ป้าย "นิ่ง N วัน" มี **3 สถานะ** เหมือน `.due late|soon`
//   ของแบบ: แดง = นิ่ง ≥ 2× เกณฑ์ของขั้น (ปล่อยไว้นานเป็นสองเท่า = เลือดไหล) · เหลือง = เกินเกณฑ์แต่ยังไม่ถึง 2× ·
//   เทา = ยังไม่ถึงเกณฑ์ (เกิดได้เมื่อขั้นถูกแก้เกณฑ์ให้นานขึ้นหลังปัก `stalledAt`) · ใช้โทเคนสีเดียวกับป้ายกำหนดส่ง
//   ของบอร์ดงาน (`--color-tag-*` / `--color-due-*-bg`) — ห้ามพิมพ์ hex ในคอมโพเนนต์ ◂
const STALE_TONE = {
  red: { color: "var(--color-tag-red)", borderColor: "var(--color-tag-red)", background: "var(--color-due-late-bg)" },
  amber: { color: "var(--color-tag-amber)", borderColor: "var(--color-tag-amber)", background: "var(--color-due-soon-bg)" },
  gray: { color: "var(--color-muted)", borderColor: "var(--color-line)", background: "var(--color-surface)" },
} as const;

/** โทนของป้ายตามจำนวนวันที่นิ่งเทียบเกณฑ์ของขั้นนั้น */
function staleTone(stalledDays: number, threshold: number): keyof typeof STALE_TONE {
  if (stalledDays >= threshold * 2) return "red";
  if (stalledDays >= threshold) return "amber";
  return "gray";
}

/** ไอคอน ⚠ ของหัวการ์ด (ภาพ 01 `#i-warn`) — inline เพราะโมดูล CRM ยังไม่มีชุดไอคอนของตัวเอง */
function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 2.5 20h19Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

const dueLabel = (iso: string | null, overdue: boolean) => {
  if (!iso) return "";
  const t = new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
  return overdue ? `เลยกำหนด · ${t}` : t;
};

// CRM C3.2 ▸ ค่าจาก URL (`?pipeline=&owner=&period=`) — สตริงล้วน · บริการตรวจเอง (งวดที่ใช้ไม่ได้ = กลับไปเดือนนี้ ไม่ใช่หน้าพัง) ◂
type HomeUrlFilters = { pipeline?: string | string[]; owner?: string | string[]; period?: string | string[] };
const firstOf = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 64) : Array.isArray(v) && typeof v[0] === "string" ? v[0].trim().slice(0, 64) : "");

export async function CrmHomeV2({ systemId, filters }: { systemId: string; filters?: HomeUrlFilters }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true, settings: true } });
  if (!sys) return null;
  const data = await homeFor({ tenantId, systemId, actorUserId: auth.user.id }, actor);
  const report = await loadReport(systemId, tenantId, auth.user.id, actor, filters ?? {});
  const canPick = !crmBusinessTemplateOf(sys.settings) && crmCan(actor, "crm.settings.manage");
  // N-9: ข้อมูลเทมเพลต 16 ชุดโหลดเฉพาะตอนต้องแสดงตัวเลือก (ข้อมูลล้วน — ไม่ลากตัว apply/บริการวัตถุ)
  const templates = canPick ? (await import("./templates/business")).BUSINESS_TEMPLATE_LIST.map((t) => ({ key: t.key, label: t.label, description: t.description })) : [];
  // CRM C2.10 ▸ เกณฑ์ปริยายของร้าน (`settings.crm.staleDaysDefault` · ปริยาย 14) — ใช้เมื่อขั้นนั้นไม่ได้ตั้งเกณฑ์เอง ◂
  const staleDefault = crmStaleDaysDefaultOf(sys.settings, CRM_STALE_DAYS_DEFAULT);
  return (
    <CrmHomeView
      systemId={systemId}
      navItems={crmNavItems(systemId, (k) => crmCan(actor, k))}
      picker={canPick ? { templates, apply: applyBusinessTemplateAction, skip: skipBusinessTemplateAction } : null}
      deals={data.deals.map((d) => ({
        id: d.id,
        title: d.title,
        valueSatang: d.valueSatang,
        stageId: d.stageId,
        stageName: d.stageName,
        companyName: d.companyName,
        staleLabel: d.stalledDays !== null ? `นิ่ง ${d.stalledDays} วัน` : null,
      }))}
      stages={data.stages}
      tasks={data.tasks.map((t) => ({ id: t.id, title: t.title, dueLabel: dueLabel(t.dueAt, t.overdue), overdue: t.overdue }))}
      actions={report.actions}
      kpis={report.kpis}
      filters={report.filters}
      leaderboard={report.leaderboard}
      unowned={report.unowned}
      aside={report.aside}
      stale={
        <section className="card flex min-w-0 flex-col gap-3 p-4">
          {/* ภาพ 01: หัวการ์ด = ⚠ + "ดีลที่ต้องดู" + คำขยาย "นิ่งเกินกำหนด" · ท้ายหัว = ลิงก์ไปรายการดีลที่กรองเฉพาะดีลนิ่ง (ตัวกรอง stale=1 ของ C1.5) */}
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <WarnIcon />
              <span className="truncate">ดีลที่ต้องดู</span>
              <span className="shrink-0 text-xs font-normal text-[color:var(--color-muted)]">นิ่งเกินกำหนด</span>
            </h2>
            <Link
              href={`/app/sys/${systemId}/crm/deals?stale=1`}
              className="shrink-0 text-sm text-[color:var(--color-accent)]"
              data-testid="crm-home-stale-all"
            >
              ดูทั้งหมด →
            </Link>
          </div>
          {data.stale.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]" data-testid="crm-home-stale-list">
              ยังไม่มีดีลที่นิ่งเกินกำหนด — ดีมาก ทีมตามงานทันทุกใบ
            </p>
          ) : (
            <ul className="flex min-w-0 flex-col divide-y" data-testid="crm-home-stale-list">
              {data.stale.map((d) => (
                <li key={d.id} className="flex min-w-0 items-center gap-3 py-2">
                  <span
                    className="shrink-0 rounded-lg border px-2 py-0.5 text-xs tabular-nums"
                    style={STALE_TONE[staleTone(d.stalledDays, d.stageStaleDays ?? staleDefault)]}
                  >
                    นิ่ง {d.stalledDays} วัน
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/app/sys/${systemId}/crm/deals/${d.id}`}
                      className="block truncate text-sm"
                      data-testid={`crm-home-stale-row-${d.id}`}
                    >
                      {d.title}
                    </Link>
                    {/* ภาพ 01 บรรทัดรอง = "บริษัท · ฿มูลค่า" (ไม่มีชื่อขั้น — ขั้นอยู่บนบอร์ด ไม่ใช่บนการ์ดสรุป) */}
                    <span className="block truncate text-xs text-[color:var(--color-muted)]">
                      {[d.companyName, baht(d.valueSatang)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {/* ภาพ 01: ปุ่ม "ดู" ท้ายแถว (ปุ่มโปร่ง เล็ก) — ทางเข้าเดียวกับชื่อดีล ให้นิ้วมีเป้าที่ใหญ่พอบนมือถือ */}
                  <Link
                    href={`/app/sys/${systemId}/crm/deals/${d.id}`}
                    className="shrink-0 rounded-lg border px-2 py-1 text-xs"
                    data-testid={`crm-home-stale-row-view-${d.id}`}
                  >
                    ดู
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      }
    />
  );
}

// ═════════════════════════ CRM C3.2 ▸ ส่วนรายงานของหน้าแรก (ภาพ 01) ═════════════════════════
// 🔴 ตัวเลขทุกตัวมาจาก `homeData` (home-data.ts) ด้วย actor ของ session — ไฟล์นี้ **ไม่คิดตัวเลขเอง** แค่จัดรูป/ลิงก์
// 🔴 ไม่มีคีย์ crm.report.view = ไม่แสดงส่วนรายงานเลย (ส่วนเดิมของ C1.11/C2.10 ยังอยู่ครบ) — ไม่ใช่หน้าพัง
// 🔴 ลิงก์ของ KPI/แถว พาไปหน้ารายการที่มีอยู่จริงพร้อมตัวกรองเดียวกัน (pipeline/owner) — ไม่มีลิงก์ตาย

type ReportSlots = {
  actions: ReactNode;
  kpis: ReactNode;
  filters: ReactNode;
  leaderboard: ReactNode;
  unowned: ReactNode;
  aside: ReactNode;
};

const EMPTY_SLOTS: ReportSlots = { actions: null, kpis: null, filters: null, leaderboard: null, unowned: null, aside: null };

/** รีวิวรอบ 2 SF-4: ป้ายของฐาน % โควตา (ตรงกับ progress()/การแจ้งเตือน) */
const basisLabel = (b: "PAID" | "WON") => (b === "PAID" ? "ตามยอดรับชำระ" : "ตามยอดชนะ");

async function loadReport(systemId: string, tenantId: string, userId: string, actor: MemberActor, url: HomeUrlFilters): Promise<ReportSlots> {
  const base = `/app/sys/${systemId}`;
  const ctx = { tenantId, systemId, actorUserId: userId };
  const actions = (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {crmCan(actor, "crm.contact.import") && (
        <Link href={`${base}/crm/contacts/import`} className="btn-sm" data-testid="crm-home-import">
          นำเข้า lead
        </Link>
      )}
      {crmCan(actor, "crm.deal.create") && (
        <Link href={`${base}/crm/deals/new`} className="btn btn-primary" data-testid="crm-home-new-deal">
          + เพิ่มดีล
        </Link>
      )}
    </div>
  );
  if (!crmCan(actor, "crm.report.view")) {
    // รีวิว N10: บล็อก "ไม่มีเจ้าของ" ขึ้นกับคีย์ crm.deal.reassign เท่านั้น (ไม่ต้องมีคีย์รายงาน)
    if (!crmCan(actor, "crm.deal.reassign")) return { ...EMPTY_SLOTS, actions };
    const u = await homeUnowned(ctx, actor).catch((e: unknown) => {
      if (e instanceof QuotaError) return null;
      throw e;
    });
    if (!u) return { ...EMPTY_SLOTS, actions };
    const owners = await ownerOptions(ctx, actor).catch(() => []);
    return {
      ...EMPTY_SLOTS,
      actions,
      unowned: <HomeUnowned systemId={systemId} deals={u.deals} contacts={u.contacts} moreDeals={u.moreDeals} moreContacts={u.moreContacts} owners={owners} transfer={bulkReassignAction} />,
    };
  }
  const now = new Date();
  const monthKey = periodKeyOf(now, "MONTH");
  const pipelineId = firstOf(url.pipeline);
  const ownerUserId = firstOf(url.owner);
  const periodRaw = firstOf(url.period);
  const periodKey = isPeriodKey(periodRaw) ? periodRaw : monthKey;
  let hd: HomeData;
  try {
    hd = await homeData(ctx, actor, { pipelineId: pipelineId || null, ownerUserId: ownerUserId || null, periodKey, now });
  } catch (e) {
    // ด่านของบริการ (คีย์/ระบบ) ปฏิเสธ = ไม่แสดงส่วนรายงาน (ส่วนอื่นของหน้ายังใช้ได้) · ข้อผิดพลาดอื่นให้ขอบเขต error ของหน้าจัดการ
    if (e instanceof QuotaError) return { ...EMPTY_SLOTS, actions };
    throw e;
  }
  const [pipes, scope, dealViews] = await Promise.all([
    crmCan(actor, "crm.deal.read") ? pipelineOptions(ctx, actor).catch(() => []) : Promise.resolve([]),
    reportScopeOf(ctx, actor),
    crmCan(actor, "crm.deal.read") ? listViews(ctx, actor, "deal").catch(() => []) : Promise.resolve([]),
  ]);
  const allOwners = scope.level === "OWN" && !hd.unowned ? [] : await ownerOptions(ctx, actor).catch(() => []);
  const ownerOpts: HomeFilterOption[] = scope.level === "OWN" ? [] : scope.level === "TEAM" ? allOwners.filter((o) => scope.mates.includes(o.id)).map((o) => ({ value: o.id, label: o.name })) : allOwners.map((o) => ({ value: o.id, label: o.name }));
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (pipelineId) u.set("pipeline", pipelineId);
    if (ownerUserId) u.set("owner", ownerUserId);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    const q = u.toString();
    return q ? `?${q}` : "";
  };
  const deals = `${base}/crm/deals`;
  const kind = periodKindOf(periodKey);
  const prev = prevPeriodKey(monthKey);
  const periods: HomeFilterOption[] = [
    { value: monthKey, label: "เดือนนี้" },
    ...(prev ? [{ value: prev, label: `เดือนก่อน (${periodLabel(prev)})` }] : []),
    { value: periodKeyOf(now, "QUARTER"), label: `ไตรมาสนี้ (${periodLabel(periodKeyOf(now, "QUARTER"))})` },
    { value: periodKeyOf(now, "YEAR"), label: `ปีนี้ (${periodLabel(periodKeyOf(now, "YEAR"))})` },
  ];
  if (!periods.some((p) => p.value === periodKey)) periods.push({ value: periodKey, label: periodLabel(periodKey) });
  const k = hd.kpis;
  const periodWord = periodKey === monthKey ? "เดือนนี้" : ` ${periodLabel(periodKey)}`;
  const prevWord = kind === "QUARTER" ? "ไตรมาสก่อน" : kind === "YEAR" ? "ปีก่อน" : "เดือนก่อน";
  const kpis = (
    <HomeKpis
      k={{
        openCount: k.openPipeline.count,
        openSatang: k.openPipeline.valueSatang,
        weightedSatang: k.weighted.valueSatang,
        wonCount: k.won.count,
        wonSatang: k.won.valueSatang,
        targetSatang: k.won.targetSatang,
        wonPct: k.won.pct,
        basisLabel: basisLabel(k.won.basis),
        achievedSatang: k.won.achievedSatang,
        winPct: k.winRate.pct,
        winDeltaPts: k.winRate.deltaPts,
        closedCount: k.winRate.won + k.winRate.lost,
        staleCount: k.stale.count,
        staleSatang: k.stale.valueSatang,
        hotCount: k.hotLeads.count,
        hotThreshold: k.hotLeads.threshold,
        periodWord,
        prevWord,
      }}
      links={{
        open: `${deals}${qs({})}`,
        weighted: `${deals}${qs({ view: "forecast" })}`,
        won: `${deals}${qs({ view: "table" })}`,
        winrate: `${deals}${qs({ view: "table" })}`,
        stale: `${deals}${qs({ stale: "1" })}`,
        // รีวิว N9: ชุดเดียวกับที่นับ — คะแนน ≥ เกณฑ์ร้อน (ไม่ใช่ scoreBand) · ผู้ดูแล = ตัวกรอง หรือ "ของฉัน" เมื่อระดับรายงาน OWN
        hot: `${base}/crm/contacts?minScore=${k.hotLeads.threshold}${ownerUserId ? `&owner=${encodeURIComponent(ownerUserId)}` : scope.level === "OWN" && scope.me ? `&owner=${encodeURIComponent(scope.me)}` : ""}`,
      }}
    />
  );
  const filters = (
    <HomeFilters
      homeHref={base}
      dealsHref={deals}
      pipelines={pipes.map((p) => ({ value: p.id, label: p.name }))}
      owners={ownerOpts}
      periods={periods}
      current={{ pipeline: pipelineId, owner: ownerUserId, period: periodKey === monthKey ? monthKey : periodKey }}
      savedViews={dealViews.map((v) => {
        const pid = typeof v.filters.pipelineId === "string" ? v.filters.pipelineId : "";
        return { id: v.id, name: v.name, href: `${deals}?view=table&saved=${encodeURIComponent(v.id)}${pid ? `&pipeline=${encodeURIComponent(pid)}` : ""}` };
      })}
    />
  );
  const leaderboard = (
    <HomeLeaderboard
      basisLabel={basisLabel(hd.leaderboard.basis)}
      periodLabel={periodKey === monthKey ? `เดือน ${periodLabel(periodKey)}` : periodLabel(periodKey)}
      rows={hd.leaderboard.rows.map((r) => ({ ...r, href: `${deals}?view=table&owner=${encodeURIComponent(r.userId)}${pipelineId ? `&pipeline=${encodeURIComponent(pipelineId)}` : ""}` }))}
    />
  );
  const unowned = hd.unowned ? (
    <HomeUnowned
      systemId={systemId}
      deals={hd.unowned.deals}
      contacts={hd.unowned.contacts}
      moreDeals={hd.unowned.moreDeals}
      moreContacts={hd.unowned.moreContacts}
      owners={allOwners}
      transfer={bulkReassignAction}
    />
  ) : null;
  const aside = (
    <HomeAside
      ai={{ staleCount: k.stale.count, hotCount: k.hotLeads.count, hotThreshold: k.hotLeads.threshold }}
      // CRM C3.4 ▸ "ดีลไหนเสี่ยงเดือนนี้" ต่อสายแล้ว — ตาราง + ข้อเสนอสร้างงานติดตาม (ภาพ 14 ซ้าย · client เรียก `_actions/ai.ts`) ◂
      atRisk={<CrmAiHomeAtRisk systemId={systemId} reasonLabels={AT_RISK_REASON_LABEL} />}
      sourcesTitle={periodKey === monthKey ? "ที่มา lead เดือนนี้" : `ที่มา lead ${periodLabel(periodKey)}`}
      sources={hd.leadSources.items.map((s) => ({ key: s.sourceKind, label: LEAD_SOURCE_LABEL[s.sourceKind] ?? s.sourceKind, count: s.count, href: `${base}/crm/contacts?source=${encodeURIComponent(s.sourceKind)}` }))}
      stale={k.stale.count > 0 ? { count: k.stale.count, satang: k.stale.valueSatang, href: `${deals}${qs({ stale: "1" })}` } : null}
    />
  );
  return { actions, kpis, filters, leaderboard, unowned, aside };
}
// ◂ CRM C3.2
