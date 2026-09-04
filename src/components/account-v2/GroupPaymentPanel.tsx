"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatDateTh } from "@/lib/ui/date";
import { PAY_CHANNEL_LABEL } from "@/lib/ui/status-labels";
import {
  groupPanelDataAction,
  recordGroupPaymentAction,
  voidGroupPaymentAction,
} from "@/lib/modules/account/group-actions";
import type { GroupPanelData } from "@/lib/modules/account/group";
import { SlideOver } from "./SlideOver";
import { DateInput } from "./DateInput";
import { MoneyInput } from "./MoneyInput";
import { WHT_TYPE_OPTIONS } from "./doc-editor-types";

// ─────────────────────────────────────────────────────────────
// GroupPaymentPanel — "รับชำระใบวางบิลรวม / บันทึกจ่ายใบรวมจ่าย" (§5.2 K + §3 BN/CP) · WO 1.7
//
// โครงยึดภาพ g2 (แผงชำระเงินของ WO 1.4): หัวการ์ด + สลับ [พื้นฐาน|ขั้นสูง] → กล่องเส้นประ 4 ช่อง
// (วันที่ชำระ · ช่องทาง · จำนวนเงิน · หมายเหตุ ≤20) → (ขั้นสูง) ค่าธรรมเนียม/เช็ค/หัก ณ ที่จ่ายรายใบ
// → สรุป 3 ช่อง + ยอดคงค้างหลังชำระ
// **ต่างจาก g2 ตรงที่**: กลุ่มมี "ใบลูก" ⇒ เพิ่มตารางการจัดสรรอัตโนมัติ (FIFO ตามวันครบกำหนด)
// และภาษีหัก ณ ที่จ่ายเป็น "รายใบลูก" (อัตราคนละใบได้ — 50 ทวิ ออกตามใบที่ถูกหักจริง)
//
// 🔴 ตัวเลขบนจอ = พรีวิว · server (group.ts) จัดสรรใหม่และตรวจยอด/สิทธิ์ทุกครั้งก่อนลงบัญชี
// ─────────────────────────────────────────────────────────────

type WhtRow = { on: boolean; incomeType: string; rateBp: number; amountSatang: number };

const emptyWht = (): WhtRow => ({ on: false, incomeType: "M40_8", rateBp: 300, amountSatang: 0 });

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm"
      data-testid={testId}
    >
      <span
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ background: checked ? "var(--color-ink)" : "var(--color-line)" }}
      >
        <span
          className="inline-block h-5 w-5 rounded-full transition-transform"
          style={{ background: "var(--color-surface)", transform: `translateX(${checked ? 22 : 2}px)` }}
        />
      </span>
      <span className="text-[color:var(--color-muted)]">{label}</span>
    </button>
  );
}

function Stat({ label, value, danger, testId }: { label: string; value: number; danger?: boolean; testId: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      <span
        className="text-[15px] font-semibold tabular-nums"
        style={danger ? { color: "var(--color-danger)" } : undefined}
        data-testid={testId}
      >
        <MoneyText satang={value} decimals />
      </span>
    </div>
  );
}

