"use client";
// SVC D.12 ▸ จอ "ย้ายออก · คืนเงินประกัน" — ภาพอ้างอิง ledger/design-dorm/07-moveout-deposit.png (ซ้ายตรวจห้อง · ขวาแผงสรุป · แถบนับถอยหลังบน)
//   สัญญา DOM ledger/svc-briefs/svc-brief-d.12.md §7.1 · ข้อมูลทั้งหมดจาก moveOutModel ของ facade หอ (ไฟล์นี้ import จากโมดูลได้เฉพาะ type)
//   • action รับทาง prop (ไม่ลาก prisma/โมดูลฝั่ง server/actions/next) ⇒ render ด้วย renderToStaticMarkup ได้
//   • ค่าเสื่อมสภาพปกติ "หักไม่ได้" — แถวปกติไม่มีช่องยอด/ยอดเงิน · ทุกรายการที่หักต้องมีหลักฐานที่แนบใบนี้ (ตรวจซ้ำที่ server)
//   • เงินแสดงจากสตางค์จำนวนเต็มของ model (ไม่คำนวณเงินบนจอ) · ไม่มีเบอร์โทร/เลขบัตร · ข้อความบริการล้วน (ประกาศ สคบ.)
//   • เดสก์ท็อป 1440 = 2 คอลัมน์ · มือถือ 390 = ซ้อนลง ไม่ล้นแนวนอน
import { useState } from "react";
import type { MoveOutModel, SummaryLine } from "@/lib/modules/dorm";

