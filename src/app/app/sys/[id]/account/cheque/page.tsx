// WO 5.4 — หน้าทะเบียนเช็ครับ/เช็คจ่าย V2 (DESIGN-SPEC-V2 §10.4 — ไม่มีเฟรม g11 เฉพาะ
// → ใช้ตาราง/สรุปตาม §10.4 ตรง ๆ + convention หน้ารายการ V2 อื่น: DocTable · footer-in-card pagination ·
// FinanceSubTabsBar · StatusTabs · DocMoreMenu (⋯ + ConfirmDialog สำหรับ เด้ง/ยกเลิก) · การ์ดสร้างซ่อนหลัง #new)
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { financeSubTabs } from "@/lib/modules/account/finance-ui";
import { listFinanceAccounts } from "@/lib/modules/account/finance";
import {
  listChequesV2,
  chequeSummaryV2,
  chequeSummary,
  chequeStatusCounts,
  CHEQUE_STATUS_LABEL,
  chequeStatusTone,
  type ChequeRowV2,
} from "@/lib/modules/account/cheque";
import type { AccountChequeDirection, AccountChequeStatus } from "@prisma/client";
import {
  createChequeAction,
  depositChequeAction,
  clearChequeAction,
  bounceChequeAction,
  voidChequeAction,
} from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinanceSubTabsBar } from "@/components/account-v2/FinanceSubTabsBar";
import { StatusTabs, type StatusTabDef } from "@/components/account-v2/StatusTabs";
import { DocTable, type DocColumn } from "@/components/account-v2/DocTable";
import { DocMoreMenu } from "@/components/account-v2/DocMoreMenu";
import { CreateSection } from "@/components/account-v2/CreateSection";
import { PrintButton } from "@/components/account-v2/PrintButton";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatBaht } from "@/lib/ui/money";
import { formatThaiDate } from "@/lib/ui/date";

const IN_STATUSES: AccountChequeStatus[] = ["ON_HAND", "DEPOSITED", "CLEARED", "BOUNCED", "VOIDED"];
const OUT_STATUSES: AccountChequeStatus[] = ["ISSUED", "CLEARED", "VOIDED"];

type SP = { dir?: string; status?: string; bank?: string; from?: string; to?: string; page?: string; err?: string; ok?: string };

