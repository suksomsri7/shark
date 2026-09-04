// WO 5.3 — หน้า "กระทบยอดธนาคาร" V2 (DESIGN-SPEC-V2 §10.2 · เฟรม g10-bank-reconcile.png)
// (แทน placeholder ของ WO 5.2) — เลือกช่องทาง+เดือน · นำเข้า statement CSV · จับคู่ · ยืนยันเดือน
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { accountCan } from "@/lib/modules/account/access";
import { financeSubTabs } from "@/lib/modules/account/finance-ui";
import { chequeSummary } from "@/lib/modules/account/cheque";
import { periodKeyBkk } from "@/lib/modules/account/dashboard";
import { shiftMonthKey } from "@/lib/modules/account/finance-overview";
import { listReconcilableChannels, reconcilePageData, isPeriodKey } from "@/lib/modules/account/reconcile";
import { ReconcilePanel } from "@/components/account-v2/ReconcilePanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

/** ตัวเลือกเดือน = เดือนนี้ + ย้อนหลัง 11 เดือน (พอสำหรับงานกระทบยอดจริง · ไม่ต้อง query) */
function monthOptionsOf(current: string, now: Date): string[] {
  const base = periodKeyBkk(now);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) out.push(shiftMonthKey(base, -i));
  if (!out.includes(current)) out.unshift(current);
  return out;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string; month?: string; import?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id, { can: "account.finance.manage" });

  const base = `/app/sys/${id}/account`;
  const financePath = `${base}/finance`;
  const now = new Date();

  const [channels, chq] = await Promise.all([
    listReconcilableChannels({ tenantId, systemId }),
    chequeSummary(tenantId, systemId),
  ]);
  // g10 ไม่ได้วาดแถบแท็บย่อยไว้ (ภาพตัดเฉพาะเนื้อหน้า) แต่ทุกหน้าในหมวดการเงินมีแถบนี้ →
  // คงไว้เพื่อความสม่ำเสมอ และ **ไม่เพิ่มแท็บที่ 8** (จะพัง parity ของ f7/g9 ที่ผ่านแล้ว)
  // — หน้ากระทบยอดเป็นลูกของ "ภาพรวม" ตาม §10.2 จึงให้แท็บ "ภาพรวม" ยังคง active
  const subTabs = financeSubTabs(base, "overview", chq);

  if (channels.length === 0) {
    return (
      <div className="flex flex-col gap-4 pb-24" data-testid="reconcile-page-empty">
        <PageHeader title="กระทบยอดธนาคาร" />
        <EmptyState
          text="ยังไม่มีช่องทางประเภทธนาคาร/e-Wallet ที่ผูกบัญชีแยกประเภท — เพิ่มช่องทางก่อนจึงจะกระทบยอดได้"
          action={{ href: `${financePath}?new=1`, label: "เพิ่มช่องทางการเงิน" }}
        />
      </div>
    );
  }

  const channelId = channels.find((c) => c.id === sp.channel)?.id ?? channels[0].id;
  const month = sp.month && isPeriodKey(sp.month) ? sp.month : periodKeyBkk(now);

  // WO 9.3: ส่งรายการช่องทางที่โหลดไว้ข้างบนต่อไป — เดิม reconcilePageData ไปอ่าน
  //         AccountFinance + AccountLedger ซ้ำอีกชุด (4 คำสั่งซ้ำต่อการเปิดหน้า 1 ครั้ง)
  const data = await reconcilePageData({ tenantId, systemId }, channelId, month, { base, channels });
  if ("ok" in data) {
    return (
      <div className="flex flex-col gap-4 pb-24" data-testid="reconcile-page-error">
        <PageHeader title="กระทบยอดธนาคาร" />
        <EmptyState text={data.reason} action={{ href: `${financePath}/reconcile`, label: "กลับหน้ากระทบยอด" }} />
      </div>
    );
  }

  const reconcilePath = `${financePath}/reconcile`;

  return (
    <ReconcilePanel
      systemId={systemId}
      subTabs={subTabs}
      data={data}
      channels={channels.map((c) => ({ id: c.id, label: c.code ? `${c.name} · ${c.code}` : c.name }))}
      monthOptions={monthOptionsOf(month, now)}
      reconcilePath={reconcilePath}
      importOpen={sp.import === "1"}
      canReopen={accountCan(auth, "account.period.reopen")}
    />
  );
}
