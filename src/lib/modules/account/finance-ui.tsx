// finance-ui.tsx — หน้าช่องทางการเงิน V2 (WO 5.1) — server component ประกอบ data layer (finance.ts)
// อ้าง DESIGN-SPEC-V2 §10.1 · เฟรม g9-finance-channels.png + g9-finance-channels-modal.png
// checklist เต็มใน ledger/wo-notes/5.1.md
//
// "?new=1" เปิด modal เพิ่มช่องทาง · "?edit=<id>" เปิดแก้ไข · "?transfer=1" เปิด modal โอนระหว่างช่องทาง
// (ตาม pattern ContactModal/contacts-ui ของ WO 3.2/3.3)

import { formatDateTh } from "@/lib/ui/date";
import { formatBaht } from "@/lib/ui/money";
import { FinancePanel, type FinanceGroupCard, type FinanceSubTab } from "@/components/account-v2/FinancePanel";
import { FinanceModal, type FinanceModalAccount } from "@/components/account-v2/FinanceModal";
import { FinanceTransferModal, type TransferAccountOpt } from "@/components/account-v2/FinanceTransferModal";
import type { RowActionItem } from "@/components/account-v2/RowActions";
import { listTenantMembers } from "./service";
import { chequeSummary } from "./cheque";
import {
  financeBalances,
  financeMonthChanges,
  groupFinanceAccounts,
  previewChildLedgerCodes,
  nextFinanceCode,
  listFinanceOpeningEntries,
  getFinanceAccountById,
  FINANCE_TYPE_LABEL,
  type FinanceGroupKey,
} from "./finance";
import { archiveFinanceFormAction } from "@/app/app/sys/[id]/account/finance/actions";

const GROUP_ICON: Record<FinanceGroupKey, string> = {
  CASH: "cash",
  BANK_SAVINGS: "bank",
  BANK_CURRENT: "bank",
  E_WALLET: "wallet",
  PETTY_CASH: "swap",
};

type SP = { new?: string; edit?: string; transfer?: string; from?: string; err?: string; ok?: string };

