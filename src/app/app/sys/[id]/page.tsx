import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { closeDaySummary } from "@/lib/modules/pos/service";
// POS P1.17 U ▸ การ์ดยอดวันนี้ (ตัวเลขจาก reports.ts · สิทธิ์การ์ด = pos.sale.create เท่าเดิม) + ลิงก์รายงาน ◂
import { posDashboardCard, REPORT_PERMISSION, type DashboardCard } from "@/lib/modules/pos/reports";
import { posUnits } from "@/lib/modules/pos/register";
import { CouponHub } from "@/lib/modules/coupon/ui";
import { MeetingHub } from "@/lib/modules/meeting/ui";
import { KanbanHub } from "@/lib/modules/kanban/ui";
import { ChatInboxSection } from "@/lib/modules/chat/ui";
import { canReadChat } from "@/lib/modules/chat/guard";
import { CrmHub } from "@/lib/modules/crm/ui";
// CRM C1.11 ▸ หน้าแรก CRM ใหม่ (uiVersion 2) — uiVersion 1 ยังเป็น CrmHub เดิม ◂
import { CrmHomeV2, parseCrmSettings } from "@/lib/modules/crm/ui";
import { InvHub } from "@/lib/modules/inventory/ui";
import { HrHub } from "@/lib/modules/hr/ui";
import { MarketingHub } from "@/lib/modules/marketing/ui";
import { MemberHub } from "@/lib/modules/member/ui";
import { PointHub } from "@/lib/modules/point/ui";
import { RewardHub } from "@/lib/modules/reward/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatBaht } from "@/lib/ui/money";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership, posSalesScope, posSaleWhere, posScopeUnitIds, type PosUnitScope } from "@/lib/modules/pos/access";
import { POS_SALE_STATUS_LABEL } from "@/lib/ui/status-labels";
import { ModuleTabs } from "@/components/module-tabs";

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

