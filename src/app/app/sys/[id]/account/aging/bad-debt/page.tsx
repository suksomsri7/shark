import Link from "next/link";
import { MoneyText } from "@/components/ui/MoneyText";
import { AllowanceForm, RecoveryForm, RecoveryVoidButton, WriteOffForm } from "@/components/account-v2/TaxT5Forms";
import { PrintButton } from "@/components/account-v2/PrintButton";
import { loadAccountSystem, accountPageGate } from "@/lib/modules/account/guard";
import { accountCan, assertAccountCan } from "@/lib/modules/account/access";
import { badDebtSummary } from "@/lib/modules/account/bad-debt";
import { previewWriteOffAction, recoverBadDebtAction, setDoubtfulAllowanceAction, voidBadDebtRecoveryAction, writeOffBadDebtAction } from "@/lib/modules/account/tax-t5-actions";
import { ymdTh } from "@/lib/modules/account/tax-calendar";
import { editorDetailPath } from "@/lib/modules/account/doc-editor-config";
import type { AccountDocType } from "@prisma/client";

// ACC T5.7 (เลน 2) — หนี้สูญ / ค่าเผื่อหนี้สงสัยจะสูญ (ปิด D7) · ตัวคิดเดียวกับ REST `bad-debt.summary` · `bad-debt.write-off` · `bad-debt.allowance`
export default async function BadDebtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  accountPageGate(auth, "account.report.view");
  assertAccountCan(auth, "account.report.view");
  const base = `/app/sys/${id}/account`;
  const s = await badDebtSummary({ tenantId, systemId });
  const canAdjust = accountCan(auth, "account.journal.adjust");
  const canRecord = accountCan(auth, "account.payment.record");
  const canVoid = accountCan(auth, "account.payment.void");
  const CH: Record<string, string> = { CASH: "เงินสด", TRANSFER: "โอนเงิน", PROMPTPAY: "พร้อมเพย์", CARD: "บัตร", E_WALLET: "e-Wallet", CHEQUE: "เช็ค", OTHER: "อื่น ๆ" };

  return (
    <div className="flex max-w-5xl flex-col gap-5" data-testid="bad-debt-page">
      <div>
        <div className="flex items-center justify-between gap-2">
          <Link href={`${base}/aging`} className="text-sm text-[color:var(--color-muted)] print:hidden">← อายุหนี้</Link>
          <span className="print:hidden"><PrintButton /></span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold">หนี้สูญและค่าเผื่อหนี้สงสัยจะสูญ</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          ณ {ymdTh(s.asOf)} · ตัดหนี้สูญลงเป็นค่าใช้จ่าย ไม่ลดรายได้ · ใช้ค่าเผื่อที่ตั้งไว้ก่อน · ยกเลิกได้ที่แท็บการชำระของเอกสาร
        </p>
      </div>

      <section className="card flex flex-col gap-3 p-5" data-testid="allowance-card">
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <span>ลูกหนี้การค้าคงเหลือ <b className="tabular-nums"><MoneyText satang={s.receivable} decimals /></b></span>
          <span>ค่าเผื่อหนี้สงสัยจะสูญ <b className="tabular-nums" data-testid="allowance-balance"><MoneyText satang={s.allowance} decimals /></b></span>
          <span>ลูกหนี้สุทธิ <b className="tabular-nums"><MoneyText satang={s.receivable - s.allowance} decimals /></b></span>
        </div>
        <div className="print:hidden">
          {canAdjust ? <AllowanceForm systemId={systemId} current={s.allowance} today={s.asOf} save={setDoubtfulAllowanceAction} /> : <p className="text-xs text-[color:var(--color-muted)]">ต้องมีสิทธิ์ปรับปรุงรายการบัญชีจึงจะตั้งค่าเผื่อได้</p>}
        </div>
      </section>

      <section className="flex flex-col gap-2" data-testid="bad-debt-candidates">
        <h2 className="text-sm font-medium">ลูกหนี้ที่เลยกำหนดชำระ ({s.candidates.length} ใบ)</h2>
        {s.tiers.tier1Max !== null && (
          <p className="text-xs text-[color:var(--color-muted)]">
            เงื่อนไขทางภาษีแบ่งตามยอดต่อราย: ไม่เกิน <MoneyText satang={s.tiers.tier1Max} decimals /> · ไม่เกิน {s.tiers.tier2Max !== null ? <MoneyText satang={s.tiers.tier2Max} decimals /> : "-"} · เกินกว่านั้น (รายละเอียดแสดงตอนกดตัดหนี้สูญ)
          </p>
        )}
        <div className="flex flex-col gap-2">
          {s.candidates.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ไม่มีลูกหนี้เลยกำหนด</p>}
          {s.candidates.map((c) => (
            <div key={c.documentId} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }} data-testid={`bad-debt-cand-${c.documentId}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <Link href={editorDetailPath(base, c.docType as AccountDocType, c.documentId)} className="font-medium underline">{c.docNo ?? "-"}</Link> · {c.contactName}
                </span>
                <span className="text-xs text-[color:var(--color-muted)]">
                  ครบกำหนด {c.dueDate ? ymdTh(c.dueDate) : "-"} · เลยมา {c.daysOverdue} วัน · ค้าง <b className="tabular-nums text-[color:var(--color-ink)]"><MoneyText satang={c.outstanding} decimals /></b>
                </span>
              </div>
              {canAdjust && (
                <div className="print:hidden">
                  <WriteOffForm systemId={systemId} documentId={c.documentId} docNo={c.docNo} outstanding={c.outstanding} today={s.asOf} preview={previewWriteOffAction} save={writeOffBadDebtAction} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2" data-testid="bad-debt-history">
        <h2 className="text-sm font-medium">ประวัติการตัดหนี้สูญ</h2>
        {s.writeOffs.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มี</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-line)" }}>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                  <th className="px-3 py-2">วันที่</th>
                  <th className="px-3 py-2">เอกสาร</th>
                  <th className="px-3 py-2">ลูกหนี้</th>
                  <th className="px-3 py-2 text-right">ยอด</th>
                  <th className="px-3 py-2">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {s.writeOffs.map((w) => (
                  <tr key={w.paymentId} className={`border-t ${w.voided ? "text-[color:var(--color-muted)] line-through" : ""}`} data-testid={`bad-debt-wo-${w.paymentId}`}>
                    <td className="px-3 py-1.5">{ymdTh(w.date)}</td>
                    <td className="px-3 py-1.5">{w.docNo ?? "-"}</td>
                    <td className="px-3 py-1.5">{w.contactName}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={w.amount} decimals /></td>
                    <td className="px-3 py-1.5">{w.voided ? "ยกเลิกแล้ว" : (w.note ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ACC T5c ▸ หนี้สูญได้รับคืน — ลงเป็นรายได้ อ้างใบที่ตัดหนี้สูญ */}
      <section className="flex flex-col gap-2 break-inside-avoid" data-testid="bad-debt-recoverable">
        <h2 className="text-sm font-medium">ใบที่ตัดหนี้สูญแล้ว — รับเงินคืนภายหลัง</h2>
        <p className="text-xs text-[color:var(--color-muted)]">เงินที่ได้รับคืนหลังตัดหนี้สูญ ลงเป็นรายได้ "หนี้สูญได้รับคืน" ในวันที่ได้รับ (ไม่เปิดลูกหนี้ใบเดิมกลับมา)</p>
        {s.writtenDocs.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีใบที่ตัดหนี้สูญ</p>
        ) : (
          s.writtenDocs.map((w) => (
            <div key={w.documentId} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }} data-testid={`bad-debt-written-${w.documentId}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><b>{w.docNo ?? "-"}</b> · {w.contactName}</span>
                <span className="text-xs text-[color:var(--color-muted)]">
                  ตัดหนี้สูญ <b className="tabular-nums text-[color:var(--color-ink)]"><MoneyText satang={w.writtenOff} decimals /></b> · รับคืนแล้ว <b className="tabular-nums text-[color:var(--color-ink)]"><MoneyText satang={w.recovered} decimals /></b> · รับคืนได้อีก <b className="tabular-nums text-[color:var(--color-ink)]" data-testid={`bad-debt-recoverable-${w.documentId}`}><MoneyText satang={w.recoverable} decimals /></b>
                </span>
              </div>
              {canRecord && w.recoverable > 0 && (
                <div className="print:hidden">
                  <RecoveryForm systemId={systemId} documentId={w.documentId} docNo={w.docNo} recoverable={w.recoverable} today={s.asOf} save={recoverBadDebtAction} />
                </div>
              )}
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2 break-inside-avoid" data-testid="bad-debt-recoveries">
        <h2 className="text-sm font-medium">ประวัติหนี้สูญได้รับคืน</h2>
        {s.recoveries.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มี</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-line)" }}>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                  <th className="px-3 py-2">วันที่</th>
                  <th className="px-3 py-2">เอกสาร</th>
                  <th className="px-3 py-2">ลูกหนี้</th>
                  <th className="px-3 py-2">ช่องทาง</th>
                  <th className="px-3 py-2 text-right">ยอด</th>
                  <th className="px-3 py-2">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {s.recoveries.map((x) => (
                  <tr key={x.recoveryId} className={`border-t ${x.voided ? "text-[color:var(--color-muted)] line-through" : ""}`} data-testid={`bad-debt-rec-${x.recoveryId}`}>
                    <td className="px-3 py-1.5">{ymdTh(x.date)}</td>
                    <td className="px-3 py-1.5">{x.docNo ?? "-"}</td>
                    <td className="px-3 py-1.5">{x.contactName}</td>
                    <td className="px-3 py-1.5">{CH[x.channel] ?? x.channel}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={x.amount} decimals /></td>
                    <td className="px-3 py-1.5">
                      {x.voided ? "ยกเลิกแล้ว" : (x.note ?? "")}
                      {!x.voided && canVoid && <span className="ml-2"><RecoveryVoidButton systemId={systemId} recoveryId={x.recoveryId} save={voidBadDebtRecoveryAction} /></span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
