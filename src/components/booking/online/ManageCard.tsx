"use client";

// SVC B.7 — หน้าจัดการนัดของลูกค้า (/bq/m/<token> · มือถือ) · สัญญา DOM: ใบสั่ง svc-brief-b.7 §4
//   ดูนัด · ยกเลิก (ฟอร์ม + ยืนยัน) · เลื่อน (โหมด ?r=1: ช่าง/วัน/เวลาแบบขั้น 2 ของหน้าจอง · เวลาว่างแต่ละช่อง = ฟอร์ม) · .ics · ช่องมัดจำ (B.8)
// 🔴 ไม่มีชื่อ/เบอร์/note ลูกค้า (ลิงก์อาจถูกส่งต่อ · §6 ข้อ 6) · err = รหัส → ข้อความ dict (ไม่แสดงข้อความอิสระจาก URL — บทเรียน K2)
// 🔴 at (นาฬิกา QC) ⇒ hidden ทุกฟอร์ม + คงในลิงก์ · ไม่ import ค่าจาก lib/modules (type เท่านั้น)
import type { ManageView } from "@/lib/modules/booking/online";
import { makeT } from "@/lib/i18n";
import { dateLong, dayChip, dayLabel, hhmm, money } from "./fmt";

type Props = {
  view: ManageView;
  token: string;
  actions: { cancel: (fd: FormData) => Promise<void>; reschedule: (fd: FormData) => Promise<void> };
  at?: string;
  err?: string | null;
};