// หน้า "ระบบ" ประเภท feature (สมาชิก/แต้ม/POS/รางวัล) — เนื้อหา + การเชื่อมต่อ
// 🔴 ระบบ CHAT: หน้านี้ = **กล่องแชทเต็มจอ** แล้ว (คำสั่งข้อ 1 ของเจ้าของ · เดิมเป็นการ์ด 2 ใบ)
//    เลือกห้องด้วย `?c=` · `?err=` มาจาก server action ของแชทที่ redirect กลับมา
export default async function SystemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // CRM C3.2 ▸ ตัวกรองของหน้าแรก CRM v2 (ภาพ 01): pipeline · owner · period — ส่งต่อให้ CrmHomeV2 (อ่านเป็นสตริงเท่านั้น · บริการตรวจเอง) ◂
  searchParams: Promise<{ c?: string; err?: string; pipeline?: string | string[]; owner?: string | string[]; period?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { c, err } = sp;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys) notFound();
  // WO 0.4: ระบบบัญชีมี hub ของตัวเองแล้ว (`/app/sys/<id>/account` — เดิม 404 เพราะไม่มี page.tsx
  // ledger/wo-notes/0.1.md ข้อ 8) → กันไม่ให้มีหน้า hub 2 ที่ (ที่นี่ vs ในโมดูล) เหลือที่เดียว
  if (sys.type === "ACCOUNT") redirect(`/app/sys/${id}/account`);
  const def = systemDef(sys.type);
  const isChat = sys.type === "CHAT";
  // 🔴 iPad ในแอป (เจ้าของเจอ 6 ก.ย. build #24): จอกว้าง 1366 แต่กล่องแชทถูก max-w-6xl (1152) ตัด + ความสูงเผื่อปุ่ม AI ที่แอปไม่มี
  //    ⇒ เปิดจากแอป (UA "SharkApp") ไม่จำกัดความกว้าง (ฝั่งความสูงดูที่ AppMain + inbox-client `lgHeight`)
  const inApp = ((await headers()).get("user-agent") ?? "").includes("SharkApp");
  // ซ่อนกล่องแชทให้คนที่ไม่มีสิทธิ์อ่าน แล้วบอกตรง ๆ ว่าต้องทำอะไรต่อ
  // (ด่านจริงยังอยู่ที่ `requireChatRead()` ใน ChatInboxSection — ตรงนี้แค่ทำให้ข้อความเป็นภาษาคน)
  const mayReadChat = isChat && canReadChat(auth);
  // HF-POS-PAGES: ยอด/บิลของ POS เฉพาะคนที่ขายได้ และเฉพาะสาขาที่เข้าได้ (เดิมสมาชิกทุกคนเห็นทุกสาขา) · null = ไม่แสดงส่วนยอดขาย
  const posScope = sys.type === "POS" ? posSalesScope(posMembership(auth.active)) : null;

  // เชื่อมระบบย้ายไปจัดการรวมที่ /app/settings/connections แล้ว
  // สาขาเดียว = ซ่อนทั้งหมด (createSystemAutoLink เชื่อมให้แล้ว) · หลายสาขา = โชว์ลิงก์เล็ก ๆ
  const unitCount = await prisma.businessUnit.count({
    where: { tenantId, status: { not: "ARCHIVED" } },
  });

  return (
    // 🔴 WO-CV12: ระบบแชท = "แบบตัด" — ไม่มีชื่อหน้า/คำอธิบาย/แท็บ ทั้งมือถือและเดสก์ท็อป
    //    ⇒ ไม่มีอะไรมาคั่นเหนือกล่องแชท จึงไม่ต้องมี gap ของ stack ด้วย (ระบบอื่นคงเดิม)
    // CRM C3.2 ▸ หน้าแรก CRM v2 = แดชบอร์ดของภาพ 01 (KPI 6 ช่อง + แถบขวา) ⇒ กว้างถึง max-w-7xl · ระบบอื่น/CRM v1 คงความกว้างเดิม ◂
    <div className={`flex flex-col ${isChat ? (inApp ? "max-w-none gap-0" : "max-w-6xl gap-0") : sys.type === "CRM" && parseCrmSettings(sys.settings).uiVersion === 2 ? "max-w-7xl gap-6" : "max-w-2xl gap-6"}`}>
      {!isChat && (
        <PageHeader
          title={`${def?.icon ?? ""} ${sys.name}`.trim()}
          desc={`ระบบ${def?.label ?? ""}`}
        />
      )}

      {/* ลิงก์นี้ของสาขา CHAT ไม่ได้หายไป — ย้ายเข้าเมนู ⋮ ของหัวรายการแชท (ส่งผ่าน prop ข้างล่าง) */}
      {!isChat && unitCount > 1 && (
        <Link
          href="/app/settings/connections"
          className="text-sm text-[color:var(--color-accent)]"
        >
          จัดการการเชื่อมระบบ →
        </Link>
      )}

      {/* เนื้อหาตามประเภท */}
      {sys.type === "MEMBER" && <MemberHub systemId={id} />}
      {sys.type === "POINT" && <PointHub systemId={id} />}
      {sys.type === "POS" && posScope && <PosContent systemId={id} tenantId={tenantId} scope={posScope} />}
      {sys.type === "REWARD" && <RewardHub systemId={id} tenantId={tenantId} />}
      {sys.type === "COUPON" && <CouponHub systemId={id} tenantId={tenantId} />}
      {sys.type === "MEETING" && <MeetingHub systemId={id} tenantId={tenantId} />}
      {sys.type === "KANBAN" && <KanbanHub systemId={id} tenantId={tenantId} />}
      {isChat && (
        <div className="flex min-w-0 flex-col gap-4">
          {mayReadChat ? (
            <ChatInboxSection
              systemId={id}
              tenantId={tenantId}
              conversationId={c}
              err={err}
              multiUnit={unitCount > 1}
            />
          ) : (
            <p className="card text-sm text-[color:var(--color-muted)]">
              บัญชีของคุณยังไม่มีสิทธิ์ดูกล่องแชทลูกค้า — ขอสิทธิ์ “ดูกล่องแชทลูกค้า”
              จากผู้ดูแลร้านได้ที่หน้าผู้ใช้งาน
            </p>
          )}
        </div>
      )}
      {/* CRM C1.11 ▸ ทางเข้าโมดูลตามรุ่นหน้าจอ (มติ C23): 2 = หน้าแรก CRM ใหม่ · อื่น ๆ = CrmHub เดิม ◂ */}
      {sys.type === "CRM" && (parseCrmSettings(sys.settings).uiVersion === 2 ? <CrmHomeV2 systemId={id} filters={{ pipeline: sp.pipeline, owner: sp.owner, period: sp.period }} /> : <CrmHub systemId={id} />)}
      {sys.type === "INVENTORY" && <InvHub systemId={id} err={err} />}
      {sys.type === "HR" && <HrHub systemId={id} />}
      {sys.type === "MARKETING" && <MarketingHub systemId={id} />}
    </div>
  );
}