type ActionFn = (...a: never[]) => Promise<unknown>;
export type MoveOutScreenProps = { unitSlug: string; model: MoveOutModel; actions?: Record<string, ActionFn> };

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const WEEKDAY_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const pad2 = (n: number) => String(n).padStart(2, "0");
/** สตางค์ ⇒ "7,759.28" */
function money(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${Math.trunc(a / 100).toLocaleString("en-US")}.${pad2(a % 100)}`;
}
const num = (n: number) => n.toLocaleString("en-US");
const ymdParts = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};
/** "2026-11-07" ⇒ "7 พ.ย. 2569" */
function thDate(ymd: string): string {
  const p = ymdParts(ymd);
  return p ? `${p.d} ${MONTHS_SHORT[p.m - 1] ?? ""} ${p.y + 543}` : ymd;
}
/** "2026-09-30" ⇒ "30 ก.ย." */
function thDayMonth(ymd: string): string {
  const p = ymdParts(ymd);
  return p ? `${p.d} ${MONTHS_SHORT[p.m - 1] ?? ""}` : ymd;
}
/** วันในสัปดาห์จากเลขวัน (1 ม.ค. 1970 = พฤหัส) — ไม่พึ่งเขตเวลาของเครื่อง */
function thWeekday(ymd: string): string {
  const p = ymdParts(ymd);
  if (!p) return "";
  const days = Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
  return WEEKDAY_SHORT[(((days + 4) % 7) + 7) % 7] ?? "";
}
const reasonOf = (r: unknown): string | null => {
  if (!r || typeof r !== "object") return null;
  const x = r as { ok?: unknown; reason?: unknown };
  return x.ok === false && typeof x.reason === "string" ? x.reason : null;
};
const BLOCK_TH: Record<string, string> = {
  NEEDS_APPROVAL: "รออนุมัติหักเกินวงเงินจากเจ้าของ",
  DEDUCTION_REJECTED: "เจ้าของไม่อนุมัติการหัก — เปิดใบสรุปใหม่",
  NOT_FROZEN: "ส่งใบสรุปให้ผู้เช่าดูก่อน",
  NOT_MOVED_OUT: "ยังไม่ถึงวันย้ายออก",
  BILL_PENDING: "มีบิลที่ยังไม่ส่ง",
  SETTLED: "ปิดเงินประกันแล้ว",
  NOT_EDITABLE: "ใบนี้ถูกยกเลิก",
  NOT_INSPECTED: "ยังไม่ได้ตรวจห้อง",
};

function lineLabel(l: SummaryLine): string {
  if ((l.code === "ELEC" || l.code === "WATER") && l.qty && typeof l.unitPriceSatang === "number")
    return `หัก ${l.code === "ELEC" ? "ค่าไฟ" : "ค่าน้ำ"} ${num(l.qty)} × ${money(l.unitPriceSatang)}`;
  if (l.code === "DAMAGE") return `หัก ${l.labelTh} (${(l.evidenceCount ?? 0) > 0 ? "มีหลักฐาน" : "ไม่มีหลักฐาน"})`;
  if (l.code === "ADVANCE_RENT") return l.labelTh;
  return `หัก ${l.labelTh}`;
}

type StepState = "done" | "current" | "todo";
export default function MoveOutScreen({ unitSlug, model, actions }: MoveOutScreenProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const closed = model.status === "SETTLED" || model.status === "REFUNDED";
  const frozen = !!model.frozen;
  const steps: { key: "NOTICE" | "INSPECT" | "SUMMARY" | "REFUND"; label: string; state: StepState }[] = [
    { key: "NOTICE", label: `แจ้งล่วงหน้า ${thDayMonth(model.noticeDate)}`, state: "done" },
    { key: "INSPECT", label: "ตรวจห้อง", state: closed || frozen ? "done" : "current" },
    { key: "SUMMARY", label: "สรุปเงิน", state: closed ? "done" : frozen ? "current" : "todo" },
    { key: "REFUND", label: "คืนเงิน", state: closed ? "done" : "todo" },
  ];
  const run = async (name: string, input: Record<string, unknown>) => {
    const fn = actions?.[name] as ((i: Record<string, unknown>) => Promise<unknown>) | undefined;
    if (!fn) return;
    setBusy(name);
    setMsg(null);
    try {
      const r = await fn(input);
      const why = reasonOf(r);
      setMsg(why ?? "บันทึกแล้ว");
      if (!why && typeof window !== "undefined") window.location.reload();
    } finally {
      setBusy(null);
    }
  };
  const meterOf = (kind: "ELEC" | "WATER") => model.meters.find((m) => m.kind === kind) ?? null;
  const unpaid = model.lines.filter((l) => l.code === "UNPAID");
  const settleBlocked = !model.canSettle.ok;
  const sendBlocked = !model.canSend.ok || frozen;
  const overdueDays = -model.daysLeft;

  return (
    <div data-dorm-moveout={model.moveOutId} className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      {/* หัว + ขั้น */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-xl font-bold md:text-2xl">{`ย้ายออก · ห้อง ${model.roomNumber} · ${model.tenantName}`}</h1>
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {steps.map((s, i) => (
            <li key={s.key} data-moveout-step={s.key} data-state={s.state} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${s.state === "current" ? "border-[color:var(--color-accent,#2563eb)] bg-[color:var(--color-accent,#2563eb)] text-white" : "border-[color:var(--color-line,#d4d4d4)]"}`}
              >
                {s.state === "done" ? "✓" : i + 1}
              </span>
              <span className={s.state === "current" ? "font-bold text-[color:var(--color-accent,#2563eb)]" : "text-[color:var(--color-ink-soft)]"}>{s.label}</span>
              {i < steps.length - 1 ? <span aria-hidden className="hidden h-px w-8 bg-[color:var(--color-line,#d4d4d4)] sm:inline-block" /> : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:flex-row">
        {/* ซ้าย: นับถอยหลัง + ตรวจห้อง */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {!closed && model.status !== "CANCELLED" ? (
            <div
              data-refund-countdown
              data-days-left={String(model.daysLeft)}
              data-overdue={model.refundOverdue ? "true" : "false"}
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm ${model.refundOverdue ? "border-red-300 bg-red-50" : "border-blue-300 bg-blue-50"}`}
            >
              {model.refundOverdue ? (
                <span className="font-bold">{`เลยกำหนดคืนเงินประกัน ${overdueDays} วัน`}</span>
              ) : (
                <span>
                  <b>{`ต้องคืนเงินประกันภายใน ${thWeekday(model.refundDueDate)} ${thDate(model.refundDueDate)}`}</b>
                  {` (${model.returnDays} วันหลังย้ายออก) · ระบบเตือนผู้ดูแลทุกวันจนกว่าจะโอน`}
                </span>
              )}
              <span className="flex-1" />
              {!model.refundOverdue ? <span className="rounded-md border border-blue-400 px-2 py-0.5 text-xs font-bold text-blue-700">{`เหลือ ${model.daysLeft} วัน`}</span> : null}
            </div>
          ) : null}

          <section className="min-w-0 rounded-2xl border border-[color:var(--color-line,#e5e5e5)] bg-white">
            <header className="flex flex-wrap items-baseline gap-2 px-5 pb-1 pt-4">
              <h2 className="text-sm font-bold">{`ตรวจห้อง — เทียบรูปวันเข้า (${thDate(model.moveInDate)}) กับวันนี้`}</h2>
              <span className="flex-1" />
              <span className="text-xs text-[color:var(--color-ink-soft)]">ทุกจุดที่หักต้องมีรูป/ใบเสร็จ · ค่าเสื่อมจากการใช้งานปกติหักไม่ได้</span>
            </header>
            <div className="flex flex-col">
              {model.checklist.map((it) => {
                const dmg = it.verdict === "DAMAGE";
                return (
                  <div
                    key={it.key}
                    data-inspect-item={it.key}
                    data-verdict={it.verdict ?? ""}
                    className={`flex flex-wrap items-center gap-3 border-t border-[color:var(--color-line,#eee)] px-5 py-3 first:border-t-0 ${dmg ? "bg-neutral-50" : ""}`}
                  >
                    <span className="w-44 flex-none">
                      <b className={`block text-sm ${dmg ? "border-l-4 border-red-600 pl-2" : ""}`}>{it.labelTh}</b>
                      {it.note ? <small className="text-xs text-[color:var(--color-ink-soft)]">{it.note}</small> : null}
                    </span>
                    <span className="flex gap-2">
                      {model.moveInPhotos.length ? (
                        <a href={model.moveInPhotos[0].url} className="flex h-12 w-20 items-center justify-center rounded-lg border bg-neutral-50 text-xs text-[color:var(--color-ink-soft)]">
                          วันเข้า
                        </a>
                      ) : null}
                      {dmg ? <span className="flex h-12 w-20 items-center justify-center rounded-lg border bg-neutral-50 text-xs text-[color:var(--color-ink-soft)]">{`หลักฐาน ${it.evidenceCount} ไฟล์`}</span> : null}
                    </span>
                    <span className="flex-1" />
                    <span className="inline-flex overflow-hidden rounded-lg border text-xs" role="group" aria-label="ผลตรวจ">
                      <span className={`px-3 py-1.5 ${it.verdict === "NORMAL" ? "bg-neutral-900 font-bold text-white" : "text-[color:var(--color-ink-soft)]"}`}>ใช้งานปกติ</span>
                      <span className={`px-3 py-1.5 ${dmg ? "bg-red-600 font-bold text-white" : "text-[color:var(--color-ink-soft)]"}`}>เสียหาย</span>
                    </span>
                    <span className="w-28 text-right text-sm font-bold tabular-nums">
                      {dmg ? `฿${money(it.amountSatang)}` : it.verdict === "NORMAL" ? <span className="font-normal text-[color:var(--color-ink-soft)]">หักไม่ได้</span> : "—"}
                    </span>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--color-line,#eee)] px-5 py-3">
                <span className="w-44 flex-none">
                  <b className="block text-sm">มิเตอร์วันออก</b>
                  {model.meterReadAt ? <small className="text-xs text-[color:var(--color-ink-soft)]">บันทึกแล้ว</small> : null}
                </span>
                <span className="flex flex-wrap gap-x-3 text-sm text-[color:var(--color-ink-soft)]">
                  {(["ELEC", "WATER"] as const).map((k) => {
                    const m = meterOf(k);
                    if (!m) return null;
                    return (
                      <span key={k} data-moveout-meter={k}>
                        {`${k === "ELEC" ? "ไฟ" : "น้ำ"} ${num(m.baseValue)} → `}
                        <b className="text-neutral-900">{m.value === null ? "ยังไม่จด" : num(m.value)}</b>
                        {m.units === null ? "" : ` (${num(m.units)} หน่วย)`}
                      </span>
                    );
                  })}
                  {!model.meters.length ? <span>ห้องนี้ไม่มีมิเตอร์น้ำไฟ</span> : <span>นับจากเลขที่ออกบิลครั้งล่าสุด</span>}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* ขวา: แผงสรุป */}
        <aside data-moveout-summary className="flex w-full min-w-0 flex-col rounded-2xl border border-[color:var(--color-line,#e5e5e5)] bg-white lg:w-[400px] lg:flex-none">
          <div className="border-b px-5 py-4">
            <div className="text-xs text-[color:var(--color-ink-soft)]">{`สรุปเงินประกัน · ห้อง ${model.roomNumber}`}</div>
            <h2 className="text-xl font-bold">{model.tenantOwesSatang > 0 && model.refundSatang === 0 ? `ผู้เช่าต้องจ่ายเพิ่ม ฿${money(model.tenantOwesSatang)}` : `คืนผู้เช่า ฿${money(model.refundSatang)}`}</h2>
          </div>
          <div className="flex flex-col gap-1 px-5 py-4 text-sm">
            <div className="flex items-baseline gap-2">
              <span>เงินประกันที่ถือไว้</span>
              <span className="flex-1 border-b border-dotted" />
              <span className="font-bold tabular-nums">{money(model.heldSatang)}</span>
            </div>
            {model.lines.map((l, i) => (
              <div key={`${l.code}-${i}`} data-summary-line={l.code} className="flex items-baseline gap-2">
                <span>{lineLabel(l)}</span>
                <span className="flex-1 border-b border-dotted" />
                <span className={`tabular-nums ${l.amountSatang > 0 ? "text-red-700" : ""}`}>{l.amountSatang > 0 ? `−${money(l.amountSatang)}` : `+${money(-l.amountSatang)}`}</span>
              </div>
            ))}
            {!unpaid.length ? (
              <div className="flex items-baseline gap-2">
                <span>ค่าห้องค้าง</span>
                <span className="flex-1 border-b border-dotted" />
                <span className="tabular-nums">0.00</span>
              </div>
            ) : null}
            <div className="mt-2 flex items-baseline gap-2 border-t pt-2 text-base font-bold">
              {model.tenantOwesSatang > 0 ? (
                <>
                  <span>ผู้เช่าต้องจ่ายเพิ่ม</span>
                  <span className="flex-1" />
                  <span data-owes-amount className="tabular-nums">{`฿${money(model.tenantOwesSatang)}`}</span>
                </>
              ) : (
                <>
                  <span>คืนผู้เช่า</span>
                  <span className="flex-1" />
                  <span data-refund-amount className="tabular-nums">{`฿${money(model.refundSatang)}`}</span>
                </>
              )}
            </div>
            <ul className="mt-3 flex flex-col overflow-hidden rounded-xl border">
              <li className="flex gap-3 border-b px-4 py-3">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-neutral-900 text-xs text-white">✓</span>
                <span>
                  ไม่หักค่าทาสี/ทำความสะอาดทั่วไป
                  <small className="block text-xs text-[color:var(--color-ink-soft)]">ถือเป็นการใช้งานปกติ</small>
                </span>
              </li>
              <li className="flex gap-3 border-b px-4 py-3">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-neutral-900 text-xs text-white">✓</span>
                <span>
                  ทุกรายการที่หักมีรูป/ใบเสร็จแนบ
                  <small className="block text-xs text-[color:var(--color-ink-soft)]">ส่งให้ผู้เช่าดูในใบสรุป</small>
                </span>
              </li>
              <li className="flex gap-3 px-4 py-3">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border text-xs">{model.returnDays}</span>
                <span>
                  {`โอนคืนภายใน ${thDate(model.refundDueDate)}`}
                  <small className="block text-xs text-[color:var(--color-ink-soft)]">ตามประกาศ สคบ. เรื่องสัญญาเช่าที่อยู่อาศัย</small>
                </span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-[color:var(--color-ink-soft)]">
              {`ลงบัญชีให้เอง: ล้างเงินประกันรับ ฿${money(model.heldSatang)} · ค่าใช้จ่ายวันออก ฿${money(model.chargesSatang)} · จ่ายคืน ฿${money(model.refundSatang)} · ห้อง ${model.roomNumber} → ทำความสะอาด`}
            </p>
            {model.warnings.length ? <p className="mt-2 text-xs text-amber-700">{`ตรวจสอบ: ${model.warnings.join(" · ")}`}</p> : null}
            {msg ? <p className="mt-2 text-xs">{msg}</p> : null}
          </div>
          <div className="mt-auto flex gap-2 border-t px-5 py-4">
            <button
              type="button"
              data-action="send-summary"
              disabled={sendBlocked || busy !== null}
              {...(sendBlocked && model.canSend.code ? { "data-blocked": model.canSend.code } : {})}
              onClick={() => run("send", { moveOutId: model.moveOutId })}
              className="flex-1 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50"
            >
              {frozen ? "ส่งใบสรุปแล้ว" : "ส่งใบสรุปให้ดูก่อน"}
            </button>
            <button
              type="button"
              data-action="settle"
              disabled={settleBlocked || busy !== null}
              {...(settleBlocked && model.canSettle.code ? { "data-blocked": model.canSettle.code } : {})}
              onClick={() => run("settle", { moveOutId: model.moveOutId })}
              className="flex-[1.3] rounded-lg bg-neutral-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {model.canSettle.code === "NEEDS_APPROVAL" ? "รออนุมัติ" : "ยืนยัน · โอนคืน"}
            </button>
          </div>
          {settleBlocked && model.canSettle.code && model.canSettle.code !== "SETTLED" ? (
            <p className="px-5 pb-4 text-xs text-[color:var(--color-ink-soft)]">{BLOCK_TH[model.canSettle.code] ?? "ยังปิดเงินประกันไม่ได้"}</p>
          ) : null}
          <a href={`/app/u/${unitSlug}/dorm/tenants?tab=NOTICE`} className="sr-only">
            กลับรายชื่อผู้เช่า
          </a>
        </aside>
      </div>
    </div>
  );
}
