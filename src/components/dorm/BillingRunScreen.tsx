"use client";
// SVC D.8 ▸ จอ หอ 04 "ออกบิลรอบเดือน — ตรวจก่อนส่ง" — ภาพ ledger/design-dorm/04-billing-run.png · สัญญา DOM ledger/svc-briefs/svc-brief-d.8.md §5
//   • ข้อมูลทั้งหมดมาจากผู้เรียก (billRunModel ของ facade หอ) — ไฟล์นี้ import จากโมดูลได้เฉพาะ type · action รับทาง prop
//     (ไม่ลาก prisma/โมดูลฝั่ง server/actions/next) ⇒ render ด้วย renderToStaticMarkup ได้ · ลิงก์ใช้ <a>
//   • ตัวเลขทุกตัวมาจากบิลที่บันทึกแล้ว (ไม่คำนวณเงินใหม่บนจอ) · เงินแสดงจากสตางค์จำนวนเต็ม
//   • ไม่มีเบอร์โทรผู้เช่า · ข้อความบริการล้วน (ข้อห้ามตามประกาศ สคบ.)
//   • เดสก์ท็อป 1440 = ตาราง + แผงตัวอย่างบิลขวา + แถบปุ่มล่าง · มือถือ 390 = ซ้อนลง ตารางเลื่อนในกรอบตัวเอง ไม่ล้นแนวนอน
import { useState } from "react";
import type { BillPreview, BillRunModel, BillRunRow } from "@/lib/modules/dorm";

type ActionFn = (input: unknown) => Promise<unknown>;
export type BillingRunActions = {
  prepare: ActionFn;
  extraLines: ActionFn;
  release: ActionFn;
  schedule: ActionFn;
  send: ActionFn;
  adjust: ActionFn;
  exportCsv: ActionFn;
  /** SVC D.3 ▸ ยกเลิกใบกำกับภาษีแล้วออกฉบับใหม่แทน (ไม่ส่ง = ไม่แสดงปุ่ม) ◂ */
  reissueTaxInvoice?: ActionFn;
  /** SVC D.3 ▸ ออกใบกำกับภาษีของบิลที่ส่งแล้วแต่ยังไม่มี (ทางกู้) ◂ */
  issueTaxInvoice?: ActionFn;
};
export type BillingRunScreenProps = { model: BillRunModel; unitSlug: string; actions: BillingRunActions };

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const FLAG_TH: Record<string, string> = { HIGH: "สูงกว่าปกติ", LOW: "ต่ำกว่าปกติ", BACKWARDS: "เลขถอยหลัง", VACANT_USAGE: "ห้องว่างมีการใช้" };
const HOLD_TH: Record<string, string> = {
  METER_HIGH: "มิเตอร์สูงกว่าปกติ — พักบิลรอตรวจเลข",
  METER_LOW: "มิเตอร์ต่ำกว่าปกติ — พักบิลรอตรวจเลข",
  METER_BACKWARDS: "เลขมิเตอร์ถอยหลัง — พักบิลรอตรวจ",
  METER_VACANT_USAGE: "ห้องว่างมีการใช้น้ำไฟ — พักบิลรอตรวจ",
  METER_UNREADABLE: "อ่านหน่วยมิเตอร์ไม่ได้ — พักบิลรอตรวจ",
  NO_READING: "ยังไม่ได้จดมิเตอร์ — จดแล้วกดปล่อยบิล",
  BOOKING_FEE_FIRST_RENT: "บิลแรกที่เงินจองหักเข้าค่าห้อง — ตรวจยอดก่อนปล่อย",
  CALC_ERROR: "คำนวณบิลไม่ได้ — ตรวจค่าตั้งน้ำไฟและสัญญา",
  BUYER_TAX_ID_INVALID: "เลขผู้เสียภาษีของผู้เช่าไม่ถูกต้อง — แก้ข้อมูลผู้เช่าแล้วปล่อยบิล", // SVC D.3
  "BUYER_TAX_ID_INVALID:BRANCH": "รหัสสาขาของผู้เช่าไม่ถูกต้อง (5 หลัก) — แก้ข้อมูลผู้เช่าแล้วปล่อยบิล", // SVC D.3
  "BUYER_TAX_ID_INVALID:OTHER": "ข้อมูลผู้เช่าสำหรับใบกำกับภาษีไม่ถูกต้อง — แก้แล้วปล่อยบิล", // SVC D.3
};
const CHANNEL_TH: Record<string, string> = { LINE: "LINE", SMS: "ลิงก์ SMS", PRINT: "พิมพ์" };
const STATUS_TH: Record<string, string> = { DRAFT: "รอส่ง", HELD: "พักไว้", SENT: "ส่งแล้ว", PARTIALLY_PAID: "จ่ายบางส่วน", PAID: "จ่ายครบ", VOID: "ยกเลิก", SKIPPED: "ไม่ออกบิล" };
const PREVIEW_LABEL: Record<string, string> = { RENT: "ค่าห้อง", COMMON: "ส่วนกลาง", ELEC: "ไฟ", WATER: "น้ำ", LATE_FEE: "ค่าปรับชำระล่าช้า" };

