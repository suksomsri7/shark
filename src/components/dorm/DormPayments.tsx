"use client";
// SVC D.10 ▸ จอ "รับเงิน" — ภาพอ้างอิง ledger/design-dorm/06-slip-payments.png · สัญญา DOM ledger/svc-briefs/svc-brief-d.10.md §4
//   ข้อมูลทั้งหมดจาก dormPaymentsModel (ไฟล์นี้ import type เท่านั้นจาก lib) · action รับทาง prop ⇒ render ด้วย renderToStaticMarkup ได้
//   เงินแสดงจากสตางค์จำนวนเต็ม (ไม่คำนวณเงินบนจอ) · ไม่มีเบอร์ · ไม่มีชื่อเต็ม · ไม่มี URL ไฟล์สลิป
import { useActionState, useState } from "react";
import type { DormPaymentsModel, DormReviewRow, DormSlipFlag } from "@/lib/platform/dorm-pay";
import { bahtText, thaiMonthShort, thaiShortDate } from "./dorm-home-shared";

type ActionFn = (prev: unknown, fd: FormData) => Promise<unknown>;
export type DormPaymentsActions = { review: ActionFn; resolve: ActionFn; cash: ActionFn; voidReceipt: ActionFn; attachChat: ActionFn; dismissChat: ActionFn };
export type DormPaymentsProps = { model: DormPaymentsModel; unitSlug: string; selected: string | null; actions: DormPaymentsActions };
type Tab = "review" | "paid" | "unpaid" | "overdue";

const BANKS: Record<string, string> = { "002": "กรุงเทพ", "004": "กสิกรไทย", "006": "กรุงไทย", "011": "ทหารไทยธนชาต", "014": "ไทยพาณิชย์", "025": "กรุงศรี", "030": "ออมสิน", "069": "เกียรตินาคินภัทร" };
const VIA_TH: Record<DormPaymentsModel["recent"][number]["via"], string> = { SLIP: "สลิป", CASH: "เงินสด", TRANSFER: "โอนเงิน", OTHER: "รับชำระ" };
const line = "border-[color:var(--color-line)]";
const soft = "text-[color:var(--color-ink-soft)]";
const danger = "text-[color:var(--color-danger,#c81e1e)]";

function bkkWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${thaiShortDate(`${p.year}-${p.month}-${p.day}`)} ${p.hour}:${p.minute}`;
}
const flagTh = (f: DormSlipFlag, diff: number): string =>
  ({
    PAYER_NAME: "ชื่อผู้โอนไม่ใช่ผู้เช่า", SHORT: `ยอดขาด ฿${bahtText(Math.abs(diff))}`, OVER: `ยอดเกิน ฿${bahtText(Math.abs(diff))}`, DUPLICATE: "สลิปซ้ำ",
    AFTER_PAID: "เข้าหลังจ่ายครบ", BILL_VOID: "บิลถูกยกเลิก", NO_INVOICE: "ไม่มีใบแจ้งหนี้", OTHER: "ต้องตรวจเพิ่ม",
  })[f];
const actionTh = (a: DormReviewRow["actions"][number], r: DormReviewRow, next: string): { title: string; sub: string } =>
  ({
    APPROVE: { title: `รับ ฿${bahtText(r.slipSatang ?? r.dueSatang)}`, sub: "ออกใบเสร็จและลงบัญชี" },
    PARTIAL_CARRY: { title: `รับ ฿${bahtText(r.slipSatang ?? 0)} ไว้ก่อน · ยกยอดที่ขาดไปบิล ${next}`, sub: "ออกใบเสร็จตามยอดที่ได้ · บิลนี้เป็นจ่ายบางส่วน" },
    ASK_MORE: { title: `ขอให้โอนเพิ่ม ฿${bahtText(Math.abs(r.diffSatang))}`, sub: "รับยอดที่โอนมาแล้ว · ส่ง LINE ขอยอดที่ขาด" },
    REJECT: { title: "ไม่รับสลิปนี้", sub: "แจ้งเหตุผลกลับทาง LINE" },
    CREDIT: { title: "เก็บเป็นเงินรับล่วงหน้า", sub: "ออกใบเสร็จ · ไม่ใช่รายได้" },
    REFUND_DUE: { title: "ต้องโอนคืนผู้เช่า", sub: "จดเหตุผล · ไม่ลงบัญชี" },
  })[a];
const nextMonth = (period: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return "หน้า";
  const n = Number(m[2]);
  return thaiMonthShort(`${n === 12 ? Number(m[1]) + 1 : m[1]}-${String(n === 12 ? 1 : n + 1).padStart(2, "0")}`);
};
const failText = (r: unknown): string | null => (r && typeof r === "object" && (r as { ok?: unknown }).ok === false ? String((r as { reason?: unknown }).reason ?? "ทำรายการไม่สำเร็จ") : null);
const Fail = ({ r }: { r: unknown }) => {
  const t = failText(r);
  return t ? <p role="alert" className={`text-sm ${danger}`}>{t}</p> : null;
};
const newKey = () => `cash-${globalThis.crypto.randomUUID()}`;

function Kpi({ k, label, tone, children, foot }: { k: string; label: string; tone?: "accent" | "danger"; children: React.ReactNode; foot: string }) {
  const edge = tone === "accent" ? "border-[color:var(--color-accent)]" : tone === "danger" ? "border-[color:var(--color-danger,#c81e1e)]" : line;
  return (
    <div data-pay-kpi={k} className={`rounded-2xl border bg-[color:var(--color-surface)] p-5 ${edge}`}>
      <div className={`text-sm ${soft}`}>{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{children}</div>
      <div className={`mt-2 text-xs ${soft}`}>{foot}</div>
    </div>
  );
}

function Panel({ row, period, actions }: { row: DormReviewRow; period: string; actions: DormPaymentsActions }) {
  const held = row.status === "HELD";
  const [state, act, pending] = useActionState(held ? actions.resolve : actions.review, null);
  const [choice, setChoice] = useState<string>(row.actions[0] ?? "REJECT");
  const head = row.flags[0] ? flagTh(row.flags[0], row.diffSatang) : "ตรวจสลิป";
  return (
    <aside data-pay-panel={row.slipId} className={`flex w-full min-w-0 flex-col gap-4 rounded-2xl border bg-[color:var(--color-surface)] p-5 lg:w-[400px] lg:shrink-0 ${line}`}>
      <div>
        <div className={`text-sm ${soft}`}>สลิปห้อง {row.roomNumber} · {row.tenantShort}</div>
        <h2 className="text-lg font-bold">{head}</h2>
      </div>
      <div className={`flex flex-col items-center gap-1 rounded-2xl border p-8 text-center ${line}`}>
        <span className="text-sm font-bold">{row.bankCode ? `ธนาคาร${BANKS[row.bankCode] ?? ""}` : "สลิปโอนเงิน"}</span>
        <b className="text-2xl tabular-nums">{row.slipSatang === null ? "—" : `฿${bahtText(row.slipSatang)}`}</b>
        <span className={`text-xs ${soft}`}>{bkkWhen(row.transferredAt)}</span>
      </div>
      <form action={act} className="flex flex-col gap-3">
        <input type="hidden" name="slipId" value={row.slipId} />
        {row.actions.map((a) => {
          const t = actionTh(a, row, nextMonth(period));
          return (
            <label key={a} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${choice === a ? "border-[color:var(--color-ink)]" : line}`}>
              <input type="radio" name="action" value={a} checked={choice === a} onChange={() => setChoice(a)} />
              <span className="flex flex-col"><b className="text-sm">{t.title}</b><small className={soft}>{t.sub}</small></span>
            </label>
          );
        })}
        {choice === "APPROVE" ? <input name="transRef" placeholder="เลขอ้างอิงการโอน (กรอกเมื่อสลิปไม่มีเลข)" className={`rounded-xl border px-3 py-2 text-sm ${line}`} /> : null}
        <input name="reason" required maxLength={500} placeholder="เหตุผล (เช่น ญาติจ่ายแทน)" className={`rounded-xl border px-3 py-2 text-sm ${line}`} />
        <Fail r={state} />
        <button type="submit" data-pay-confirm="" disabled={pending} className="rounded-xl bg-[color:var(--color-ink)] px-4 py-3 text-sm font-bold text-[color:var(--color-surface)] disabled:opacity-60">ยืนยัน · ส่งใบเสร็จ</button>
      </form>
    </aside>
  );
}

