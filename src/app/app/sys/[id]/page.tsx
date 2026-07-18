import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import {
  listRewards,
  listRedemptions,
  listRewardCustomers,
  resolvePointSystemId,
} from "@/lib/modules/reward/service";
import { RedeemForm } from "@/lib/modules/reward/forms";
import { getPointSettings, listPointCustomers } from "@/lib/modules/point/service";
import { PointSettingsForm, AdjustPointsForm } from "@/lib/modules/point/forms";
import { CouponContent } from "@/lib/modules/coupon/ui";
import { MeetingContent } from "@/lib/modules/meeting/ui";
import { KanbanContent } from "@/lib/modules/kanban/ui";
import { AccountContent } from "@/lib/modules/account/ui";
import { ChatContent } from "@/lib/modules/chat/ui";
import { CrmContent } from "@/lib/modules/crm/ui";
import { InventoryContent } from "@/lib/modules/inventory/ui";
import { HrContent } from "@/lib/modules/hr/ui";
import { MarketingContent } from "@/lib/modules/marketing/ui";
import { SubscriptionSection } from "@/lib/modules/member/subscription-ui";
import { importCustomersAction } from "@/lib/modules/member/import-actions";
import CsvImport from "@/components/CsvImport";
import {
  linkUnitAction,
  unlinkUnitAction,
  addRewardAction,
  removeRewardAction,
  fulfillRedemptionAction,
  cancelRedemptionAction,
} from "@/lib/actions/systems";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { REWARD_REDEMPTION_STATUS_LABEL } from "@/lib/ui/status-labels";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { POS_SALE_STATUS_LABEL } from "@/lib/ui/status-labels";
import { ModuleTabs } from "@/components/module-tabs";

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

// หน้า "ระบบ" ประเภท feature (สมาชิก/แต้ม/POS/รางวัล) — เนื้อหา + การเชื่อมต่อ
export default async function SystemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  const [links, units] = await Promise.all([
    prisma.appSystemUnit.findMany({ where: { tenantId, systemId: id } }),
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const linkedIds = new Set(links.map((l) => l.unitId));
  const linkedUnits = units.filter((u) => linkedIds.has(u.id));
  const otherUnits = units.filter((u) => !linkedIds.has(u.id));
  const back = `/app/sys/${id}`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        desc={`ระบบ${def?.label ?? ""}`}
      />

      {/* การเชื่อมต่อ */}
      <Section title="เชื่อมต่อกับระบบ" card>
        {linkedUnits.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">
            ยังไม่ได้เชื่อม — เชื่อมกับระบบธุรกิจ (จองคิว ฯลฯ) เพื่อให้ทำงานร่วมกัน
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {linkedUnits.map((u) => (
              <ConfirmDialog
                key={u.id}
                triggerLabel={`${u.name} ✕`}
                triggerClassName="rounded-full border px-3 py-1.5 text-xs hover:bg-[color:var(--color-surface-2)]"
                title="ยกเลิกการเชื่อมระบบนี้?"
                detail={`หน่วยงาน "${u.name}" จะถูกตัดการเชื่อมกับระบบนี้`}
                confirmLabel="ยืนยันยกเลิกการเชื่อม"
                danger
                action={unlinkUnitAction}
                fields={{ systemId: id, unitId: u.id, back }}
              />
            ))}
          </div>
        )}
        {otherUnits.length > 0 && (
          <form action={linkUnitAction} className="flex gap-2">
            <input type="hidden" name="systemId" value={id} />
            <input type="hidden" name="back" value={back} />
            <select name="unitId" className="input flex-1">
              {otherUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost text-sm">+ เชื่อม</button>
          </form>
        )}
      </Section>

      {/* เนื้อหาตามประเภท */}
      {sys.type === "MEMBER" && <MemberContent systemId={id} />}
      {sys.type === "POINT" && <PointContent systemId={id} />}
      {sys.type === "POS" && <PosContent systemId={id} tenantId={tenantId} />}
      {sys.type === "REWARD" && <RewardContent systemId={id} tenantId={tenantId} />}
      {sys.type === "COUPON" && <CouponContent systemId={id} tenantId={tenantId} />}
      {sys.type === "MEETING" && <MeetingContent systemId={id} tenantId={tenantId} />}
      {sys.type === "KANBAN" && <KanbanContent systemId={id} tenantId={tenantId} />}
      {sys.type === "ACCOUNT" && <AccountContent systemId={id} tenantId={tenantId} />}
      {sys.type === "CHAT" && <ChatContent systemId={id} tenantId={tenantId} />}
      {sys.type === "CRM" && <CrmContent systemId={id} />}
      {sys.type === "INVENTORY" && <InventoryContent systemId={id} />}
      {sys.type === "HR" && <HrContent systemId={id} />}
      {sys.type === "MARKETING" && <MarketingContent systemId={id} />}
    </div>
  );
}