const pad2 = (n: number) => String(n).padStart(2, "0");
/** สตางค์ ⇒ "5,486.00" (สองตำแหน่งเสมอ) */
function money(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${satang < 0 ? "-" : ""}${Math.trunc(a / 100).toLocaleString("en-US")}.${pad2(a % 100)}`;
}
/** สตางค์ ⇒ "153,000" (ตัด .00 เมื่อเป็นบาทเต็ม) */
function moneyShort(satang: number): string {
  return Math.abs(Math.trunc(satang)) % 100 === 0 ? `${satang < 0 ? "-" : ""}${Math.trunc(Math.abs(satang) / 100).toLocaleString("en-US")}` : money(satang);
}
const int = (n: number) => n.toLocaleString("en-US");
/** "2026-11" ⇒ "พ.ย. 2569" */
function thMonth(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  return m ? `${MONTHS_SHORT[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : p;
}
/** "2026-11-05" ⇒ "5 พ.ย. 2569" (อ่านจากข้อความ ไม่ผ่าน Date) */
function thDate(ymd: string | null): string {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  return m ? `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : "—";
}
const holdTh = (code: string | null) => (code ? (HOLD_TH[code] ?? HOLD_TH[code.split(":")[0]] ?? "พักบิลรอตรวจ") : "");
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const outcome = (r: unknown): { ok: boolean; reason: string } =>
  isRec(r) && r.ok === true ? { ok: true, reason: "" } : { ok: false, reason: isRec(r) && typeof r.reason === "string" && r.reason ? r.reason : "ทำรายการไม่สำเร็จ ลองอีกครั้ง" };

const btnBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const btnGhost = `${btnBase} border-[color:var(--color-line)] bg-[color:var(--color-surface)]`;
const btnPrimary = `${btnBase} border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]`;
const inputCls = "min-h-11 min-w-0 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm";

function Steps({ model }: { model: BillRunModel }) {
  const meterDone = model.meter.rooms > 0 && model.meter.done >= model.meter.rooms;
  const s = model.status;
  const cur = s === "SENT" || s === "CLOSED" ? 4 : s === "NONE" && !meterDone ? 1 : 2;
  const items = [`จดมิเตอร์ ${model.meter.done}/${model.meter.rooms}`, "ตรวจบิล", "ส่ง LINE", "เก็บเงิน"];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {items.map((label, i) => {
        const n = i + 1;
        const state = n < cur || (n === 1 && s !== "NONE") ? "done" : n === cur ? "current" : "todo";
        return (
          <li key={label} data-run-step={String(n)} data-step-state={state} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true" className="h-px w-6 bg-[color:var(--color-line)]" /> : null}
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
                state === "current" ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-[color:var(--color-surface)]" : state === "done" ? "border-[color:var(--color-ink)]" : "border-[color:var(--color-line)] text-[color:var(--color-muted)]"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={state === "current" ? "font-semibold text-[color:var(--color-accent)]" : state === "todo" ? "text-[color:var(--color-muted)]" : ""}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Kpi({ k, label, value, foot, unit }: { k: string; label: string; value: string; foot: string; unit?: string }) {
  return (
    <div data-run-kpi={k} className="flex min-w-0 flex-col gap-1 border-[color:var(--color-line)] p-4 sm:border-l sm:first:border-l-0">
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      <span className="text-2xl font-bold tabular-nums">
        {value}
        {unit ? <small className="ml-1 text-sm font-normal">{unit}</small> : null}
      </span>
      <span className="text-xs text-[color:var(--color-muted)]">{foot}</span>
    </div>
  );
}

function LegalBox({ model, unitSlug }: { model: BillRunModel; unitSlug: string }) {
  const lg = model.legal;
  const level = lg.ok ? "OK" : lg.blocks.length ? "BLOCK" : "WARN";
  const href = `/app/u/${unitSlug}/dorm/settings/utility?period=${model.utilityPeriodKey}`;
  const uMonth = MONTHS_SHORT[Number(model.utilityPeriodKey.slice(5, 7)) - 1] ?? "";
  if (level === "OK") {
    const parts: string[] = [];
    if (lg.elec) parts.push(`ไฟ ฿${money(lg.elec.rateSatang)} = บิลการไฟฟ้า ${uMonth} ฿${money(lg.elec.billSatang)} ÷ ${int(lg.elec.units)} หน่วย`);
    if (lg.water) parts.push(`น้ำ ฿${money(lg.water.rateSatang)} = บิลการประปา ฿${money(lg.water.billSatang)} ÷ ${int(lg.water.units)} หน่วย`);
    return (
      <div data-run-legal="" data-level="OK" className="flex items-start gap-3 rounded-2xl border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] p-4 text-sm">
        <span aria-hidden="true" className="font-bold text-[color:var(--color-accent)]">
          ✓
        </span>
        <p className="min-w-0 flex-1">
          <b>อัตราน้ำไฟไม่เกินต้นทุนจริง (ประกาศ สคบ. 2568)</b>
          {parts.length ? ` — ${parts.join(" · ")} · ส่วนต่าง (ส่วนกลาง+ห้องว่าง) เป็นต้นทุนหอ` : ""}
        </p>
        <a href={href} className="shrink-0 whitespace-nowrap font-semibold text-[color:var(--color-accent)] underline">
          ดูที่มา
        </a>
      </div>
    );
  }
  const items = [...lg.blocks, ...lg.needsAcceptance];
  return (
    <div
      data-run-legal=""
      data-level={level}
      className="flex flex-col gap-2 rounded-2xl border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] p-4 text-sm"
    >
      <b className="text-[color:var(--color-danger)]">{level === "BLOCK" ? "ยังส่งบิลไม่ได้ — ด่านค่าน้ำไฟตามประกาศ สคบ. 2568 ไม่ผ่าน" : "ต้องให้เจ้าของยอมรับคำเตือนค่าน้ำไฟก่อนส่ง"}</b>
      <ul className="list-disc pl-5">
        {items.map((x, i) => (
          <li key={`${x.code}-${i}`}>{x.messageTh}</li>
        ))}
      </ul>
      <a href={href} className="self-start font-semibold underline">
        ไปหน้าค่าน้ำไฟและกฎหมาย
      </a>
    </div>
  );
}

function rowHref(unitSlug: string, model: BillRunModel, room: string) {
  return `/app/u/${unitSlug}/dorm/billing?period=${model.periodKey}&room=${encodeURIComponent(room)}`;
}

function BillRow({ r, sel, model, unitSlug, onRelease }: { r: BillRunRow; sel: boolean; model: BillRunModel; unitSlug: string; onRelease: (billId: string) => void }) {
  const skipped = r.status === "SKIPPED";
  const flagged = !!r.meterFlag;
  return (
    <tr
      data-bill-row={r.roomNumber}
      data-bill-status={r.status}
      className={`border-t border-[color:var(--color-line)] ${sel ? "bg-[color:var(--color-accent-soft)] shadow-[inset_3px_0_0_var(--color-accent)]" : ""} ${
        flagged || r.status === "HELD" ? "shadow-[inset_3px_0_0_var(--color-danger)]" : ""
      } ${skipped ? "bg-[color:var(--color-surface-2)]" : ""}`}
    >
      <td className="px-4 py-3 align-top">
        <a href={rowHref(unitSlug, model, r.roomNumber)} className="font-semibold">
          {r.roomNumber}
        </a>{" "}
        <span>{r.tenantName}</span>
        {skipped ? <small className="block text-xs text-[color:var(--color-muted)]">{`ย้ายออก — คิดในใบย้ายออก (จอ 07)`}</small> : null}
        {r.status === "HELD" ? (
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <small className="text-xs font-semibold text-[color:var(--color-danger)]">{holdTh(r.holdReason)}</small>
            {model.canPrepare && r.billId ? (
              <button type="button" data-release-bill={r.billId} onClick={() => onRelease(r.billId as string)} className={`${btnGhost} min-h-8 px-2 text-xs`}>
                ปล่อยบิล
              </button>
            ) : null}
          </span>
        ) : null}
        {r.meterFlag && r.meterFlag.confirmed ? (
          <small data-meter-flag={r.meterFlag.flag} className="block text-xs font-semibold text-[color:var(--color-danger)]">
            {`${r.meterFlag.flag === "HIGH" ? "ไฟ/น้ำ" : "มิเตอร์"}${FLAG_TH[r.meterFlag.flag] ?? "ผิดปกติ"} · ยืนยันแล้ว`}
          </small>
        ) : null}
        {r.adjustments.length ? (
          <small className="block text-xs text-[color:var(--color-muted)]">
            {r.adjustments.map((a) => `${a.kind === "CREDIT" ? "ลดหนี้" : "เพิ่มหนี้"} ${a.docNo ?? ""} ${money(a.totalSatang)}`).join(" · ")}
          </small>
        ) : null}
      </td>
      <td data-col="rentCommon" className="px-3 py-3 text-right align-top tabular-nums">
        {r.rentCommonSatang === null ? "—" : money(r.rentCommonSatang)}
      </td>
      <td data-col="elec" className="px-3 py-3 text-right align-top tabular-nums">
        {r.elec ? (
          <>
            {money(r.elec.amountSatang)}
            <small className="block text-xs text-[color:var(--color-muted)]">{`${int(r.elec.units)} หน่วย`}</small>
          </>
        ) : (
          "—"
        )}
      </td>
      <td data-col="water" className="px-3 py-3 text-right align-top tabular-nums">
        {r.water ? (
          <>
            {money(r.water.amountSatang)}
            <small className="block text-xs text-[color:var(--color-muted)]">{`${int(r.water.units)} หน่วย`}</small>
          </>
        ) : (
          "—"
        )}
      </td>
      <td data-col="other" className="px-3 py-3 text-right align-top tabular-nums">
        {r.otherSatang ? (
          <>
            {money(r.otherSatang)}
            {r.otherNote ? <small className="block text-xs text-[color:var(--color-muted)]">{r.otherNote}</small> : null}
          </>
        ) : (
          "—"
        )}
      </td>
      <td data-col="total" className="px-3 py-3 text-right align-top font-bold tabular-nums">
        {skipped ? <span className="font-normal text-[color:var(--color-muted)]">ไม่ออกบิล</span> : r.totalSatang === null ? "—" : money(r.totalSatang)}
      </td>
      <td data-col="channel" className="px-3 py-3 align-top">
        {r.channel ? CHANNEL_TH[r.channel] : "—"}
        {r.channel === "SMS" ? <small className="block text-xs text-[color:var(--color-muted)]">ยังไม่ผูก LINE</small> : null}
        {r.status !== "SKIPPED" && r.status !== "DRAFT" && r.status !== "HELD" ? <small className="block text-xs text-[color:var(--color-muted)]">{STATUS_TH[r.status] ?? r.status}</small> : null}
      </td>
    </tr>
  );
}

function Preview({ p, model, unitSlug, actions, onDone }: { p: BillPreview; model: BillRunModel; unitSlug: string; actions: BillingRunActions; onDone: (msg: string) => void }) {
  const editable = p.status === "DRAFT" || p.status === "HELD";
  const sent = p.status === "SENT" || p.status === "PARTIALLY_PAID" || p.status === "PAID";
  const [kind, setKind] = useState<"LATE_FEE" | "OTHER">("LATE_FEE");
  const [label, setLabel] = useState("ค่าปรับชำระล่าช้า");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [adjKind, setAdjKind] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [tiReason, setTiReason] = useState("");
  const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  // (T5) คีย์กันซ้ำของฟอร์มออกใบแทน = 1 ต่อการเปิดฟอร์ม (กดซ้ำ/เน็ตหลุดแล้วกดใหม่ = ใบเดียว) · สำเร็จแล้วจึงได้คีย์ใหม่
  const [tiKey, setTiKey] = useState(newKey);
  const existing = p.lines.filter((l) => l.code === "LATE_FEE" || l.code.startsWith("SERVICE:MANUAL_"));
  async function addLine() {
    setBusy(true);
    const lines = [
      ...existing.map((l) => ({ kind: l.code === "LATE_FEE" ? "LATE_FEE" : "OTHER", labelTh: l.labelTh, amountBaht: money(l.amountSatang).replace(/,/g, ""), note: l.detail })),
      { kind, labelTh: label, amountBaht: amount, note },
    ];
    const o = outcome(await actions.extraLines({ billId: p.billId, lines }));
    setBusy(false);
    onDone(o.ok ? "บันทึกรายการเพิ่มแล้ว" : o.reason);
  }
  async function clearLines() {
    setBusy(true);
    const o = outcome(await actions.extraLines({ billId: p.billId, lines: [] }));
    setBusy(false);
    onDone(o.ok ? "ล้างรายการเพิ่มแล้ว" : o.reason);
  }
  async function adjust() {
    setBusy(true);
    const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const o = outcome(
      await actions.adjust({ billId: p.billId, kind: adjKind, reason: adjReason, idempotencyKey: key, lines: [{ code: "OTHER", labelTh: adjKind === "CREDIT" ? "ลดยอด" : "เพิ่มยอด", amountBaht: adjAmount }] }),
    );
    setBusy(false);
    onDone(o.ok ? (adjKind === "CREDIT" ? "ออกใบลดหนี้แล้ว" : "ออกใบเพิ่มหนี้แล้ว") : o.reason);
  }
  // SVC D.3 ▸ ออกใบกำกับภาษีฉบับใหม่แทน (ยอดเท่าเดิม · คีย์กันซ้ำต่อการกด) ◂
  async function reissue() {
    if (!actions.reissueTaxInvoice) return;
    setBusy(true);
    const r = await actions.reissueTaxInvoice({ billId: p.billId, reason: tiReason, idempotencyKey: tiKey });
    const o = outcome(r);
    setBusy(false);
    if (o.ok) {
      setTiKey(newKey());
      setTiReason("");
    }
    // (T8) ใบเป้าหมายถูกแทนไปแล้ว (อีกเครื่อง/อีกแท็บ) ⇒ บอกให้โหลดใหม่ก่อน
    const replaced = isRec(r) && r.code === "ALREADY_REPLACED";
    onDone(o.ok ? "ออกใบกำกับภาษีฉบับใหม่แทนแล้ว" : replaced ? "ใบกำกับภาษีนี้ถูกออกฉบับใหม่แทนไปแล้ว — โหลดหน้านี้ใหม่แล้วลองอีกครั้ง" : o.reason);
  }
  async function issueTi() {
    if (!actions.issueTaxInvoice) return;
    setBusy(true);
    const o = outcome(await actions.issueTaxInvoice({ billId: p.billId }));
    setBusy(false);
    onDone(o.ok ? "ออกใบกำกับภาษีแล้ว" : o.reason);
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-[color:var(--color-ink-soft)]">{`ตัวอย่างบิลที่ผู้เช่าเห็น · ห้อง ${p.roomNumber}`}</p>
      <div data-bill-preview={p.roomNumber} className="flex flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
        <div className="mb-2 flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <b className="block text-base">{p.unitName}</b>
            <small className="block text-xs text-[color:var(--color-muted)]">{`ใบแจ้งหนี้${p.docNo ? ` ${p.docNo}` : ""} · ${thDate(p.issueDate)}`}</small>
          </span>
          <span className="rounded-full border px-2.5 py-0.5 text-xs">{p.status === "DRAFT" || p.status === "HELD" ? "ร่าง" : (STATUS_TH[p.status] ?? p.status)}</span>
        </div>
        {p.lines.map((l) => (
          <div key={l.code} data-preview-line={l.code} className="flex items-baseline gap-2 py-1 text-sm">
            <span className="min-w-0">
              {l.code === "RENT" ? `ค่าห้อง ${thMonth(model.periodKey)}` : (PREVIEW_LABEL[l.code] ?? l.labelTh)}
              {l.detail ? <small className="ml-1 text-xs text-[color:var(--color-muted)]">{l.detail}</small> : null}
            </span>
            <span aria-hidden="true" className="min-w-4 flex-1 border-b border-dotted border-[color:var(--color-line)]" />
            <span className="tabular-nums">{money(l.amountSatang)}</span>
          </div>
        ))}
        <div className="mt-1 flex items-baseline gap-2 border-t border-[color:var(--color-line)] pt-2 font-bold">
          <span>ยอดชำระ</span>
          <span className="flex-1" />
          <span className="tabular-nums">{`฿${money(p.totalSatang)}`}</span>
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">
          {`ครบกำหนด ${thDate(p.dueDate)}`}
          {p.lateFeeRule ? ` · ${p.lateFeeRule}` : ""}
        </p>
        <p className="text-xs text-[color:var(--color-muted)]">
          {p.vatRegistered ? `รวมภาษีมูลค่าเพิ่ม ฿${money(p.vatSatang)} (ค่าเช่าที่อยู่อาศัยได้รับยกเว้น)` : "ไม่มี VAT (หอไม่ได้จด VAT · ค่าเช่าที่อยู่อาศัยได้รับยกเว้น)"}
        </p>
        {p.vatRegistered && p.vatSatang > 0 ? (
          <p data-preview-vat className="text-xs">{`VAT 7% ฿${money(p.vatSatang)} (เฉพาะรายการที่มี VAT · ค่าห้องยกเว้น)`}</p>
        ) : null}
        {p.taxInvoice ? (
          <p data-preview-tax-invoice={p.taxInvoice.docNo ?? ""} className="text-xs">
            {`ใบกำกับภาษี ${p.taxInvoice.docNo ?? "(รอเลข)"} `}
            <a href={`/app/u/${unitSlug}/dorm/billing/${p.billId}/tax-invoice`} className="font-semibold underline">
              ดู/พิมพ์ต้นฉบับ
            </a>
            {" · "}
            <a href={`/app/u/${unitSlug}/dorm/billing/${p.billId}/tax-invoice?copy=1`} className="underline">
              สำเนา
            </a>
          </p>
        ) : null}
        {p.withholding ? (
          <p data-preview-wht className="text-xs">
            {`หัก ณ ที่จ่าย ${p.withholding.rateBp % 100 === 0 ? String(p.withholding.rateBp / 100) : (p.withholding.rateBp / 100).toFixed(2)}% ฿${money(p.withholding.amountSatang)} (ผู้เช่านิติบุคคล · จากค่าห้อง ฿${money(p.withholding.baseSatang)})`}
          </p>
        ) : null}
        <a href={`/app/u/${unitSlug}/dorm/billing/${p.billId}/print`} className="mt-1 self-start text-xs font-semibold underline">
          พิมพ์ใบแจ้งหนี้ (A5)
        </a>
      </div>
      {sent && p.vatRegistered && p.vatSatang > 0 && !p.taxInvoice && actions.issueTaxInvoice ? (
        <button type="button" disabled={busy} onClick={() => void issueTi()} className={`${btnGhost} self-start`}>
          ออกใบกำกับภาษี (ยังไม่มีใบของบิลนี้)
        </button>
      ) : null}
      {p.taxInvoice && actions.reissueTaxInvoice ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[color:var(--color-line)] p-3 text-sm">
          <b>ออกใบกำกับภาษีฉบับใหม่แทน (ยอดเท่าเดิม — แก้ยอดใช้ใบลด/เพิ่มหนี้)</b>
          <input aria-label="เหตุผลการออกใบแทน" placeholder="เหตุผล เช่น แก้ชื่อผู้ซื้อตามคำขอ (อย่างน้อย 10 ตัวอักษร)" value={tiReason} onChange={(e) => setTiReason(e.target.value)} className={inputCls} />
          <button type="button" disabled={busy} onClick={() => void reissue()} className={`${btnGhost} self-start`}>
            ออกใบใหม่แทน
          </button>
        </div>
      ) : null}
      {editable && model.canPrepare ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[color:var(--color-line)] p-3 text-sm">
          <b>เพิ่มค่าปรับ/รายการอื่นในบิลนี้</b>
          <div className="flex flex-wrap gap-2">
            <select aria-label="ชนิดรายการ" value={kind} onChange={(e) => setKind(e.target.value === "OTHER" ? "OTHER" : "LATE_FEE")} className={inputCls}>
              <option value="LATE_FEE">ค่าปรับชำระล่าช้า</option>
              <option value="OTHER">รายการอื่น</option>
            </select>
            <input aria-label="ชื่อรายการ" value={label} onChange={(e) => setLabel(e.target.value)} className={`${inputCls} flex-1`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <input aria-label="ยอด (บาท)" inputMode="decimal" placeholder="ยอด (บาท)" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} w-32`} />
            <input aria-label="หมายเหตุ" placeholder="หมายเหตุ เช่น ปรับช้า 4 วัน" value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} flex-1`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void addLine()} className={btnGhost}>
              เพิ่มรายการ
            </button>
            {existing.length ? (
              <button type="button" disabled={busy} onClick={() => void clearLines()} className={btnGhost}>
                ล้างรายการเพิ่ม
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {sent ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[color:var(--color-line)] p-3 text-sm">
          <b>แก้หลังส่ง (ออกใบลดหนี้/เพิ่มหนี้ — บิลเดิมไม่ถูกแก้)</b>
          <div className="flex flex-wrap gap-2">
            <select aria-label="ชนิดเอกสาร" value={adjKind} onChange={(e) => setAdjKind(e.target.value === "DEBIT" ? "DEBIT" : "CREDIT")} className={inputCls}>
              <option value="CREDIT">ใบลดหนี้</option>
              <option value="DEBIT">ใบเพิ่มหนี้</option>
            </select>
            <input aria-label="ยอด (บาท)" inputMode="decimal" placeholder="ยอด (บาท)" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} className={`${inputCls} w-32`} />
          </div>
          <input aria-label="เหตุผล" placeholder="เหตุผล (อย่างน้อย 10 ตัวอักษร)" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} className={inputCls} />
          <button type="button" disabled={busy} onClick={() => void adjust()} className={`${btnGhost} self-start`}>
            ออกเอกสาร
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function BillingRunScreen({ model, unitSlug, actions }: BillingRunScreenProps) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState("");
  const k = model.kpi;
  const drafts = model.rows.filter((r) => r.status === "DRAFT").length;
  const sendCount = model.status === "NONE" ? 0 : drafts;
  const lines = model.rows.filter((r) => r.status === "DRAFT" || r.status === "SENT");
  const lineN = lines.filter((r) => r.channel === "LINE").length;
  const smsRooms = lines.filter((r) => r.channel === "SMS").map((r) => r.roomNumber);
  const printN = lines.filter((r) => r.channel === "PRINT").length;
  const due = model.preview?.dueDate ?? null;

  const reload = (text: string) => {
    setMsg(text);
    if (typeof window !== "undefined") window.setTimeout(() => window.location.reload(), 600);
  };
  async function run(fn: () => Promise<unknown>, okText: string) {
    setBusy(true);
    setMsg("");
    try {
      const o = outcome(await fn());
      if (o.ok) reload(okText);
      else setMsg(o.reason);
    } catch {
      setMsg("ทำรายการไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    if (!model.runId) return setMsg("ยังไม่มีรอบบิลให้ส่งออก");
    const r = await actions.exportCsv({ runId: model.runId, periodKey: model.periodKey });
    if (isRec(r) && r.ok === true && typeof r.csv === "string") {
      const blob = new Blob([`﻿${r.csv}`], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = typeof r.filename === "string" ? r.filename : "bills.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } else setMsg(outcome(r).reason);
  }
  async function sendNow() {
    if (!model.runId) return;
    setBusy(true);
    setMsg("กำลังส่ง — ออกใบแจ้งหนี้ทีละห้อง");
    let guard = 0;
    for (;;) {
      const r = await actions.send({ runId: model.runId });
      if (!isRec(r) || r.ok !== true) {
        setMsg(outcome(r).reason);
        setBusy(false);
        return;
      }
      if (r.done === true || ++guard > 40) break;
      setMsg(`กำลังส่ง — เหลือ ${typeof r.remaining === "number" ? r.remaining : "?"} ใบ`);
    }
    setBusy(false);
    reload("ส่งบิลแล้ว");
  }

  return (
    <div data-billing-run="" data-period={model.periodKey} data-run-status={model.status} className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-xs text-[color:var(--color-muted)]">{model.unitName}</p>
          <h1 className="text-2xl font-bold">{`ออกบิลรอบ ${thMonth(model.periodKey)}`}</h1>
        </div>
        <Steps model={model} />
        <span className="flex-1" />
        <button type="button" data-run-action="export" disabled={!model.runId} onClick={() => void exportCsv()} className={btnGhost}>
          ส่งออก Excel
        </button>
      </header>

      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start">
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid min-w-0 grid-cols-2 overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] sm:grid-cols-5">
            <Kpi k="count" label="บิลรอบนี้" value={String(k.billCount)} unit="ใบ" foot={`ค่าห้อง ${MONTHS_SHORT[Number(model.periodKey.slice(5, 7)) - 1] ?? ""} + น้ำไฟ ${MONTHS_SHORT[Number(model.utilityPeriodKey.slice(5, 7)) - 1] ?? ""}`} />
            <Kpi k="rentCommon" label="ค่าห้อง + ส่วนกลาง" value={`฿${moneyShort(k.rentSatang + k.commonSatang)}`} foot={`${moneyShort(k.rentSatang)} + ${moneyShort(k.commonSatang)}`} />
            <Kpi k="elec" label="ค่าไฟ" value={`฿${money(k.elecSatang)}`} foot={`${int(k.elecUnits)} หน่วย${k.elecRateSatang !== null ? ` × ฿${money(k.elecRateSatang)}` : ""}`} />
            <Kpi k="water" label="ค่าน้ำ" value={`฿${money(k.waterSatang)}`} foot={`${int(k.waterUnits)} หน่วย${k.waterRateSatang !== null ? ` × ฿${money(k.waterRateSatang)}` : ""}`} />
            <Kpi
              k="total"
              label="รวมทั้งรอบ"
              value={`฿${money(k.totalSatang)}`}
              foot={k.lateFeeSatang ? `รวมค่าปรับจ่ายช้า ฿${moneyShort(k.lateFeeSatang)}` : k.otherSatang ? `รวมค่าบริการอื่น ฿${moneyShort(k.otherSatang)}` : "ไม่มีค่าปรับ"}
            />
          </div>

          <LegalBox model={model} unitSlug={unitSlug} />
          {model.lastError ? (
            <p data-run-last-error="" role="status" className="rounded-2xl border border-[color:var(--color-danger)] p-3 text-sm">
              <b className="text-[color:var(--color-danger)]">ส่งอัตโนมัติไม่สำเร็จครั้งล่าสุด</b>
              {` — ${model.lastError.reason}${model.lastError.nextAttemptAt ? ` · ระบบจะลองใหม่ ${model.lastError.nextAttemptAt.slice(0, 16).replace("T", " ")} (UTC)` : ""}`}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-[color:var(--color-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ห้อง · ผู้เช่า</th>
                    <th className="px-3 py-3 text-right font-semibold">ห้อง+ส่วนกลาง</th>
                    <th className="px-3 py-3 text-right font-semibold">ไฟ</th>
                    <th className="px-3 py-3 text-right font-semibold">น้ำ</th>
                    <th className="px-3 py-3 text-right font-semibold">อื่น ๆ</th>
                    <th className="px-3 py-3 text-right font-semibold">รวม</th>
                    <th className="px-3 py-3 font-semibold">ส่งทาง</th>
                  </tr>
                </thead>
                <tbody>
                  {model.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-[color:var(--color-muted)]">
                        {model.status === "NONE" ? "ยังไม่ได้เตรียมรอบนี้ — กด “เตรียมรอบบิล” เพื่อรวมค่าห้อง+น้ำไฟของทุกห้อง" : "ไม่มีบิลในรอบนี้"}
                      </td>
                    </tr>
                  ) : (
                    model.rows.map((r) => (
                      <BillRow
                        key={`${r.leaseId}-${r.status}`}
                        r={r}
                        sel={model.preview?.roomNumber === r.roomNumber}
                        model={model}
                        unitSlug={unitSlug}
                        onRelease={(billId) => void run(() => actions.release({ billId }), "ปล่อยบิลแล้ว")}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div data-run-footer="" className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-line)] px-4 py-3 text-xs text-[color:var(--color-muted)]">
              <span>{`${model.rows.length} ห้องที่มีผู้เช่าในรอบนี้`}</span>
              <span className="flex-1" />
              <b className="text-sm text-[color:var(--color-ink)]">{`${k.billCount} บิล · ฿${money(k.totalSatang)}`}</b>
            </div>
          </div>
        </section>

        <aside className="flex w-full min-w-0 flex-col gap-4 rounded-2xl bg-[color:var(--color-surface-2)] p-4 xl:w-[400px] xl:shrink-0">
          {model.preview ? (
            <Preview p={model.preview} model={model} unitSlug={unitSlug} actions={actions} onDone={reload} />
          ) : (
            <p className="text-sm text-[color:var(--color-muted)]">เลือกห้องในตารางเพื่อดูตัวอย่างบิล</p>
          )}
          <div data-send-effects="" className="flex flex-col gap-2 text-sm">
            <p className="font-semibold text-[color:var(--color-ink-soft)]">เมื่อกดส่ง ระบบจะ</p>
            <p className="border-b border-[color:var(--color-line)] pb-2">{`ออกใบแจ้งหนี้ ${sendCount} ใบในระบบบัญชี (ลูกหนี้ = ผู้เช่าแต่ละคน)`}</p>
            <p className="border-b border-[color:var(--color-line)] pb-2">แนบ QR พร้อมเพย์ยอดตรงบิล + ลิงก์แนบสลิป</p>
            <p className="border-b border-[color:var(--color-line)] pb-2">
              {`ส่ง LINE ${lineN} คน · ลิงก์ SMS ${smsRooms.length} คน${smsRooms.length ? ` (${smsRooms.slice(0, 5).join(", ")})` : ""}${printN ? ` · พิมพ์ใส่ห้อง ${printN} ห้อง` : ""}`}
            </p>
            <p>{`เตือนอัตโนมัติก่อนครบกำหนด${due ? ` (${thDate(due)})` : ""} และหลังเลยกำหนด`}</p>
          </div>
        </aside>
      </div>

      {msg ? (
        <p role="status" className="text-sm text-[color:var(--color-ink-soft)]">
          {msg}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--color-line)] pt-4">
        <span className="text-xs text-[color:var(--color-muted)]">{`ตรวจครบแล้ว ${model.counts.reviewed}/${model.counts.total} · พักไว้ ${model.counts.held}`}</span>
        {model.scheduledSendAt ? <span className="text-xs text-[color:var(--color-muted)]">{`ตั้งส่งไว้ ${model.scheduledSendAt.slice(0, 16).replace("T", " ")} (UTC)`}</span> : null}
        <span className="flex-1" />
        {model.canPrepare ? (
          <button type="button" data-run-action="save" disabled={busy} onClick={() => void run(() => actions.prepare({ periodKey: model.periodKey }), "บันทึกร่าง/คำนวณใหม่แล้ว")} className={btnGhost}>
            {model.status === "NONE" ? "เตรียมรอบบิล" : "บันทึกร่าง"}
          </button>
        ) : null}
        {model.canSend ? (
          <>
            <input aria-label="ตั้งเวลาส่ง" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={`${inputCls} w-52`} />
            <button
              type="button"
              data-run-action="schedule"
              disabled={busy || !at}
              onClick={() => void run(() => actions.schedule({ runId: model.runId, at: at ? new Date(at).toISOString() : null }), "ตั้งเวลาส่งแล้ว")}
              className={btnGhost}
            >
              ตั้งเวลาส่ง
            </button>
            <button type="button" data-run-action="send" disabled={busy || !model.legal.ok} onClick={() => void sendNow()} className={btnPrimary}>
              {`ส่งบิล ${sendCount} ใบตอนนี้`}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
