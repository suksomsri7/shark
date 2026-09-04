"use client";

// PettyCashPanel — หน้า "สำรองรับ/จ่าย" V2 (WO 5.2 · DESIGN-SPEC-V2 §10.3)
// ตาราง: ชื่อ · ผู้ถือ · วงเงิน · คงเหลือ · เติมล่าสุด · ทำรายการ ▾ (เติมเงิน · เบิกชดเชย · statement)
// มือถือ 390: การ์ดแทนตาราง (f13 pattern) · checklist เต็มใน ledger/wo-notes/5.2.md
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "./Modal";
import { DateInput } from "./DateInput";
import { RowActions, type RowActionItem } from "./RowActions";
import { FinanceSubTabsBar } from "./FinanceSubTabsBar";
import type { FinanceSubTab } from "./FinancePanel";
import { formatBaht } from "@/lib/ui/money";
import {
  topUpPettyCashActionDirect,
  listReimbursableExpensesAction,
  reimbursePettyCashActionDirect,
} from "@/app/app/sys/[id]/account/finance/petty-cash/actions";
import type { ReimbursableExpenseRow } from "@/lib/modules/account/finance-overview";

export type PettyCashCard = {
  id: string;
  code: string | null;
  name: string;
  holderName: string | null;
  limitSatang: number | null;
  balanceSatang: number;
  lastTopUpText: string;
};

export type SourceOpt = { id: string; label: string };