export async function FinancePage({
  tenantId,
  systemId,
  id,
  searchParams,
}: {
  tenantId: string;
  systemId: string;
  id: string; // systemId ของ URL (`/app/sys/<id>/...`)
  searchParams: SP;
}) {
  const base = `/app/sys/${id}/account`;
  const financePath = `${base}/finance`;

  const [rows, monthChanges, chq, members] = await Promise.all([
    financeBalances(tenantId, systemId),
    financeMonthChanges(tenantId, systemId),
    chequeSummary(tenantId, systemId),
    listTenantMembers(tenantId), // ใช้แสดงชื่อ "ผู้ถือ" ของบัญชีสำรองรับ-จ่าย (g9)
  ]);
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  const groups: FinanceGroupCard[] = groupFinanceAccounts(rows).map((g) => ({
    key: g.key,
    label: g.label,
    icon: GROUP_ICON[g.key],
    totalSatang: g.total,
    accounts: g.accounts.map((a) => {
      const mc = monthChanges.get(a.id) ?? { delta: 0, inCount: 0 };
      const monthText =
        a.type === "PETTY_CASH"
          ? `เดือนนี้ เติมแล้ว ${mc.inCount} ครั้ง`
          : `เดือนนี้ ${mc.delta >= 0 ? "+" : "−"}${formatBaht(Math.abs(mc.delta), { decimals: true }).replace("฿", "฿")}`;
      const subtitle =
        a.type === "BANK"
          ? a.bankName
            ? `${a.bankName} · ${a.accountNo ?? "—"}`
            : "ไม่ผูกธนาคาร"
          : a.type === "CASH"
            ? "ไม่ผูกธนาคาร"
            : a.type === "E_WALLET"
              ? a.promptpayId ?? "—"
              : a.limitSatang != null
                ? `วงเงิน ${formatBaht(a.limitSatang, { decimals: true })}${a.holderUserId ? ` · ผู้ถือ ${memberName.get(a.holderUserId) ?? "—"}` : ""}`
                : "ยังไม่กำหนดวงเงิน";
      const rowActions: RowActionItem[] = [
        { label: "ดูความเคลื่อนไหว", icon: "list", href: `${financePath}/${a.id}/statement` },
        { label: "โอน", icon: "swap", href: `${financePath}?transfer=1&from=${a.id}` },
        { label: "แก้ไข", icon: "edit", href: `${financePath}?edit=${a.id}` },
        {
          label: "ปิดใช้งาน",
          icon: "x",
          danger: true,
          sepBefore: true,
          submit: { action: archiveFinanceFormAction, fields: { systemId, id: a.id } },
        },
      ];
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        subtitle,
        balanceSatang: a.balance,
        monthText,
        monthNegative: a.type !== "PETTY_CASH" && mc.delta < 0,
        rowActions,
      };
    }),
  }));

  const total = rows.reduce((s, a) => s + a.balance, 0);

  const subTabs: FinanceSubTab[] = [
    { key: "overview", label: "ภาพรวม", href: `${base}/finance?tab=overview`, active: false },
    { key: "channels", label: "เงินสด/ธนาคาร/e-Wallet", href: financePath, active: true },
    { key: "petty", label: "เงินสดย่อย", href: `${base}/finance?tab=petty`, active: false },
    { key: "chq-in", label: "เช็ครับ", href: `${base}/cheque?dir=IN`, active: false, badge: chq.inCount },
    { key: "chq-out", label: "เช็คจ่าย", href: `${base}/cheque?dir=OUT`, active: false, badge: chq.outCount },
    { key: "wht-credit", label: "ภาษีถูกหัก ณ ที่จ่าย", href: `${base}/wht?tab=credit`, active: false },
    { key: "wht-deduct", label: "ภาษีหัก ณ ที่จ่าย", href: `${base}/wht?tab=deduct`, active: false },
  ];

  // ── modal เพิ่ม/แก้ไข (โหลดเฉพาะตอนเปิด — หน้ารายการปกติไม่เสีย query เพิ่ม) ──
  const modalOpen = searchParams.new === "1" || !!searchParams.edit;
  const transferOpen = searchParams.transfer === "1";

  let modal: React.ReactNode = null;
  if (modalOpen) {
    const editingId = searchParams.edit;
    const editingRaw = editingId ? await getFinanceAccountById(tenantId, systemId, editingId) : null;
    const [suggestedCodes, previewLedgerCodes, holders, openingEntries] = await Promise.all([
      Promise.all((["CASH", "BANK", "E_WALLET", "PETTY_CASH"] as const).map((t) => nextFinanceCode(systemId, t, t === "BANK" ? "SAVINGS" : null))).then(
        ([CASH, BANK, E_WALLET, PETTY_CASH]) => ({ CASH, BANK, E_WALLET, PETTY_CASH }),
      ),
      previewChildLedgerCodes(systemId),
      listTenantMembers(tenantId),
      editingRaw ? listFinanceOpeningEntries(editingRaw.id) : Promise.resolve([]),
    ]);
    const account: FinanceModalAccount | null = editingRaw
      ? {
          id: editingRaw.id,
          code: editingRaw.code,
          type: editingRaw.type,
          name: editingRaw.name,
          bankSubtype: editingRaw.bankSubtype,
          bankName: editingRaw.bankName,
          bankBranch: editingRaw.bankBranch,
          accountNo: editingRaw.accountNo,
          accountName: editingRaw.accountName,
          promptpayId: editingRaw.promptpayId,
          note: editingRaw.note,
          useForReceive: editingRaw.useForReceive,
          useForPay: editingRaw.useForPay,
          showOnDocuments: editingRaw.showOnDocuments,
          holderUserId: editingRaw.holderUserId,
          limitSatang: editingRaw.limitSatang,
          openingEntries: openingEntries.map((e) => ({ seq: e.seq, date: e.date.toISOString(), amountSatang: e.amountSatang, note: e.note })),
        }
      : null;
    modal = (
      <FinanceModal
        systemId={systemId}
        financePath={financePath}
        account={account}
        suggestedCodes={suggestedCodes}
        previewLedgerCodes={previewLedgerCodes}
        holders={holders}
      />
    );
  }

  let transferModal: React.ReactNode = null;
  if (transferOpen) {
    const opts: TransferAccountOpt[] = rows.map((a) => ({ id: a.id, label: `${a.name}${a.code ? ` (${a.code})` : ""}` }));
    transferModal = <FinanceTransferModal systemId={systemId} financePath={financePath} accounts={opts} defaultFromId={searchParams.from} />;
  }

  return (
    <>
      <FinancePanel
        subTabs={subTabs}
        headerCount={rows.length}
        asOfLabel={formatDateTh(new Date())}
        totalSatang={total}
        groups={groups}
        createHref={`${financePath}?new=1`}
        transferHref={`${financePath}?transfer=1`}
        errText={searchParams.err}
        okText={searchParams.ok}
      />
      {modal}
      {transferModal}
    </>
  );
}