export function GroupPaymentPanel({
  systemId,
  docId,
  triggerLabel,
  triggerClassName,
}: {
  systemId: string;
  docId: string;
  triggerLabel: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GroupPanelData | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [financeAccountId, setFinanceAccountId] = useState<string | null>(null);
  const [tieOff, setTieOff] = useState(0);
  const [note, setNote] = useState("");
  const [fee, setFee] = useState(0);
  const [chequeOn, setChequeOn] = useState(false);
  const [chequeNo, setChequeNo] = useState("");
  const [bankName, setBankName] = useState("");
  const [wht, setWht] = useState<Record<string, WhtRow>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [pending, startTransition] = useTransition();
  const [voidingKey, setVoidingKey] = useState("");
  const [voidReason, setVoidReason] = useState("บันทึกผิดรายการ");
  const keyRef = useRef("");

  const load = useCallback(
    (reset: boolean) =>
      startTransition(async () => {
        const d = await groupPanelDataAction(systemId, docId);
        setData(d);
        if (d && reset) {
          setTieOff(d.outstanding);
          setFinanceAccountId(d.channels[0]?.id ?? null);
          setWht(Object.fromEntries(d.children.map((c) => [c.id, emptyWht()])));
          keyRef.current = `grp-${Date.now()}`;
        }
      }),
    [systemId, docId],
  );

  const openPanel = () => {
    setError("");
    setOk("");
    setOpen(true);
    load(true);
  };

  // จัดสรรแบบเดียวกับ server (FIFO ตามลำดับที่ server ส่งมา — เรียงตามวันครบกำหนดแล้ว)
  const allocations = useMemo(() => {
    let left = Math.max(0, tieOff);
    const out: { id: string; docNo: string | null; dueDate: string | null; outstanding: number; take: number }[] = [];
    for (const c of data?.children ?? []) {
      const take = Math.min(left, c.outstanding);
      out.push({ id: c.id, docNo: c.docNo, dueDate: c.dueDate, outstanding: c.outstanding, take: Math.max(0, take) });
      left -= take;
      if (left < 0) left = 0;
    }
    return out;
  }, [data, tieOff]);

  const whtTotal = useMemo(
    () => allocations.reduce((s, a) => s + (a.take > 0 && wht[a.id]?.on ? wht[a.id].amountSatang : 0), 0),
    [allocations, wht],
  );
  const cashTotal = Math.max(0, tieOff - whtTotal);
  const outstandingAfter = Math.max(0, (data?.outstanding ?? 0) - tieOff);

  const setWhtOn = (childId: string, on: boolean, base: number) =>
    setWht((prev) => {
      const cur = prev[childId] ?? emptyWht();
      return {
        ...prev,
        [childId]: on
          ? { ...cur, on: true, amountSatang: Math.round((base * cur.rateBp) / 10000) }
          : { ...cur, on: false, amountSatang: 0 },
      };
    });
  const setWhtType = (childId: string, incomeType: string, base: number) =>
    setWht((prev) => {
      const cur = prev[childId] ?? emptyWht();
      const rate = WHT_TYPE_OPTIONS.find((o) => o.value === incomeType)?.defaultRateBp ?? cur.rateBp;
      return { ...prev, [childId]: { ...cur, incomeType, rateBp: rate, amountSatang: Math.round((base * rate) / 10000) } };
    });
  const setWhtAmount = (childId: string, amount: number) =>
    setWht((prev) => ({ ...prev, [childId]: { ...(prev[childId] ?? emptyWht()), amountSatang: Math.max(0, amount) } }));

  const submit = () =>
    startTransition(async () => {
      setError("");
      setOk("");
      if (tieOff <= 0) {
        setError("กรุณากรอกจำนวนเงินมากกว่า 0");
        return;
      }
      const res = await recordGroupPaymentAction(
        systemId,
        docId,
        {
          paidAt,
          financeAccountId,
          tieOffSatang: tieOff,
          note,
          feeSatang: advanced ? fee : 0,
          wht: allocations
            .filter((a) => a.take > 0 && wht[a.id]?.on && wht[a.id].amountSatang > 0)
            .map((a) => ({
              childDocId: a.id,
              incomeType: wht[a.id].incomeType as never,
              rateBp: wht[a.id].rateBp,
              amountSatang: wht[a.id].amountSatang,
            })),
          cheque:
            advanced && chequeOn && chequeNo.trim()
              ? { chequeNo: chequeNo.trim(), bankName: bankName.trim(), chequeDate: paidAt }
              : null,
        },
        keyRef.current,
      );
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setOk(
        res.certNos.length > 0
          ? `บันทึกแล้ว · กระจายลงเอกสาร ${res.recorded} ใบ · ออกเอกสารหัก ณ ที่จ่าย ${res.certNos.join(", ")}`
          : `บันทึกแล้ว · กระจายลงเอกสาร ${res.recorded} ใบ`,
      );
      keyRef.current = `grp-${Date.now()}`;
      load(true);
      router.refresh();
    });

  const confirmVoid = (batchKey: string) =>
    startTransition(async () => {
      setError("");
      const res = await voidGroupPaymentAction(systemId, docId, batchKey, voidReason.trim() || "ยกเลิกการชำระ");
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setVoidingKey("");
      setOk(`ยกเลิกการชำระแล้ว ${res.voided} รายการ (ระบบกลับรายการบัญชีของทุกใบให้อัตโนมัติ)`);
      load(true);
      router.refresh();
    });

  const isExpense = data?.side === "expense";
  const t = {
    title: isExpense ? "บันทึกจ่าย" : "รับชำระเงิน",
    amountLabel: "จำนวนเงิน",
    totalPaid: isExpense ? "จ่ายรวม" : "รับชำระรวม",
    totalWht: isExpense ? "หัก ณ ที่จ่ายรวม" : "ถูกหัก ณ ที่จ่ายรวม",
    whtToggle: isExpense ? "หัก ณ ที่จ่าย" : "ถูกหัก ณ ที่จ่าย",
    chequeToggle: isExpense ? "จ่ายเป็นเช็ค" : "รับเป็นเช็ค",
    certHint: isExpense
      ? "สร้างหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ให้อัตโนมัติ"
      : "สร้างเอกสารหัก ณ ที่จ่าย (WTI) ให้อัตโนมัติ",
  };

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? "btn btn-primary h-11 text-sm md:h-9"}
        onClick={openPanel}
        data-testid="btn-open-group-payment"
      >
        {triggerLabel}
      </button>
      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={`${t.title} · ${data?.docNo ?? ""}`}
        testId="group-payment-slideover"
        actions={
          <button
            type="button"
            className="btn btn-primary h-11 text-sm md:h-9"
            onClick={submit}
            disabled={pending || !data?.canRecord}
            data-testid="btn-record-group-payment"
          >
            {pending ? "กำลังบันทึก…" : "บันทึกการชำระ"}
          </button>
        }
      >
        {error && (
          <p className="mb-2 text-sm text-[color:var(--color-danger)]" data-testid="group-pay-error">
            {error}
          </p>
        )}
        {ok && (
          <p className="mb-2 text-sm text-[color:var(--color-accent)]" data-testid="group-pay-ok">
            {ok}
          </p>
        )}
        {!data ? (
          <p className="text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-[color:var(--color-muted)]" data-testid="group-pay-hint">
              เงินที่บันทึกจะถูกกระจายเข้าเอกสารในกลุ่มอัตโนมัติ — ใบที่ครบกำหนดก่อนได้ก่อน (FIFO)
            </p>

            {!data.canRecord && (
              <p className="text-sm text-[color:var(--color-muted)]" data-testid="group-pay-closed">
                {data.docLabel}นี้รับ/จ่ายชำระไม่ได้ในสถานะปัจจุบัน
              </p>
            )}

            {data.canRecord && (
              <div className="card flex flex-col gap-4" data-testid="group-pay-section">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">{t.title}</h2>
                  <span className="flex overflow-hidden rounded-lg border text-sm" role="group" aria-label="ระดับรายละเอียดการชำระ">
                    {([false, true] as const).map((adv) => (
                      <button
                        key={String(adv)}
                        type="button"
                        className="px-3 py-1.5"
                        aria-pressed={advanced === adv}
                        style={
                          advanced === adv
                            ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                            : undefined
                        }
                        onClick={() => setAdvanced(adv)}
                        data-testid={adv ? "group-pay-mode-advanced" : "group-pay-mode-basic"}
                      >
                        {adv ? "ขั้นสูง" : "พื้นฐาน"}
                      </button>
                    ))}
                  </span>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3" data-testid="group-pay-box">
                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                      วันที่ชำระ
                      <DateInput value={paidAt} onChange={setPaidAt} testId="group-pay-date" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                      ช่องทาง
                      <select
                        className="input"
                        value={financeAccountId ?? ""}
                        onChange={(e) => setFinanceAccountId(e.target.value || null)}
                        data-testid="group-pay-channel"
                      >
                        <option value="">— เลือกช่องทาง —</option>
                        {data.channels.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.bankName ? `${c.bankName} ${c.name}` : c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                      {t.amountLabel}
                      <MoneyInput value={tieOff} onChangeSatang={setTieOff} testId="group-pay-amount" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                      หมายเหตุ
                      <input
                        className="input"
                        maxLength={20}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        data-testid="group-pay-note"
                      />
                    </label>
                  </div>

                  {advanced && (
                    <div className="flex flex-wrap items-end gap-4">
                      <label className="flex w-40 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                        ค่าธรรมเนียมธนาคาร
                        <MoneyInput value={fee} onChangeSatang={setFee} testId="group-pay-fee" />
                      </label>
                      <Toggle checked={chequeOn} onChange={setChequeOn} label={t.chequeToggle} testId="group-pay-cheque-toggle" />
                      {chequeOn && (
                        <>
                          <label className="flex w-40 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                            เลขที่เช็ค
                            <input
                              className="input"
                              maxLength={40}
                              value={chequeNo}
                              onChange={(e) => setChequeNo(e.target.value)}
                              data-testid="group-pay-cheque-no"
                            />
                          </label>
                          <label className="flex w-40 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                            ธนาคาร
                            <input
                              className="input"
                              maxLength={80}
                              value={bankName}
                              onChange={(e) => setBankName(e.target.value)}
                              data-testid="group-pay-cheque-bank"
                            />
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* ตารางการจัดสรร (FIFO) — ใบที่ครบกำหนดก่อนได้ก่อน */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm" data-testid="group-alloc-table">
                    <thead>
                      <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
                        <th className="py-2 font-normal">เลขที่</th>
                        <th className="py-2 font-normal">ครบกำหนด</th>
                        <th className="py-2 text-right font-normal">ค้างชำระ</th>
                        <th className="py-2 text-right font-normal">จัดสรร</th>
                        {advanced && <th className="py-2 font-normal">{t.whtToggle}</th>}
                        <th className="py-2 text-right font-normal">เงินจริง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map((a, i) => {
                        const w = wht[a.id] ?? emptyWht();
                        const whtAmt = a.take > 0 && w.on ? w.amountSatang : 0;
                        return (
                          <tr key={a.id} className="border-b last:border-0" data-testid={`alloc-row-${i + 1}`}>
                            <td className="py-2">{a.docNo ?? "(ร่าง)"}</td>
                            <td className="py-2">{a.dueDate ? formatDateTh(a.dueDate) : "—"}</td>
                            <td className="py-2 text-right tabular-nums">
                              <MoneyText satang={a.outstanding} decimals />
                            </td>
                            <td className="py-2 text-right tabular-nums font-medium" data-testid={`alloc-take-${i + 1}`}>
                              <MoneyText satang={a.take} decimals />
                            </td>
                            {advanced && (
                              <td className="py-2">
                                <span className="flex flex-wrap items-center gap-2">
                                  <Toggle
                                    checked={w.on}
                                    onChange={(v) => setWhtOn(a.id, v, a.take)}
                                    label=""
                                    testId={`alloc-wht-toggle-${i + 1}`}
                                  />
                                  {w.on && (
                                    <>
                                      <select
                                        className="input w-40"
                                        value={w.incomeType}
                                        onChange={(e) => setWhtType(a.id, e.target.value, a.take)}
                                        data-testid={`alloc-wht-type-${i + 1}`}
                                      >
                                        {WHT_TYPE_OPTIONS.map((o) => (
                                          <option key={o.value} value={o.value}>
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                      <span className="w-28">
                                        <MoneyInput
                                          value={w.amountSatang}
                                          onChangeSatang={(v) => setWhtAmount(a.id, v)}
                                          testId={`alloc-wht-amount-${i + 1}`}
                                        />
                                      </span>
                                    </>
                                  )}
                                </span>
                              </td>
                            )}
                            <td className="py-2 text-right tabular-nums">
                              <MoneyText satang={Math.max(0, a.take - whtAmt)} decimals />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {whtTotal > 0 && (
                  <p
                    className="rounded-lg px-3 py-2 text-xs"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-accent)" }}
                    data-testid="group-pay-cert-hint"
                  >
                    {t.certHint}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-3">
                  <Stat label={`ยอด${data.docLabel}`} value={data.grandTotal} testId="group-pay-summary-doc" />
                  <Stat label={t.totalPaid} value={cashTotal} testId="group-pay-summary-paid" />
                  <Stat label={t.totalWht} value={whtTotal} danger testId="group-pay-summary-wht" />
                  <Stat label="ยอดคงค้างหลังชำระ" value={outstandingAfter} testId="group-pay-outstanding" />
                </div>
              </div>
            )}

            {data.batches.length > 0 && (
              <div className="card flex flex-col gap-2" data-testid="group-pay-history">
                <h3 className="text-sm font-semibold">การชำระที่บันทึกแล้ว</h3>
                {data.batches.map((b, i) => (
                  <div key={b.batchKey} className="flex flex-col gap-1 border-b pb-1 text-sm last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={b.voided ? "line-through opacity-60" : ""}>
                        ครั้งที่ {i + 1} · {formatDateTh(b.paidAt)} ·{" "}
                        {b.financeName ?? PAY_CHANNEL_LABEL[b.channel as keyof typeof PAY_CHANNEL_LABEL] ?? b.channel} ·
                        กระจาย {b.children.length} ใบ
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">
                          <MoneyText satang={b.amount + b.whtAmount} decimals />
                        </span>
                        {!b.voided && (
                          <button
                            type="button"
                            className="text-xs text-[color:var(--color-danger)] underline"
                            onClick={() => {
                              setVoidingKey(b.batchKey);
                              setVoidReason("บันทึกผิดรายการ");
                            }}
                            data-testid={`group-pay-void-${i + 1}`}
                          >
                            ยกเลิก
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      {b.children.map((c) => `${c.docNo ?? "(ร่าง)"} ฿${((c.amount + c.whtAmount) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`).join(" · ")}
                    </div>
                    {voidingKey === b.batchKey && (
                      <div
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2"
                        data-testid={`group-pay-void-confirm-${i + 1}`}
                      >
                        <label className="flex-1 text-xs text-[color:var(--color-muted)]">
                          เหตุผลการยกเลิก
                          <input
                            className="input mt-1"
                            maxLength={200}
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                            data-testid={`group-pay-void-reason-${i + 1}`}
                          />
                        </label>
                        <button type="button" className="btn-sm" onClick={() => setVoidingKey("")}>
                          ไม่ยกเลิก
                        </button>
                        <button
                          type="button"
                          className="btn-sm"
                          style={{ color: "var(--color-danger)" }}
                          disabled={pending}
                          onClick={() => confirmVoid(b.batchKey)}
                          data-testid={`group-pay-void-confirm-btn-${i + 1}`}
                        >
                          ยืนยันยกเลิก
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </>
  );
}

export default GroupPaymentPanel;