const todayIso = () => new Date().toISOString().slice(0, 10);
const bahtToSatang = (raw: string) => Math.round((Number(raw.replace(/,/g, "")) || 0) * 100);
const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function PettyCashPanel({
  systemId,
  financePath,
  subTabs,
  rows,
  sources,
  newExpenseHref,
  initialTopUpId,
  initialReimburseId,
}: {
  systemId: string;
  financePath: string;
  subTabs: FinanceSubTab[];
  rows: PettyCashCard[];
  sources: SourceOpt[];
  newExpenseHref: string;
  /** "?topup=<id>"/"?reimburse=<id>" — เปิด modal ตรงจาก URL (เหมือน "?edit=<id>" ที่อื่นในแอป)
   * ใช้เป็นทางเข้าตรงสำหรับถ่ายภาพ QC ด้วย (ไม่ต้องไล่คลิกเมนู ⋮) */
  initialTopUpId?: string;
  initialReimburseId?: string;
}) {
  const router = useRouter();
  const [topUpFor, setTopUpFor] = useState<PettyCashCard | null>(() => rows.find((r) => r.id === initialTopUpId) ?? null);
  const [reimburseFor, setReimburseFor] = useState<PettyCashCard | null>(() => rows.find((r) => r.id === initialReimburseId) ?? null);

  const rowActionsFor = (r: PettyCashCard): RowActionItem[] => [
    { label: "เติมเงิน", icon: "swap", onClick: () => setTopUpFor(r) },
    { label: "เบิกชดเชย", icon: "in", onClick: () => setReimburseFor(r) },
    { label: "statement", icon: "list", href: `${financePath}/${r.id}/statement` },
  ];

  return (
    <div className="flex flex-col gap-4 pb-24">
      <PageHeader title="เงินสดย่อย (สำรองรับ-จ่าย)" desc={`ทั้งหมด ${rows.length} กล่อง`} />
      <FinanceSubTabsBar subTabs={subTabs} />

      {rows.length === 0 ? (
        <EmptyState text="ยังไม่มีบัญชีสำรองรับ-จ่าย — เพิ่มช่องทางประเภท 'สำรองรับ-จ่าย' ที่หน้าเงินสด/ธนาคาร/e-Wallet ก่อน" action={{ href: financePath, label: "ไปที่หน้าช่องทางการเงิน" }} />
      ) : (
        <>
          {/* เดสก์ท็อป: ตาราง */}
          <div className="card hidden overflow-x-auto p-0 md:block" data-testid="petty-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                  <th className="px-4 py-3 font-medium">ชื่อ</th>
                  <th className="px-4 py-3 font-medium">ผู้ถือ</th>
                  <th className="px-4 py-3 font-medium text-right">วงเงิน</th>
                  <th className="px-4 py-3 font-medium text-right">คงเหลือ</th>
                  <th className="px-4 py-3 font-medium">เติมล่าสุด</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--color-line)" }} data-testid={`petty-row-${r.code ?? r.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-[color:var(--color-muted)]">{r.code}</div>
                    </td>
                    <td className="px-4 py-3">{r.holderName ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.limitSatang != null ? formatBaht(r.limitSatang, { decimals: true }) : "ยังไม่กำหนด"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium" data-testid={`petty-balance-${r.id}`}>{formatBaht(r.balanceSatang, { decimals: true })}</td>
                    <td className="px-4 py-3 text-xs text-[color:var(--color-muted)]" data-testid={`petty-lasttopup-${r.id}`}>{r.lastTopUpText}</td>
                    <td className="px-4 py-3 text-right">
                      <RowActions label="ทำรายการ" testId={`petty-actions-${r.id}`} items={rowActionsFor(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* มือถือ 390: การ์ด */}
          <div className="flex flex-col gap-3 md:hidden" data-testid="petty-cards">
            {rows.map((r) => (
              <div key={r.id} className="card flex flex-col gap-2" data-testid={`petty-card-${r.code ?? r.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-xs text-[color:var(--color-muted)]">{r.code} · ผู้ถือ {r.holderName ?? "—"}</div>
                  </div>
                  <RowActions trigger="icon" label="ทำรายการ" testId={`petty-actions-m-${r.id}`} items={rowActionsFor(r)} />
                </div>
                <div className="text-xl font-semibold">{formatBaht(r.balanceSatang, { decimals: true })}</div>
                <div className="text-xs text-[color:var(--color-muted)]">วงเงิน {r.limitSatang != null ? formatBaht(r.limitSatang, { decimals: true }) : "ยังไม่กำหนด"} · {r.lastTopUpText}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {topUpFor && (
        <TopUpModal
          systemId={systemId}
          petty={topUpFor}
          sources={sources.filter((s) => s.id !== topUpFor.id)}
          onClose={() => setTopUpFor(null)}
          onDone={() => {
            setTopUpFor(null);
            router.refresh();
          }}
        />
      )}
      {reimburseFor && (
        <ReimburseModal
          systemId={systemId}
          petty={reimburseFor}
          sources={sources.filter((s) => s.id !== reimburseFor.id)}
          newExpenseHref={newExpenseHref}
          onClose={() => setReimburseFor(null)}
          onDone={() => {
            setReimburseFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TopUpModal({
  systemId,
  petty,
  sources,
  onClose,
  onDone,
}: {
  systemId: string;
  petty: PettyCashCard;
  sources: SourceOpt[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [transferId] = useState(uuid);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    setError("");
    const amt = bahtToSatang(amount);
    if (!sourceId) return setError("เลือกช่องทางต้นทาง");
    if (amt <= 0) return setError("จำนวนเงินต้องมากกว่า 0");
    start(async () => {
      const res = await topUpPettyCashActionDirect(systemId, { transferId, pettyId: petty.id, sourceFinanceId: sourceId, amount: amt, date, note });
      if (!res.ok) return setError(res.reason);
      onDone();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`เติมเงิน — ${petty.name}`}
      size="sm"
      sheetOnMobile
      testId="petty-topup-modal"
      actions={
        <>
          <button type="button" className="btn-sm" onClick={onClose} data-testid="petty-topup-cancel">ยกเลิก</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending} data-testid="petty-topup-submit">
            {pending ? "กำลังบันทึก…" : "เติมเงิน"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-[color:var(--color-danger)]" data-testid="petty-topup-error">{error}</p>}
        <FormField label="จากช่องทาง" required>
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="input" data-testid="petty-topup-source">
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="จำนวนเงิน (บาท)" required>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="input text-right" data-testid="petty-topup-amount" />
        </FormField>
        <FormField label="วันที่">
          <DateInput value={date} onChange={setDate} testId="petty-topup-date" />
        </FormField>
        <FormField label="หมายเหตุ">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="input" data-testid="petty-topup-note" />
        </FormField>
      </div>
    </Modal>
  );
}

function ReimburseModal({
  systemId,
  petty,
  sources,
  newExpenseHref,
  onClose,
  onDone,
}: {
  systemId: string;
  petty: PettyCashCard;
  sources: SourceOpt[];
  newExpenseHref: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [list, setList] = useState<ReimbursableExpenseRow[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listReimbursableExpensesAction(systemId, petty.id).then((rows) => {
      if (!cancelled) setList(rows);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId, petty.id]);

  const submit = () => {
    setError("");
    if (!pickedId) return setError("เลือกรายการค่าใช้จ่ายที่จะเบิกชดเชย");
    if (!sourceId) return setError("เลือกช่องทางต้นทาง");
    start(async () => {
      const res = await reimbursePettyCashActionDirect(systemId, { paymentId: pickedId, sourceFinanceId: sourceId, date, note });
      if (!res.ok) return setError(res.reason);
      onDone();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`เบิกชดเชย — ${petty.name}`}
      size="md"
      sheetOnMobile
      testId="petty-reimburse-modal"
      actions={
        <>
          <button type="button" className="btn-sm" onClick={onClose} data-testid="petty-reimburse-cancel">ยกเลิก</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending || !pickedId} data-testid="petty-reimburse-submit">
            {pending ? "กำลังบันทึก…" : "เบิกชดเชย"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-[color:var(--color-danger)]" data-testid="petty-reimburse-error">{error}</p>}
        {list === null ? (
          <p className="text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>
        ) : list.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการค่าใช้จ่ายที่จ่ายจากกล่องนี้ที่รอเบิกชดเชย</p>
            <Link href={newExpenseHref} className="text-sm" style={{ color: "var(--color-accent)" }} data-testid="petty-reimburse-new-expense">
              + บันทึกค่าใช้จ่ายใหม่
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" data-testid="petty-reimburse-list">
            {list.map((r) => (
              <label key={r.paymentId} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
                <input type="radio" name="reimburse-pick" checked={pickedId === r.paymentId} onChange={() => setPickedId(r.paymentId)} data-testid={`petty-reimburse-pick-${r.paymentId}`} />
                <span className="min-w-0 flex-1 truncate">{r.docNo ?? r.docType} · {r.description ?? "—"}</span>
                <span className="tabular-nums">{formatBaht(r.amountSatang, { decimals: true })}</span>
              </label>
            ))}
            <Link href={newExpenseHref} className="text-sm" style={{ color: "var(--color-accent)" }} data-testid="petty-reimburse-new-expense">
              + บันทึกค่าใช้จ่ายใหม่
            </Link>
          </div>
        )}
        <FormField label="จากช่องทาง (โอนเข้าชดเชย)" required>
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="input" data-testid="petty-reimburse-source">
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="วันที่">
          <DateInput value={date} onChange={setDate} testId="petty-reimburse-date" />
        </FormField>
        <FormField label="หมายเหตุ">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="input" data-testid="petty-reimburse-note" />
        </FormField>
      </div>
    </Modal>
  );
}

export default PettyCashPanel;