export default function ManageCard({ view, token, actions, at, err }: Props) {
  const l = view.locale;
  const t = makeT(l);
  const base = `/bq/m/${encodeURIComponent(token)}`;
  const link = (sel: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sel)) if (v) p.set(k, v);
    if (at) p.set("at", at);
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const AtField = () => (at ? <input type="hidden" name="at" value={at} /> : null);
  const errKey = typeof err === "string" && /^[A-Z_]{1,40}$/.test(err) ? `bk7.err.${err}` : null;
  const errText = errKey ? (t(errKey) === errKey ? t("bk7.err.DEFAULT") : t(errKey)) : null;
  const cancelled = view.status === "CANCELLED";
  const cancelledKey = `bk7.m.cancelled.${view.cancelReason ?? "OTHER"}`;
  const cancelledText = t(cancelledKey) === cancelledKey ? t("bk7.m.cancelled.OTHER") : t(cancelledKey);
  const pol = view.policy;
  const rs = view.reschedule;
  const blocked = !view.canCancel && !view.canReschedule;
  const lang = l;
  const chip = (on: boolean) =>
    `inline-flex min-h-[42px] items-center rounded-xl border px-3.5 text-[14px] ${on ? "border-[#0a0a0a] bg-[#0a0a0a] font-bold text-white" : "border-[#e5e5e5] bg-white"}`;

  return (
    <div data-bk-manage="" data-status={view.status} className="mx-auto flex w-full max-w-[420px] flex-col gap-4 px-5 py-6 text-[#0a0a0a]">
      <div>
        <p className="text-[13px] text-[#737373]">
          {view.tenantName} · {view.unitName}
        </p>
        <h1 className="text-[22px] font-bold">{t("bk7.m.title")}</h1>
      </div>

      {errText ? (
        <p role="alert" className="rounded-xl bg-[#fef2f2] px-3 py-2 text-[13px] text-[#dc2626]">
          {errText}
        </p>
      ) : null}

      <div data-bk-manage-when="" data-start={String(view.startMs)} className="flex flex-col gap-1 rounded-[20px] bg-[#0a0a0a] p-5 text-white">
        <p className="text-[13px] text-white/75">{cancelled ? cancelledText : t(`bk7.m.status.${view.status}`)}</p>
        <p className={`text-[22px] font-bold ${cancelled ? "line-through opacity-70" : ""}`}>
          {dateLong(view.startMs, l)} · {hhmm(view.startMs)}–{hhmm(view.endMs)}
        </p>
        <p className="text-[15px] text-white/90">
          {view.serviceName}
          {view.anyStaff ? ` · ${t("bk7.m.anyStaff")}${view.staffName ? ` (${view.staffName})` : ""}` : view.staffName ? ` · ${view.staffName}` : ""}
        </p>
      </div>

      <div className="flex flex-col rounded-2xl border border-[#e5e5e5] px-4 py-2 text-[14.5px]">
        <div className="flex gap-2.5 py-2">
          <span className="flex-1">{t("bk7.m.price")}</span>
          <span className="font-bold">{money(view.priceSatang, l)}</span>
        </div>
        {view.depositSatang > 0 ? (
          <div className="py-2 text-[#525252]">
            {view.depositPaid
              ? t("bk7.m.depPaid", { amt: money(view.depositSatang, l) })
              : view.holdUntilMs !== null
                ? t("bk7.m.depDue", { amt: money(view.depositSatang, l), time: hhmm(view.holdUntilMs) })
                : t("bk7.m.depUnpaid", { amt: money(view.depositSatang, l) })}
          </div>
        ) : null}
      </div>

      {view.holdUntilMs !== null ? (
        <div data-bk-deposit-slot="" className="flex items-center gap-3.5 rounded-2xl border border-[#e5e5e5] p-3">
          <span className="grid h-[72px] w-[72px] flex-none place-items-center rounded-xl border border-dashed border-[#d4d4d4] text-[22px] text-[#a3a3a3]" aria-hidden>
            ▦
          </span>
          <div>
            <b className="block text-[15px]">{t("bk7.dep.title", { amt: money(view.depositSatang, l) })}</b>
            <small className="block text-[12.5px] text-[#737373]">{t("bk7.m.depDue", { amt: money(view.depositSatang, l), time: hhmm(view.holdUntilMs) })}</small>
          </div>
        </div>
      ) : null}

      <div data-bk-manage-policy="" className="rounded-2xl bg-[#f4f5f7] px-4 py-3 text-[13px] leading-relaxed text-[#404040]">
        {pol.graceMin !== null ? (
          <p>
            <b className="text-[#0a0a0a]">{t("bk7.policy.grace", { n: pol.graceMin })}</b>{" "}
            {pol.afterGrace === "RELEASE_REQUEUE" ? t("bk7.policy.release") : t("bk7.policy.wait")}
          </p>
        ) : null}
        <p>
          <b className="text-[#0a0a0a]">{t("bk7.policy.free")}</b>{" "}
          {t("bk7.policy.until", { when: `${dateLong(view.freeUntilMs, l)} ${hhmm(view.freeUntilMs)}`, before: durText(pol.freeChangeBeforeMin, lang) })}
        </p>
        {pol.selfRescheduleMax > 0 && !cancelled ? <p>{t("bk7.m.left", { n: view.rescheduleLeft })}</p> : null}
      </div>

      {blocked ? (
        <div data-bk-late="" data-code={view.cancelBlock ?? view.rescheduleBlock ?? "BAD_STATE"} className="rounded-2xl border border-[#e5e5e5] px-4 py-3 text-[13.5px] text-[#404040]">
          <p className="font-bold">{t(`bk7.m.late.${view.cancelBlock ?? view.rescheduleBlock ?? "BAD_STATE"}`)}</p>
          {view.depositSatang > 0 && pol.forfeitPct !== null && !cancelled ? <p className="mt-1 text-[#737373]">{t("bk7.m.lateDeposit", { pct: pol.forfeitPct })}</p> : null}
        </div>
      ) : null}
      {!blocked && !view.canReschedule && view.rescheduleBlock === "MAX_RESCHEDULE" && pol.selfRescheduleMax > 0 ? (
        <p className="text-[13px] text-[#737373]">{t("bk7.m.maxNote")}</p>
      ) : null}

      {rs ? (
        <div data-bk-reschedule-panel="" className="flex flex-col gap-4 rounded-2xl border border-[#0a0a0a] p-4">
          <div className="flex items-center">
            <p className="flex-1 text-[15px] font-bold">{t("bk7.m.pickNew")}</p>
            <a href={link({})} className="text-[13px] text-[#737373] underline">
              {t("bk7.m.closeResched")}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {rs.anyStaff || rs.staff.length ? (
              <>
                {rs.anyStaff ? (
                  <a href={link({ r: "1", staff: "any", date: rs.dateSel })} data-bk-staff="any" {...(rs.staffSel === "any" ? { "data-on": "" } : {})} className={chip(rs.staffSel === "any")}>
                    {t("bk7.anyStaff")}
                  </a>
                ) : null}
                {rs.staff.map((s) => (
                  <a key={s.id} href={link({ r: "1", staff: s.id, date: rs.dateSel })} data-bk-staff={s.id} {...(rs.staffSel === s.id ? { "data-on": "" } : {})} className={chip(rs.staffSel === s.id)}>
                    {s.name}
                  </a>
                ))}
              </>
            ) : (
              <p className="text-[13px] text-[#737373]">{t("bk7.noStaff")}</p>
            )}
          </div>
          {rs.staffSel ? (
            <div className="-mx-4 overflow-x-auto px-4">
              <div className="grid auto-cols-[calc((100%-32px)/5)] grid-flow-col gap-2">
                {rs.days.map((d) => {
                  const c = dayChip(d.dateStr, l);
                  const on = d.dateStr === rs.dateSel;
                  const cls = `flex min-h-[60px] flex-col items-center justify-center rounded-xl border text-[12px] leading-tight ${
                    on ? "border-[#0a0a0a] bg-[#0a0a0a] text-white" : d.closed ? "border-[#e5e5e5] bg-[#f4f5f7] text-[#a3a3a3]" : "border-[#e5e5e5] text-[#737373]"
                  }`;
                  const body = (
                    <>
                      <span>{c.wd}</span>
                      <b className={`text-[15px] ${on ? "text-white" : d.closed ? "text-[#a3a3a3]" : "text-[#0a0a0a]"}`}>{c.day}</b>
                      <span>{d.closed ? t("bk7.closedDay") : c.mon}</span>
                    </>
                  );
                  return d.closed ? (
                    <span key={d.dateStr} data-bk-day={d.dateStr} data-closed="" className={cls}>
                      {body}
                    </span>
                  ) : (
                    <a key={d.dateStr} href={link({ r: "1", staff: rs.staffSel, date: d.dateStr })} data-bk-day={d.dateStr} {...(on ? { "data-on": "" } : {})} className={cls}>
                      {body}
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}
          {rs.dateSel && rs.staffSel ? (
            <>
              <p className="text-[13px] font-bold">
                {t("bk7.time")} · {dayLabel(rs.dateSel, l)}
              </p>
              {rs.times.every((x) => !x.free) ? <p className="text-[13px] text-[#737373]">{t("bk7.noTimes")}</p> : null}
              <div className="grid grid-cols-4 gap-2">
                {rs.times.map((x) =>
                  x.free ? (
                    <form key={x.startMin} action={actions.reschedule} data-bk-reschedule-form="" data-bk-time={x.hhmm} data-free="1" className="contents">
                      <AtField />
                      <input type="hidden" name="date" value={rs.dateSel ?? ""} />
                      <input type="hidden" name="startMin" value={String(x.startMin)} />
                      <input type="hidden" name="staffId" value={rs.staffSel === "any" ? "" : (rs.staffSel ?? "")} />
                      <button type="submit" className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#e5e5e5] text-[15px] font-bold">
                        {x.hhmm}
                      </button>
                    </form>
                  ) : (
                    <span key={x.startMin} data-bk-time={x.hhmm} data-free="0" className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#f0f0f0] bg-[#f4f5f7] text-[15px] text-[#a3a3a3] line-through">
                      {x.hhmm}
                    </span>
                  ),
                )}
              </div>
              <p className="text-[12px] text-[#737373]">{t("bk7.strikeNote")}</p>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {view.canReschedule && !rs ? (
          <a href={link({ r: "1" })} data-bk-reschedule="" className="flex min-h-[52px] items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white text-[15px] font-bold">
            {t("bk7.m.reschedule")}
          </a>
        ) : null}
        {view.canCancel ? (
          <form
            action={actions.cancel}
            data-bk-cancel=""
            className="contents"
            onSubmit={(e) => {
              if (!window.confirm(t("bk7.m.cancelAsk"))) e.preventDefault();
            }}
          >
            <AtField />
            <button type="submit" data-bk-cancel-btn="" className="flex min-h-[52px] items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white text-[15px] font-bold text-[#dc2626]">
              {t("bk7.m.cancel")}
            </button>
          </form>
        ) : null}
      </div>

      <a data-bk-ics="" href={view.icsPath} className="self-start text-[14px] font-semibold underline">
        {t("bk7.m.ics")}
      </a>
    </div>
  );
}

function durText(min: number, l: "th" | "en"): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (l === "en") return h === 0 ? `${m} min` : m === 0 ? `${h} hr` : `${h} hr ${m} min`;
  return h === 0 ? `${m} นาที` : m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}