async function MemberContent({ systemId }: { systemId: string }) {
  const customers = await prisma.customer.findMany({
    where: { memberSystemId: systemId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <Section title={`สมาชิก (${customers.length})`}>
        <DataList
          items={customers.map((c) => ({
            key: c.id,
            href: `/app/members/${c.id}`,
            primary: c.name ?? "ไม่ระบุชื่อ",
            secondary: `${c.phone ?? "—"} · ${c.memberCode}`,
            trailing: (
              <span className="text-xs text-[color:var(--color-muted)]">
                {c.visitCount} ครั้ง · <MoneyText satang={c.totalSpentSatang} />
              </span>
            ),
          }))}
          empty="ยังไม่มีสมาชิก — จะถูกสร้างอัตโนมัติเมื่อลูกค้าจอง/ซื้อในระบบที่เชื่อมไว้"
        />
      </Section>
      <Section title="นำเข้าลูกค้าจาก CSV" card>
        <CsvImport
          systemId={systemId}
          entityLabel="ลูกค้า"
          templateHeader="ชื่อ,เบอร์โทร,อีเมล"
          templateSample="สมชาย ใจดี,0812345678,somchai@example.com"
          templateFilename="ลูกค้า-ตัวอย่าง.csv"
          supportedHeaders="ชื่อ (name), เบอร์โทร (phone), อีเมล (email) — ต้องมีชื่อหรือเบอร์อย่างน้อย 1 อย่าง"
          action={importCustomersAction}
        />
      </Section>
      <SubscriptionSection systemId={systemId} />
    </>
  );
}

async function PointContent({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [settings, customers, ledger] = await Promise.all([
    getPointSettings(tenantId),
    listPointCustomers(tenantId, systemId),
    prisma.pointLedger.findMany({
      where: { systemId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const bahtPerPoint = settings.satangPerPoint / 100;
  return (
    <>
      <Section title="ตั้งค่าแต้ม" card>
        <p className="text-xs text-[color:var(--color-muted)]">
          {settings.active
            ? `อัตราสะสมปัจจุบัน: ทุก ${bahtPerPoint} บาท = 1 แต้ม`
            : "การสะสมแต้มถูกปิดอยู่ — ลูกค้าจะยังไม่ได้รับแต้มจากการซื้อ"}
        </p>
        <PointSettingsForm systemId={systemId} bahtPerPoint={bahtPerPoint} active={settings.active} />
      </Section>

      <Section title="ปรับ/แจกแต้ม">
        {customers.length > 0 ? (
          <AdjustPointsForm systemId={systemId} customers={customers} />
        ) : (
          <EmptyState text="ยังไม่มีสมาชิก — ลูกค้าจะเป็นสมาชิกอัตโนมัติเมื่อจอง/ซื้อในกิจการที่เชื่อมกับระบบแต้มนี้ แล้วจึงปรับ/แจกแต้มได้" />
        )}
      </Section>

      <Section title="รายการแต้มล่าสุด">
        <DataList
          items={ledger.map((l) => ({
            key: l.id,
            primary: `${l.delta > 0 ? "+" : ""}${l.delta} แต้ม · ${l.reason ?? l.type}`,
            trailing: <span className="text-xs text-[color:var(--color-muted)]">{fmt(l.createdAt)}</span>,
          }))}
          empty="ยังไม่มีรายการแต้ม — จะบันทึกอัตโนมัติเมื่อลูกค้าสะสมแต้ม"
        />
      </Section>
    </>
  );
}

async function PosContent({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const sales = await prisma.posSale.findMany({
    where: { tenantId, systemId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const paidAll = await prisma.posSale.aggregate({
    where: { tenantId, systemId, status: "PAID" },
    _sum: { grandTotalSatang: true },
    _count: true,
  });
  const total = paidAll._sum.grandTotalSatang ?? 0;
  return (
    <>
      <ModuleTabs
        items={[
          { href: `/app/sys/${systemId}`, label: "ภาพรวม" },
          { href: `/app/sys/${systemId}/pos/register`, label: "ขาย" },
          { href: `/app/sys/${systemId}/pos/sales`, label: "ประวัติบิล" },
        ]}
      />
      <Link
        href={`/app/sys/${systemId}/pos/register`}
        className="btn btn-primary min-h-[52px] text-base"
      >
        เปิดหน้าขาย
      </Link>
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
                {s.receiptNo} · <MoneyText satang={s.grandTotalSatang} />
              </span>
            ),
            trailing: (
              <span className="flex items-center gap-2">
                {s.status !== "PAID" && (
                  <StatusChip value={s.status} map={POS_SALE_STATUS_LABEL} tone="danger" />
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

async function RewardContent({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const [allRewards, redemptions, customers, pointSystemId] = await Promise.all([
    listRewards(tenantId, systemId),
    listRedemptions(tenantId, systemId, 30),
    listRewardCustomers(tenantId, systemId),
    resolvePointSystemId(tenantId, systemId),
  ]);
  const rewards = allRewards.filter((r) => r.active);
  const statusTone = (s: string): "muted" | "strong" | "danger" =>
    s === "CANCELLED" ? "danger" : s === "FULFILLED" ? "strong" : "muted";
  const canRedeem = rewards.length > 0 && customers.length > 0 && !!pointSystemId;

  return (
    <>
      <Section title="รายการรางวัล">
        <DataList
          items={rewards.map((r) => ({
            key: r.id,
            primary: `${r.name} · ${r.pointsCost} แต้ม${r.stock !== null ? ` · เหลือ ${r.stock}` : ""}`,
            trailing: (
              <ConfirmDialog
                triggerLabel="ลบ"
                triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                title="ลบรางวัลนี้?"
                detail={`รางวัล "${r.name}" จะถูกลบออกจากระบบแลกแต้ม`}
                confirmLabel="ยืนยันลบ"
                danger
                action={removeRewardAction}
                fields={{ id: r.id, systemId }}
              />
            ),
          }))}
          empty="ยังไม่มีรางวัล — เพิ่มรางวัลด้านล่างให้ลูกค้าแลกแต้ม"
        />
        <form action={addRewardAction} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input type="hidden" name="systemId" value={systemId} />
          <input name="name" required placeholder="ชื่อรางวัล" className="input col-span-2" />
          <input name="pointsCost" type="number" min={1} required placeholder="แต้ม" className="input" />
          <button className="btn btn-ghost text-sm">+ เพิ่ม</button>
        </form>
      </Section>

      <Section title="แลกรางวัล">
        {canRedeem ? (
          <RedeemForm
            systemId={systemId}
            rewards={rewards.map((r) => ({
              id: r.id,
              name: r.name,
              pointsCost: r.pointsCost,
              stock: r.stock,
            }))}
            customers={customers}
          />
        ) : !pointSystemId ? (
          <EmptyState text="ยังแลกรางวัลไม่ได้ — เชื่อมระบบรางวัลนี้เข้ากับกิจการเดียวกับ 'ระบบแต้ม' ก่อน (ที่การเชื่อมต่อด้านบน)" />
        ) : rewards.length === 0 ? (
          <EmptyState text="ยังไม่มีรางวัลให้แลก — เพิ่มรางวัลด้านบนก่อน" />
        ) : (
          <EmptyState text="ยังไม่มีสมาชิก — ลูกค้าจะเป็นสมาชิกอัตโนมัติเมื่อจอง/ซื้อในกิจการที่เชื่อมไว้ แล้วจึงแลกแต้มได้" />
        )}
      </Section>

      <Section title="ประวัติการแลก">
        <DataList
          items={redemptions.map((r) => ({
            key: r.id,
            primary: `${r.rewardName} · ${r.customerName}`,
            secondary: `โค้ด ${r.code} · ${r.pointsCost} แต้ม · ${fmt(r.createdAt)}`,
            trailing: (
              <span className="flex flex-col items-end gap-1.5">
                <StatusChip
                  value={r.status}
                  map={REWARD_REDEMPTION_STATUS_LABEL}
                  tone={statusTone(r.status)}
                />
                {r.status === "PENDING" && (
                  <span className="flex items-center gap-2">
                    <form action={fulfillRedemptionAction}>
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="redemptionId" value={r.id} />
                      <SubmitButton variant="ghost" pendingText="กำลังบันทึก…">
                        รับแล้ว
                      </SubmitButton>
                    </form>
                    <ConfirmDialog
                      triggerLabel="ยกเลิก+คืนแต้ม"
                      triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                      title="ยกเลิกการแลกนี้?"
                      detail={`คืน ${r.pointsCost} แต้มให้ ${r.customerName} และคืนสต็อกรางวัล`}
                      confirmLabel="ยืนยันยกเลิก + คืนแต้ม"
                      danger
                      action={cancelRedemptionAction}
                      fields={{ systemId, redemptionId: r.id }}
                    />
                  </span>
                )}
              </span>
            ),
          }))}
          empty="ยังไม่มีการแลกรางวัล — เมื่อแลกให้สมาชิกแล้ว รายการจะแสดงที่นี่"
        />
      </Section>
    </>
  );
}