export default async function ChequePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.cheque.manage" });
  const base = `/app/sys/${id}/account`;
  const pathname = `${base}/cheque`;

  const direction: AccountChequeDirection = sp.dir === "OUT" ? "OUT" : "IN";
  const statusOptions = direction === "IN" ? IN_STATUSES : OUT_STATUSES;
  const status = sp.status && (statusOptions as string[]).includes(sp.status) ? (sp.status as AccountChequeStatus) : undefined;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 20;

  const from = sp.from ? new Date(sp.from) : undefined;
  const to = sp.to ? new Date(new Date(sp.to).getTime() + 86400000) : undefined;

  const [chq, listRes, summary, finances, statusCounts] = await Promise.all([
    chequeSummary(tenantId, systemId),
    listChequesV2(tenantId, systemId, { direction, status, bank: sp.bank, from, to, page, pageSize }),
    chequeSummaryV2(tenantId, systemId, direction),
    listFinanceAccounts(tenantId, systemId),
    chequeStatusCounts(tenantId, systemId, direction),
  ]);
  const { rows, total, totalSatang } = listRes;

  const subTabs = financeSubTabs(base, direction === "IN" ? "chq-in" : "chq-out", chq);
  const heading = direction === "IN" ? "เช็ครับ" : "เช็คจ่าย";
  const pendingLabel = direction === "IN" ? "รอเรียกเก็บ" : "เช็คจ่ายรอตัด";

  const spForHref: Record<string, string | undefined> = { dir: sp.dir, status: sp.status, bank: sp.bank, from: sp.from, to: sp.to, page: sp.page };

  const statusTabs: StatusTabDef[] = statusOptions.map((s) => ({
    key: s,
    label: CHEQUE_STATUS_LABEL[s],
    tone: s === "BOUNCED" || s === "VOIDED" ? "danger" : undefined,
  }));
  // นับต่อสถานะ (ไม่ผูกกับตัวกรอง bank/date ปัจจุบัน — เห็นภาพรวมทุกสถานะเสมอ ตาม convention StatusTabs อื่น)
  const statusTabCounts: Record<string, number> = {};
  for (const s of statusOptions) statusTabCounts[s] = statusCounts[s] ?? 0;
  const allCount = Object.values(statusTabCounts).reduce((a, b) => a + b, 0);

  const cols: DocColumn<ChequeRowV2>[] = [
    { key: "chequeNo", header: "เลขที่เช็ค", render: (r) => <span className="whitespace-nowrap">{r.chequeNo}</span> },
    { key: "bank", header: "ธนาคาร", render: (r) => `${r.bankName}${r.bankBranch ? ` (${r.bankBranch})` : ""}` },
    { key: "date", header: "วันที่บนเช็ค", render: (r) => formatThaiDate(r.chequeDate) },
    { key: "contact", header: "ผู้ติดต่อ", render: (r) => r.contactName ?? "—" },
    { key: "amount", header: "จำนวน", align: "right", render: (r) => formatBaht(r.amount, { decimals: true }) },
    { key: "ref", header: "อ้างอิงเอกสาร", render: (r) => <span className="whitespace-nowrap">{r.documentNo ?? "—"}</span> },
    {
      key: "status",
      header: "สถานะ",
      render: (r) => {
        const tone = chequeStatusTone(r.status);
        const color = tone === "danger" ? "var(--color-danger)" : tone === "strong" ? "var(--color-ink)" : "var(--color-muted)";
        return (
          <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: color, color }}>
            {CHEQUE_STATUS_LABEL[r.status]}
          </span>
        );
      },
    },
  ];

  const rowActionsFor = (r: ChequeRowV2) => {
    const canDeposit = r.direction === "IN" && r.status === "ON_HAND";
    const canClear = (r.direction === "IN" && (r.status === "DEPOSITED" || r.status === "ON_HAND")) || (r.direction === "OUT" && r.status === "ISSUED");
    const canBounce = r.direction === "IN" && ["ON_HAND", "DEPOSITED", "CLEARED"].includes(r.status);
    const canVoid = r.direction === "OUT" && r.status === "ISSUED";
    const items = [];
    if (canDeposit) items.push({ label: "นำฝาก", icon: "in", submit: { action: depositChequeAction, fields: { systemId, id: r.id, dir: direction } } });
    if (canClear)
      items.push({
        label: r.direction === "IN" ? "เรียกเก็บได้" : "ตัดบัญชี",
        icon: "check",
        submit: { action: clearChequeAction, fields: { systemId, id: r.id, dir: direction } },
      });
    const danger = canBounce
      ? {
          triggerLabel: "เช็คเด้ง",
          title: "บันทึกเช็คเด้ง?",
          detail: "ระบบจะกลับรายการและตั้งลูกหนี้กลับ",
          confirmLabel: "ยืนยันเด้ง",
          action: bounceChequeAction,
          fields: { systemId, id: r.id, dir: direction },
        }
      : canVoid
        ? {
            triggerLabel: "ยกเลิก",
            title: "ยกเลิกเช็คจ่ายใบนี้?",
            detail: "ระบบจะกลับรายการและตั้งเจ้าหนี้กลับ",
            confirmLabel: "ยืนยันยกเลิก",
            action: voidChequeAction,
            fields: { systemId, id: r.id, dir: direction },
          }
        : undefined;
    return { items, danger };
  };

  const resetHref = `${pathname}?dir=${direction}`;

  return (
    <div className="flex flex-col gap-4 pb-24" data-testid="cheque-page">
      <FinanceSubTabsBar subTabs={subTabs} />

      <PageHeader
        title={heading}
        actions={
          <>
            <PrintButton testId="cheque-print" />
            <a href="#new" className="btn btn-primary" data-testid="cheque-create-btn">
              + เพิ่ม{heading}
            </a>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:max-w-md" data-testid="cheque-tiles">
        <div className="card flex flex-col gap-1">
          <div className="text-xs text-[color:var(--color-muted)]">{pendingLabel} ฿</div>
          <div className="text-2xl font-semibold tabular-nums" data-testid="cheque-tile-pending">
            {formatBaht(summary.pendingSatang, { decimals: true })}
          </div>
        </div>
        <div className="card flex flex-col gap-1">
          <div className="text-xs text-[color:var(--color-muted)]">ครบกำหนดใน 7 วัน</div>
          <div className="text-2xl font-semibold tabular-nums" data-testid="cheque-tile-duesoon">
            {summary.dueSoonCount}
          </div>
        </div>
      </div>

      <StatusTabs
        tabs={[{ key: "", label: "ทั้งหมด" }, ...statusTabs]}
        counts={{ "": allCount, ...statusTabCounts }}
        active={sp.status ?? ""}
        paramKey="status"
        testId="cheque-status-tabs"
      />

      <form method="GET" action={pathname} className="flex flex-wrap items-center gap-2" data-testid="cheque-filters">
        <input type="hidden" name="dir" value={direction} />
        {status && <input type="hidden" name="status" value={status} />}
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">วันที่เริ่ม</span>
          <input type="date" name="from" defaultValue={sp.from} className="input w-auto" />
        </label>
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">ถึงวันที่</span>
          <input type="date" name="to" defaultValue={sp.to} className="input w-auto" />
        </label>
        <div className="relative min-w-[220px] flex-1">
          <input type="search" name="bank" defaultValue={sp.bank} placeholder="ค้นหาเลขที่เช็ค ธนาคาร หรือผู้ติดต่อ" className="input" data-testid="cheque-search" />
        </div>
        <button type="submit" className="btn-sm">
          ค้นหา
        </button>
        <a href={resetHref} className="text-sm underline text-[color:var(--color-muted)]" data-testid="cheque-reset">
          คืนค่าเริ่มต้น
        </a>
      </form>

      {sp.err && <p className="text-sm text-[color:var(--color-danger)]" data-testid="cheque-err">{sp.err}</p>}
      {sp.ok === "1" && <p className="text-sm font-medium" data-testid="cheque-ok">บันทึกสำเร็จ</p>}

      <DocTable
        testId="cheque-table"
        cols={cols}
        rows={rows}
        pathname={pathname}
        searchParams={spForHref}
        selectable={false}
        rowActions={(r) => {
          const { items, danger } = rowActionsFor(r);
          return <DocMoreMenu items={items} danger={danger} testId={`cheque-row-actions-${r.id}`} />;
        }}
        mobileTitle={(r) => `${r.chequeNo} · ${r.bankName}`}
        mobileSubtitle={(r) => r.contactName ?? "—"}
        mobileTrailing={(r) => formatBaht(r.amount, { decimals: true })}
        mobileStatus={(r) => (
          <span
            className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs"
            style={{ borderColor: "var(--color-line)" }}
          >
            {CHEQUE_STATUS_LABEL[r.status]}
          </span>
        )}
        mobileDateLine={(r) => `${formatThaiDate(r.chequeDate)}${r.documentNo ? ` · ${r.documentNo}` : ""}`}
        // g11 convention (WO 5.4 wht page) — "ผลรวม N รายการ" ซ้าย / จำนวนเงินตัวหนา ขวา อยู่กรอบเดียวกับ Pagination
        footerLeft={
          <span className="text-[color:var(--color-muted)]" data-testid="cheque-footer-count">
            ผลรวม {total} รายการ
          </span>
        }
        footerRight={
          <span className="text-[color:var(--color-muted)]" data-testid="cheque-footer-sum">
            จำนวนเงิน <span className="font-semibold text-[color:var(--color-ink)]">{formatBaht(totalSatang, { decimals: true })}</span>
          </span>
        }
        page={page}
        pageCount={Math.max(1, Math.ceil(total / pageSize))}
        pageSize={pageSize}
        total={total}
        emptyText={`ยังไม่มี${heading} — เพิ่มด้านล่าง`}
        rowTestId={(r) => `cheque-row-${r.id}`}
      />

      <CreateSection>
        <div className="card flex flex-col gap-3" data-testid="cheque-create-form">
          <h2 className="text-sm font-semibold">เพิ่ม{heading}</h2>
          <form action={createChequeAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="direction" value={direction} />
            <FormField label="เลขที่เช็ค" required>
              <input name="chequeNo" required className="input" />
            </FormField>
            <FormField label="ธนาคาร" required>
              <input name="bankName" required className="input" />
            </FormField>
            <FormField label="สาขา">
              <input name="bankBranch" className="input" />
            </FormField>
            <FormField label="วันที่หน้าเช็ค" required>
              <input name="chequeDate" type="date" required className="input" />
            </FormField>
            <FormField label="จำนวนเงิน (บาท)" required>
              <input name="amount" type="number" step="0.01" required className="input" />
            </FormField>
            <FormField label={direction === "IN" ? "บัญชีที่นำฝาก" : "บัญชีที่จ่ายจาก"}>
              <select name="financeAccountId" className="input">
                <option value="">— เลือกบัญชีเงิน —</option>
                {finances.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="หมายเหตุ">
                <input name="note" className="input" />
              </FormField>
            </div>
            <SubmitButton className="sm:col-span-2 sm:justify-self-start">+ เพิ่ม{heading}</SubmitButton>
          </form>
        </div>
      </CreateSection>
    </div>
  );
}
