import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listCheques,
  chequeSummary,
  CHEQUE_DIR_LABEL,
  CHEQUE_STATUS_LABEL,
  chequeStatusTone,
} from "@/lib/modules/account/cheque";
import { listFinanceAccounts } from "@/lib/modules/account/finance";
import type { AccountChequeDirection } from "@prisma/client";
import {
  createChequeAction,
  depositChequeAction,
  clearChequeAction,
  bounceChequeAction,
  voidChequeAction,
} from "./actions";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import MoneyText from "@/components/ui/MoneyText";
import FormField from "@/components/ui/FormField";
import StatusChip from "@/components/ui/StatusChip";
import { TabPills } from "@/components/ui/TabPills";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatThaiDate as fmtDate } from "@/lib/ui/date";


export default async function ChequePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dir?: string; err?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { dir, err, ok } = await searchParams;
  const direction: AccountChequeDirection = dir === "OUT" ? "OUT" : "IN";
  const { tenantId, systemId } = await loadAccountSystem(id);
  const base = `/app/sys/${id}/account`;
  const [cheques, summary, finances] = await Promise.all([
    listCheques(tenantId, systemId, { direction }),
    chequeSummary(tenantId, systemId),
    listFinanceAccounts(tenantId, systemId),
  ]);

  const tabs = [
    { key: "IN", label: "เช็ครับ", href: `${base}/cheque?dir=IN` },
    { key: "OUT", label: "เช็คจ่าย", href: `${base}/cheque?dir=OUT` },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="ทะเบียนเช็ค — รับ / จ่าย" back={{ href: base, label: "ระบบบัญชี" }} />

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok === "1" && <p className="text-sm font-medium">บันทึกสำเร็จ</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabPills tabs={tabs} active={direction} />
        <div className="text-sm text-[color:var(--color-muted)]">
          {direction === "IN" ? "เช็ครับรอเรียกเก็บ " : "เช็คจ่ายรอเรียกเก็บ "}
          <span className="font-semibold text-[color:var(--color-ink)]">
            <MoneyText satang={direction === "IN" ? summary.inPending : summary.outPending} decimals />
          </span>
        </div>
      </div>

      <DataList
        items={cheques.map((c) => {
          const canDeposit = c.direction === "IN" && c.status === "ON_HAND";
          const canClear =
            (c.direction === "IN" && (c.status === "DEPOSITED" || c.status === "ON_HAND")) ||
            (c.direction === "OUT" && c.status === "ISSUED");
          const canBounce =
            c.direction === "IN" && ["ON_HAND", "DEPOSITED", "CLEARED"].includes(c.status);
          const canVoid = c.direction === "OUT" && c.status === "ISSUED";
          return {
            key: c.id,
            primary: (
              <span className="font-medium">
                เลขที่ {c.chequeNo} · {c.bankName}
                {c.bankBranch ? ` (${c.bankBranch})` : ""}
              </span>
            ),
            secondary: (
              <>
                ลงวันที่หน้าเช็ค {fmtDate(c.chequeDate)}
                {c.clearedAt ? ` · เรียกเก็บ ${fmtDate(c.clearedAt)}` : ""}
                {c.note ? ` · ${c.note}` : ""}
              </>
            ),
            trailing: (
              <div className="flex flex-col items-end gap-1">
                <div className="font-semibold">
                  <MoneyText satang={c.amount} decimals />
                </div>
                <StatusChip
                  value={c.status}
                  map={CHEQUE_STATUS_LABEL}
                  tone={chequeStatusTone(c.status)}
                />
                <div className="flex gap-2 text-xs">
                  {canDeposit && (
                    <ConfirmDialog
                      action={depositChequeAction}
                      fields={{ systemId, id: c.id, dir: direction }}
                      triggerLabel="นำฝาก"
                      triggerClassName="underline"
                      title="นำเช็คนี้เข้าฝากธนาคาร?"
                      confirmLabel="นำฝาก"
                    />
                  )}
                  {canClear && (
                    <ConfirmDialog
                      action={clearChequeAction}
                      fields={{ systemId, id: c.id, dir: direction }}
                      triggerLabel="เรียกเก็บได้"
                      triggerClassName="underline"
                      title="ยืนยันเช็คเรียกเก็บได้?"
                      detail={direction === "IN" ? "เงินเข้าธนาคาร (Dr ธนาคาร / Cr เช็ครับรอนำฝาก)" : "ตัดเงินธนาคาร (Dr เช็คจ่ายรอเรียกเก็บ / Cr ธนาคาร)"}
                      confirmLabel="ยืนยัน"
                    />
                  )}
                  {canBounce && (
                    <ConfirmDialog
                      action={bounceChequeAction}
                      fields={{ systemId, id: c.id, dir: direction }}
                      triggerLabel="เช็คเด้ง"
                      triggerClassName="text-[color:var(--color-danger)] underline"
                      title="บันทึกเช็คเด้ง?"
                      detail="ระบบจะกลับรายการและตั้งลูกหนี้กลับ"
                      confirmLabel="ยืนยันเด้ง"
                      danger
                    />
                  )}
                  {canVoid && (
                    <ConfirmDialog
                      action={voidChequeAction}
                      fields={{ systemId, id: c.id, dir: direction }}
                      triggerLabel="ยกเลิก"
                      triggerClassName="text-[color:var(--color-danger)] underline"
                      title="ยกเลิกเช็คจ่ายใบนี้?"
                      detail="ระบบจะกลับรายการและตั้งเจ้าหนี้กลับ"
                      confirmLabel="ยืนยันยกเลิก"
                      danger
                    />
                  )}
                </div>
              </div>
            ),
          };
        })}
        empty={`ยังไม่มี${CHEQUE_DIR_LABEL[direction]} — เพิ่มด้านล่าง`}
      />

      <Section title={`เพิ่ม${CHEQUE_DIR_LABEL[direction]}`} card>
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
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="หมายเหตุ">
              <input name="note" className="input" />
            </FormField>
          </div>
          <SubmitButton className="sm:col-span-2 sm:justify-self-start">
            + เพิ่ม{CHEQUE_DIR_LABEL[direction]}
          </SubmitButton>
        </form>
      </Section>
    </div>
  );
}