async function PosContent({ systemId, tenantId, scope }: { systemId: string; tenantId: string; scope: PosUnitScope }) {
  // POS P1.17 U: ผู้ทำรายการจาก session (getAuth แคชต่อคำขอ) — การ์ดตัดสินสิทธิ์/สาขาเองใน reports.ts (CARD_PERMISSION)
  const auth = await requireTenant();
  const m = posMembership(auth.active);
  const actor = { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions };
  const [sales, paidAll, cardRes, units, t] = await Promise.all([
    prisma.posSale.findMany({
      where: posSaleWhere(tenantId, systemId, scope),
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // POS P1.8 ▸ R3: บิลขายที่นับยอด (PAID + คืนครบ) — ใบคืนเงินหักด้านล่าง ◂
    prisma.posSale.aggregate({
      where: { ...posSaleWhere(tenantId, systemId, scope), docType: "SALE", status: { in: ["PAID", "REFUNDED"] } },
      _sum: { grandTotalSatang: true },
      _count: true,
    }),
    posDashboardCard({ tenantId, systemId }, actor).catch((e: unknown) => {
      console.error("[sys/page] posDashboardCard", e);
      return null;
    }),
    posUnits(tenantId, systemId),
    getTranslations("pos.report.card"),
  ]);
  const card = cardRes && cardRes.ok ? cardRes.card : null;
  // การ์ดถูกปฏิเสธ/ขัดข้อง = สรุปแบบเดิม (ขอบเขตเดียวกับหน้าปิดวัน) — หน้าไม่ว่างเปล่า
  const today = card ? null : await closeDaySummary({ tenantId, systemId, unitIds: posScopeUnitIds(scope) });
  // ลิงก์รายงาน: มีสิทธิ์ pos.report.view อย่างน้อย 1 สาขาของ POS นี้ที่เข้าได้ (ตรงกับด่านของหน้า /pos/reports)
  const canReport = units.some((u) => canAccessUnit(m, u.id) && evaluate(m, { module: "pos", action: REPORT_PERMISSION, unitId: u.id }));
  const refundAll = await prisma.posSale.aggregate({ where: { ...posSaleWhere(tenantId, systemId, scope), docType: "REFUND" }, _sum: { grandTotalSatang: true } });
  const total = (paidAll._sum.grandTotalSatang ?? 0) - (refundAll._sum.grandTotalSatang ?? 0);
  return (
    <>
      <ModuleTabs items={posTabs(systemId)} />
      <Link
        href={`/app/sys/${systemId}/pos/register`}
        className="btn btn-primary min-h-[52px] text-base"
      >
        เปิดหน้าขาย
      </Link>
      <Section
        title={t("today")}
        actions={
          <span className="flex items-center gap-4">
            {canReport && (
              <Link href={`/app/sys/${systemId}/pos/reports`} className="text-sm text-[color:var(--color-accent)]" data-testid="pos-dashboard-reports">
                {t("reports")}
              </Link>
            )}
            <Link href={`/app/sys/${systemId}/pos/close`} className="text-sm text-[color:var(--color-accent)]">ปิดวัน →</Link>
          </span>
        }
      >
        {card ? (
          <PosTodayCard card={card} t={t} />
        ) : today ? (
          <div className="text-sm text-[color:var(--color-muted)]">
            <MoneyText satang={today.netSalesSatang} /> · {today.billCount} บิล
            {today.voidCount > 0 && ` · ยกเลิก ${today.voidCount}`}
          </div>
        ) : null}
      </Section>
      <Section title="ยอดขายรวม">
        <div className="text-sm text-[color:var(--color-muted)]">
          รวม <MoneyText satang={total} /> · {paidAll._count} บิลที่ชำระแล้ว
        </div>
      </Section>
      <Section
        title="บิลล่าสุด"
        actions={<Link href={`/app/sys/${systemId}/pos/sales`} className="text-sm text-[color:var(--color-accent)]">ดูทั้งหมด →</Link>}
      >
        <DataList
          items={sales.map((s) => ({
            key: s.id,
            primary: (
              <span>
                {s.receiptNo} · <MoneyText satang={s.docType === "REFUND" ? -s.grandTotalSatang : s.grandTotalSatang} />
              </span>
            ),
            trailing: (
              <span className="flex items-center gap-2">
                {(s.status !== "PAID" || s.docType === "REFUND") && (
                  <StatusChip value={s.docType === "REFUND" ? "REFUND" : s.status} map={POS_SALE_STATUS_LABEL} tone="danger" />
                )}
                <span className="text-xs text-[color:var(--color-muted)]">{fmt(s.createdAt)}</span>
              </span>
            ),
          }))}
          empty="ยังไม่มีการขาย — บิลจะแสดงที่นี่เมื่อขายผ่านระบบที่เชื่อมไว้"
        />
      </Section>
    </>
  );
}

// POS P1.17 U ▸ การ์ดยอดวันนี้ (ภาพ 08 แถว KPI แบบย่อ) — ตัวเลขทั้งหมดมาจาก posDashboardCard (R16) จอไม่คำนวณเอง ◂
// เทียบเมื่อวาน: ขึ้น = สีหมึก · ลง = สี danger · เมื่อวานไม่มียอด = "—" (deltaBp null)
function PosTodayCard({ card, t }: { card: DashboardCard; t: (key: string, values?: Record<string, string | number>) => string }) {
  const d = card.deltaBp;
  const delta = d === null ? "—" : `${d > 0 ? "▲" : d < 0 ? "▼" : ""} ${(Math.abs(d) / 100).toFixed(1)}%`.trim();
  const stat = (label: string, value: React.ReactNode, id: string) => (
    <div className="flex flex-col gap-0.5 rounded-lg border p-3" data-testid={id}>
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="card flex flex-col gap-4" data-testid="pos-dashboard-card">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="text-3xl font-semibold" data-testid="pos-dashboard-net">
          <MoneyText satang={card.netSalesSatang} />
        </div>
        <div className="flex flex-col items-end text-xs text-[color:var(--color-muted)]" data-testid="pos-dashboard-delta">
          <span>
            <b className={d !== null && d < 0 ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink)]"}>{delta}</b> {t("vsYesterday")}
          </span>
          <span className="tabular-nums">{t("yesterday", { amount: formatBaht(card.yesterdayNetSalesSatang) })}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat(t("bills"), card.billCount, "pos-dashboard-bills")}
        {stat(t("avgBill"), <MoneyText satang={card.avgBillSatang} />, "pos-dashboard-avg")}
        {stat(t("openShifts"), card.openShiftCount, "pos-dashboard-open-shifts")}
        {stat(t("voids"), card.voidCount, "pos-dashboard-voids")}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="pos-dashboard-top">
        <span className="text-[color:var(--color-muted)]">{t("topProduct")}</span>
        {card.topProduct ? (
          <span className="min-w-0 truncate">
            {card.topProduct.name} · ×{card.topProduct.qty} · <MoneyText satang={card.topProduct.salesSatang} />
          </span>
        ) : (
          <span className="text-[color:var(--color-muted)]">{t("noSales")}</span>
        )}
      </div>
      {card.tipSatang > 0 && (
        <div className="flex justify-between text-sm" data-testid="pos-dashboard-tip">
          <span className="text-[color:var(--color-muted)]">{t("tip")}</span>
          <MoneyText satang={card.tipSatang} />
        </div>
      )}
    </div>
  );
}