function CashForm({ model, action, onClose }: { model: DormPaymentsModel; action: ActionFn; onClose: () => void }) {
  const [state, act, pending] = useActionState(action, null);
  const [key] = useState(newKey);
  return (
    <form action={act} data-pay-cash-form="" className={`flex flex-wrap items-end gap-3 rounded-2xl border bg-[color:var(--color-surface)] p-4 ${line}`}>
      <input type="hidden" name="idempotencyKey" value={key} />
      <label className="flex flex-col gap-1 text-sm">ห้อง/บิล
        <select name="billId" required className={`rounded-xl border px-3 py-2 ${line}`}>
          {model.open.map((b) => <option key={b.billId} value={b.billId}>{b.roomNumber} · {b.tenantShort} · {thaiMonthShort(b.periodKey)} · ฿{bahtText(b.dueSatang)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">ยอด (บาท)<input name="amount" required inputMode="decimal" className={`rounded-xl border px-3 py-2 ${line}`} /></label>
      <label className="flex flex-col gap-1 text-sm">ช่องทาง
        <select name="channel" className={`rounded-xl border px-3 py-2 ${line}`}><option value="CASH">เงินสด</option><option value="TRANSFER">โอนเงิน</option></select>
      </label>
      <input name="note" maxLength={200} placeholder="หมายเหตุ" className={`rounded-xl border px-3 py-2 text-sm ${line}`} />
      <button type="submit" disabled={pending} className="rounded-xl bg-[color:var(--color-ink)] px-4 py-2 text-sm font-bold text-[color:var(--color-surface)] disabled:opacity-60">บันทึกรับเงิน</button>
      <button type="button" onClick={onClose} className={`rounded-xl border px-4 py-2 text-sm ${line}`}>ปิด</button>
      <Fail r={state} />
    </form>
  );
}

function VoidForm({ receiptId, action }: { receiptId: string; action: ActionFn }) {
  const [state, act, pending] = useActionState(action, null);
  return (
    <form action={act} className="flex items-center gap-2">
      <input type="hidden" name="receiptId" value={receiptId} />
      <input name="reason" required minLength={5} maxLength={500} placeholder="เหตุผลการยกเลิก" className={`w-40 rounded-lg border px-2 py-1 text-xs ${line}`} />
      <button type="submit" disabled={pending} className={`rounded-lg border px-2 py-1 text-xs ${line}`}>ยกเลิกใบเสร็จ</button>
      <Fail r={state} />
    </form>
  );
}

function ChatRow({ item, model, actions }: { item: DormPaymentsModel["chat"][number]; model: DormPaymentsModel; actions: DormPaymentsActions }) {
  const [attachState, attach] = useActionState(actions.attachChat, null);
  const [dropState, drop] = useActionState(actions.dismissChat, null);
  const bills = model.open.filter((b) => item.roomNumbers.includes(b.roomNumber));
  return (
    <div data-pay-chat={item.itemId} className={`flex flex-wrap items-center gap-3 border-t py-3 text-sm ${line}`}>
      <b>ห้อง {item.roomNumbers.join(" · ")}</b>
      <span className={soft}>{bkkWhen(item.receivedAt)}</span>
      <span className="flex-1" />
      <form action={attach} className="flex items-center gap-2">
        <input type="hidden" name="itemId" value={item.itemId} />
        <select name="billId" required className={`rounded-lg border px-2 py-1 text-xs ${line}`}>
          {bills.map((b) => <option key={b.billId} value={b.billId}>{thaiMonthShort(b.periodKey)} · ฿{bahtText(b.dueSatang)}</option>)}
        </select>
        <button type="submit" className={`rounded-lg border px-2 py-1 text-xs ${line}`}>แนบเข้าบิล</button>
      </form>
      <form action={drop} className="flex items-center gap-2">
        <input type="hidden" name="itemId" value={item.itemId} />
        <input name="reason" required maxLength={500} placeholder="เหตุผลที่ไม่ใช่สลิป" className={`w-36 rounded-lg border px-2 py-1 text-xs ${line}`} />
        <button type="submit" className={`rounded-lg border px-2 py-1 text-xs ${line}`}>ทิ้งรูปนี้</button>
      </form>
      <Fail r={attachState} /><Fail r={dropState} />
    </div>
  );
}

export default function DormPayments({ model, unitSlug, selected, actions }: DormPaymentsProps) {
  const [tab, setTab] = useState<Tab>("review");
  const [cashOpen, setCashOpen] = useState(false);
  const { kpi } = model;
  const row = model.review.find((r) => r.slipId === selected) ?? null;
  const base = `/app/u/${unitSlug}/dorm/payments?period=${model.periodKey}`;
  const unpaid = model.open.filter((b) => !b.overdue && !b.inReview);
  const overdue = model.open.filter((b) => b.overdue);
  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "review", label: "รอตรวจ", n: model.review.length },
    { key: "paid", label: "รับแล้ว", n: kpi.receivedBills },
    { key: "unpaid", label: "ยังไม่จ่าย", n: kpi.unpaidBills },
    { key: "overdue", label: "ค้างเกินกำหนด", n: kpi.overdueRooms.length },
  ];
  const billList = (rows: DormPaymentsModel["open"]) =>
    rows.length ? rows.map((b) => (
      <div key={b.billId} className={`flex items-center gap-3 border-t px-5 py-3 text-sm ${line}`}>
        <b className="tabular-nums">{b.roomNumber}</b><span>{b.tenantShort}</span><span className={soft}>{thaiMonthShort(b.periodKey)}</span>
        <span className="flex-1" /><b className="tabular-nums">฿{bahtText(b.dueSatang)}</b>
      </div>
    )) : <p className={`px-5 py-6 text-sm ${soft}`}>ไม่มีรายการ</p>;
  return (
    <div data-dorm-payments="" data-period={model.periodKey} className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">รับเงิน รอบ {thaiMonthShort(model.periodKey)}</h1>
        <span className="flex-1" />
        {model.can.manual ? <button type="button" data-pay-cash="" onClick={() => setCashOpen((v) => !v)} className={`rounded-xl border px-4 py-2 text-sm ${line}`}>บันทึกรับเงินสด</button> : null}
        {model.links.statementMatch ? <a data-pay-statement="" href={model.links.statementMatch} className={`rounded-xl border px-4 py-2 text-sm ${line}`}>จับคู่รายการธนาคาร</a> : null}
      </div>
      {cashOpen && model.can.manual ? <CashForm model={model} action={actions.cash} onClose={() => setCashOpen(false)} /> : null}
      <div className="flex min-w-0 flex-col items-start gap-5 lg:flex-row">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi k="received" label="รับแล้ว" foot={`${kpi.receivedBills} บิล · ผ่านอัตโนมัติ ${kpi.autoApproved}`}>฿{bahtText(kpi.receivedSatang)}</Kpi>
            <Kpi k="review" label="สลิปรอตรวจ" tone="accent" foot={kpi.reviewRooms.join(" · ") || "ไม่มีสลิปรอตรวจ"}>{kpi.reviewCount} <span className={`text-sm ${soft}`}>· ฿{bahtText(kpi.reviewSatang)}</span></Kpi>
            <Kpi k="unpaid" label="ยังไม่จ่าย" foot={`${kpi.unpaidBills} บิล`}>฿{bahtText(kpi.unpaidSatang)}</Kpi>
            <Kpi k="overdue" label="ค้างจากงวดก่อน" tone="danger" foot={kpi.overdueRooms.join(" · ") || "ไม่มีค้าง"}><span className={danger}>฿{bahtText(kpi.overdueSatang)}</span></Kpi>
          </div>
          <div className={`flex gap-2 overflow-x-auto border-b ${line}`} role="tablist">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-pay-tab={t.key} onClick={() => setTab(t.key)}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm ${tab === t.key ? "border-[color:var(--color-accent)] font-bold" : `border-transparent ${soft}`}`}>
                {t.label} <span className="tabular-nums">{t.n}</span>
              </button>
            ))}
          </div>
          <div className={`overflow-x-auto rounded-2xl border bg-[color:var(--color-surface)] ${line}`}>
            {tab === "review" ? (
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className={`text-left text-xs ${soft}`}><th className="px-4 py-3">ห้อง</th><th className="px-4 py-3 text-right">ยอดบิล</th><th className="px-4 py-3 text-right">ยอดในสลิป</th><th className="px-4 py-3">โอนเมื่อ</th><th className="px-4 py-3">ผลตรวจอัตโนมัติ</th></tr></thead>
                <tbody>
                  {model.review.map((r) => (
                    <tr key={r.slipId} data-pay-review-row={r.slipId} data-room={r.roomNumber} className={`border-t ${line} ${r.slipId === selected ? "bg-[color:var(--color-accent-soft,#e8efff)]" : ""}`}>
                      <td className="px-4 py-3"><a href={`${base}&slip=${r.slipId}`}><b>{r.roomNumber}</b> {r.tenantShort}</a></td>
                      <td className="px-4 py-3 text-right tabular-nums">{bahtText(r.dueSatang)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${r.flags.includes("SHORT") ? `font-bold ${danger}` : ""}`}>{r.slipSatang === null ? "—" : bahtText(r.slipSatang)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{bkkWhen(r.transferredAt)}<small className={`block ${soft}`}>{r.bankCode ? (BANKS[r.bankCode] ?? "") : ""}</small></td>
                      <td className="px-4 py-3"><span className="flex flex-wrap gap-2">{r.flags.map((f) => <span key={f} data-pay-flag={f} className={f === "PAYER_NAME" ? "" : `font-bold ${danger}`}>{flagTh(f, r.diffSatang)}</span>)}{r.status === "HELD" ? <span className={soft}>พักไว้</span> : null}</span></td>
                    </tr>
                  ))}
                  {model.review.length === 0 ? <tr><td colSpan={5} className={`px-4 py-6 ${soft}`}>ไม่มีสลิปรอตรวจ</td></tr> : null}
                </tbody>
              </table>
            ) : tab === "paid" ? (
              <div>{model.recent.length ? null : <p className={`px-5 py-6 text-sm ${soft}`}>ยังไม่มีรายการรับเงิน</p>}</div>
            ) : tab === "unpaid" ? billList(unpaid) : billList(overdue)}
          </div>
          {tab === "review" || tab === "paid" ? (
            <div data-pay-recent="" className={`rounded-2xl border bg-[color:var(--color-surface)] p-5 ${line}`}>
              <div className="flex items-center gap-3"><h2 className="font-bold">รับเงินล่าสุด</h2><span className="flex-1" /><span className={`text-xs ${soft}`}>ไม่ต้องทำอะไร · ใบเสร็จส่งเข้า LINE แล้ว</span></div>
              {model.recent.map((r) => (
                <div key={r.billId} data-pay-receipt={r.docNo ?? ""} className={`flex flex-wrap items-center gap-3 border-t py-3 text-sm ${line}`}>
                  <b className="tabular-nums">{r.roomNumber}</b>
                  <span className={soft}>{r.tenantShort} · {VIA_TH[r.via]} {bkkWhen(r.at)}</span>
                  <span className="flex-1" />
                  <b className="tabular-nums">฿{bahtText(r.amountSatang)}</b>
                  <span className={`tabular-nums ${soft}`}>{r.docNo ?? "—"}</span>
                  {tab === "paid" && model.can.manual && r.receiptId ? <VoidForm receiptId={r.receiptId} action={actions.voidReceipt} /> : null}
                </div>
              ))}
            </div>
          ) : null}
          {model.chat.length ? (
            <div className={`rounded-2xl border bg-[color:var(--color-surface)] p-5 ${line}`}>
              <h2 className="font-bold">สลิปจากแชทที่ยังไม่แนบบิล</h2>
              {model.chat.map((c) => <ChatRow key={c.itemId} item={c} model={model} actions={actions} />)}
            </div>
          ) : null}
        </div>
        {row ? <Panel key={row.slipId} row={row} period={row.periodKey} actions={actions} /> : null}
      </div>
    </div>
  );
}
