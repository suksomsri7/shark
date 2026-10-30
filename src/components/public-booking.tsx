"use client";

// SVC B.7 — หน้าจองออนไลน์ 3 ขั้น (ภาพ จอง 03 ก ข ค · มือถือ 390) · สัญญา DOM: ใบสั่ง svc-brief-b.7 §4
//   ทุกขั้นอยู่ใน URL (GET `?svc=&staff=&date=&time=` คง who/lang) ⇒ render จาก server ได้ทุกขั้น · ไม่มีสถานะลับใน client
//   ขั้น 3 ส่ง = fetch POST /api/store/<t>/<u>/book → ok ⇒ ไปหน้าจัดการนัด · ล้ม ⇒ ข้อความจาก dict ตามรหัส
// 🔴 ข้อความทุกตัวจาก dict ตาม view.locale · หน้า en ไม่มีอักษรไทยนอกข้อมูลร้าน · ไม่มีชื่อ/เบอร์ลูกค้าคนอื่น · ตัวตน LINE = ชื่อ + เบอร์ปิด
// 🔴 ไม่ import ค่าจาก lib/modules (import type เท่านั้น) · ไม่มีคีย์ค่าตั้ง — นโยบายมาจาก view
// ต่างจากภาพโดยตั้งใจ (§4): ไม่มี checkbox แจ้งเตือน LINE · ไม่มีกล่องรับบัตรคิวออนไลน์ (B.9) · QR พร้อมเพย์ = B.8 (ช่อง data-bk-deposit-slot)
import { useState, type FormEvent, type ReactNode } from "react";
import type { OnlineBookingView, OnlineQuery } from "@/lib/modules/booking/online";
import { makeT } from "@/lib/i18n";
import { dateLong, dayChip, dayLabel, duration, hhmm, hoursLine, initials, money } from "./booking/online/fmt";

type Props = { view: OnlineBookingView; basePath: string; query: OnlineQuery; idempotencyKey: string };

const INK = "#0a0a0a";

function hrefOf(basePath: string, query: OnlineQuery, sel: { svc?: string | null; staff?: string | null; date?: string | null; time?: string | null }): string {
  const p = new URLSearchParams();
  if (sel.svc) p.set("svc", sel.svc);
  if (sel.staff) p.set("staff", sel.staff);
  if (sel.date) p.set("date", sel.date);
  if (sel.time) p.set("time", sel.time);
  if (typeof query.who === "string" && query.who) p.set("who", query.who);
  if (typeof query.lang === "string" && query.lang) p.set("lang", query.lang);
  const qs = p.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" aria-hidden>
      {[1, 2, 3].map((n) => (
        <i key={n} className={`block h-1 rounded-full ${n <= step ? "bg-[#0a0a0a]" : "bg-[#e5e5e5]"}`} />
      ))}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-[14px] font-bold text-[#0a0a0a]">{children}</p>;
}

export default function PublicBooking({ view, basePath, query, idempotencyKey }: Props) {
  const l = view.locale;
  const t = makeT(l);
  const svc = view.service;
  const at = (sel: { staff?: string | null; date?: string | null; time?: string | null }) =>
    hrefOf(basePath, query, { svc: svc?.id ?? null, staff: view.staffSel, date: view.dateSel, ...sel });
  const backHref = view.step === 3 ? at({ time: null }) : view.step === 2 ? hrefOf(basePath, query, {}) : null;
  const staffName = view.staffSel && view.staffSel !== "any" ? view.staff.find((s) => s.id === view.staffSel)?.name ?? null : null;
  // U1: แตะการ์ดบริการ/เวลา (มี JS) = เลือก แล้วปุ่มดำล่างพาไปขั้นถัดไป (ลิงก์ GET) · ไม่มี JS = ลิงก์ของการ์ดพาไปเอง
  const [pickSvc, setPickSvc] = useState<string | null>(null);
  const [pickTime, setPickTime] = useState<number | null>(null);
  const hours = hoursLine(view.unitHours ?? [], l);
  const pickedSvc = pickSvc ? view.services.find((s) => s.id === pickSvc) ?? null : null;
  const pickedTime = pickTime !== null ? view.times.find((x) => x.startMin === pickTime && x.free) ?? null : null;
  const cta: { href: string; label: string } | null =
    view.step === 1 && pickedSvc ? { href: hrefOf(basePath, query, { svc: pickedSvc.id }), label: t("bk7.next", { label: pickedSvc.name }) }
      : view.step === 2 && pickedTime && view.dateSel ? { href: at({ time: pickedTime.hhmm }), label: t("bk7.next", { label: `${dayLabel(view.dateSel, l)} ${pickedTime.hhmm}` }) }
        : null;

  return (
    <div data-bk-online="" data-step={String(view.step)} data-locale={l} className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col bg-white text-[#0a0a0a]">
      <div className="flex items-center gap-3 px-5 pt-4">
        {backHref ? (
          <a href={backHref} aria-label={t("bk7.back")} className="grid h-10 w-10 place-items-center rounded-xl border border-[#e5e5e5] text-[18px]">
            ‹
          </a>
        ) : (
          <span className="h-10 w-10" aria-hidden />
        )}
        <span className="flex-1" />
        {view.locales.length > 1
          ? view.locales
              .filter((x) => x !== l)
              .map((x) => (
                <a key={x} href={hrefOf(basePath, { ...query, lang: x }, { svc: svc?.id ?? null, staff: view.staffSel, date: view.dateSel, time: view.timeSel?.hhmm ?? null })} hrefLang={x} className="rounded-lg border border-[#e5e5e5] px-2 py-1 text-[12px] font-semibold uppercase text-[#525252]">
                  {x}
                </a>
              ))
          : null}
        <span className="text-[13px] text-[#737373]">{t("bk7.step", { n: view.step })}</span>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 pb-32 pt-4">
        {view.step === 1 ? (
          <div className="flex items-center gap-3">
            <span className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] bg-[#0a0a0a] text-[15px] font-bold text-white">{initials(view.unitName)}</span>
            <div className="min-w-0">
              <p className="truncate text-[16px] font-bold">{view.unitName}</p>
              <p className="truncate text-[12.5px] text-[#737373]">
                {hours ? `${t("bk7.hours.open", { days: hours.days, time: hours.time })}${hours.closed ? ` · ${t("bk7.hours.closed", { days: hours.closed })}` : ""}` : view.tenantName}
              </p>
            </div>
          </div>
        ) : null}
        <StepBar step={view.step} />
        {view.identity ? (
          <p data-bk-identity="" className="flex items-center gap-2 rounded-xl bg-[#f4f5f7] px-3 py-2 text-[13px] text-[#404040]">
            <span aria-hidden>✓</span>
            {t("bk7.fromLine", { name: view.identity.name, phone: view.identity.phoneMasked })}
          </p>
        ) : null}

        {view.step === 1 ? <StepOne view={view} t={t} hrefFor={(id) => hrefOf(basePath, query, { svc: id })} pick={pickSvc} onPick={setPickSvc} /> : null}
        {view.step >= 2 && svc ? (
          view.step === 2 ? (
            <StepTwo view={view} t={t} at={at} staffName={staffName} pick={pickTime} onPick={setPickTime} />
          ) : (
            <StepThree view={view} t={t} basePath={basePath} query={query} idempotencyKey={idempotencyKey} staffName={staffName} />
          )
        ) : null}
      </div>

      {view.step !== 3 ? (
        <div className="sticky bottom-0 border-t border-[#f0f0f0] bg-white px-5 py-4">
          {cta ? (
            <a href={cta.href} data-bk-next="" className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-[#0a0a0a] px-4 text-[16px] font-bold text-white">
              {cta.label}
            </a>
          ) : (
            <span className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-[#d4d4d4] px-4 text-[16px] font-bold text-white" aria-disabled>
              {view.step === 1 ? t("bk7.ctaService") : t("bk7.ctaTime")}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

type T = ReturnType<typeof makeT>;

/** epoch ms ของวันไทย + นาที (ไม่ใช้นาฬิกาเครื่อง) */
const bkkMs = (ds: string, min: number): number => {
  const [y, m, d] = ds.split("-").map(Number);
  return Date.UTC(y, m - 1, d) + (min - 420) * 60_000;
};

function StepOne({ view, t, hrefFor, pick, onPick }: { view: OnlineBookingView; t: T; hrefFor: (id: string) => string; pick: string | null; onPick: (id: string) => void }) {
  const l = view.locale;
  return (
    <>
      <Label>{t("bk7.pickService")}</Label>
      {view.services.length === 0 ? <p className="text-[14px] text-[#737373]">{t("bk7.noServices")}</p> : null}
      <div className="flex flex-col gap-2.5">
        {view.services.map((s) => (
          <a
            key={s.id}
            href={hrefFor(s.id)}
            data-bk-service={s.id}
            onClick={(e) => {
              e.preventDefault();
              onPick(s.id);
            }}
            className={`flex min-h-[64px] items-center gap-3 rounded-2xl px-4 py-3 ${pick === s.id ? "border-2 border-[#0a0a0a]" : "border border-[#e5e5e5]"}`}
          >
            <span className="flex flex-1 flex-col">
              <b className="text-[16px]">{s.name}</b>
              <small className="text-[13px] text-[#737373]">
                {duration(s.durationMin, l)}
                {s.depositSatang > 0 ? (
                  <span data-bk-deposit="" className="ml-1.5 rounded-md bg-[#e8eefc] px-1.5 py-px text-[12px] font-bold text-[#1d4ed8]">
                    {t("bk7.deposit", { amt: money(s.depositSatang, l) })}
                  </span>
                ) : null}
              </small>
            </span>
            <span className="text-[16px] font-bold">{money(s.priceSatang, l)}</span>
          </a>
        ))}
      </div>
    </>
  );
}

function StepTwo({ view, t, at, staffName, pick, onPick }: { view: OnlineBookingView; t: T; at: (sel: { staff?: string | null; date?: string | null; time?: string | null }) => string; staffName: string | null; pick: number | null; onPick: (m: number) => void }) {
  const l = view.locale;
  const svc = view.service!;
  const chip = (on: boolean) =>
    `inline-flex min-h-[42px] items-center rounded-xl border px-3.5 text-[14px] ${on ? "border-[#0a0a0a] bg-[#0a0a0a] font-bold text-white" : "border-[#e5e5e5] bg-white"}`;
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label>{t("bk7.staff")}</Label>
        <div className="flex flex-wrap gap-2">
          {view.anyStaff ? (
            <a href={at({ staff: "any", time: null })} data-bk-staff="any" {...(view.staffSel === "any" ? { "data-on": "" } : {})} className={chip(view.staffSel === "any")}>
              {t("bk7.anyStaff")}
            </a>
          ) : null}
          {view.staff.map((s) => (
            <a key={s.id} href={at({ staff: s.id, time: null })} data-bk-staff={s.id} {...(view.staffSel === s.id ? { "data-on": "" } : {})} className={chip(view.staffSel === s.id)}>
              {s.name}
            </a>
          ))}
        </div>
        {view.staff.length ? (
          <p className="text-[12.5px] text-[#737373]">{t("bk7.canDo", { service: svc.name, names: view.staff.map((s) => s.name).join(" · ") })}</p>
        ) : (
          <p className="text-[12.5px] text-[#737373]">{t("bk7.noStaff")}</p>
        )}
      </div>

      {view.staffSel ? (
        <div className="flex flex-col gap-2">
          <Label>{t("bk7.day")}</Label>
          {view.days.length && !view.days.every((d) => d.closed) ? null : <p className="text-[13px] text-[#737373]">{t("bk7.noDays")}</p>}
          <div className="-mx-5 overflow-x-auto px-5">
            <div className="grid auto-cols-[calc((100%-32px)/5)] grid-flow-col gap-2">
              {view.days.map((d) => {
                const c = dayChip(d.dateStr, l);
                const on = d.dateStr === view.dateSel;
                const cls = `flex min-h-[64px] flex-col items-center justify-center rounded-xl border text-[12.5px] leading-tight ${
                  on ? "border-[#0a0a0a] bg-[#0a0a0a] text-white" : d.closed ? "border-[#e5e5e5] bg-[#f4f5f7] text-[#a3a3a3]" : "border-[#e5e5e5] text-[#737373]"
                }`;
                const body = (
                  <>
                    <span>{c.wd}</span>
                    <b className={`text-[16px] ${on ? "text-white" : d.closed ? "text-[#a3a3a3]" : "text-[#0a0a0a]"}`}>{c.day}</b>
                    <span>{d.closed ? t("bk7.closedDay") : c.mon}</span>
                  </>
                );
                return d.closed ? (
                  <span key={d.dateStr} data-bk-day={d.dateStr} data-closed="" className={cls}>
                    {body}
                  </span>
                ) : (
                  <a key={d.dateStr} href={at({ date: d.dateStr, time: null })} data-bk-day={d.dateStr} {...(on ? { "data-on": "" } : {})} className={cls}>
                    {body}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[#737373]">{t("bk7.pickStaffFirst")}</p>
      )}

      {view.dateSel && view.staffSel ? (
        <div className="flex flex-col gap-2">
          <Label>
            {t("bk7.time")} · {dayLabel(view.dateSel, l)}
            {staffName ? ` · ${staffName}` : ""}
          </Label>
          {view.times.length === 0 || view.times.every((x) => !x.free) ? <p className="text-[13px] text-[#737373]">{t("bk7.noTimes")}</p> : null}
          <div className="grid grid-cols-4 gap-2">
            {view.times.map((x) =>
              x.free ? (
                <a
                  key={x.startMin}
                  href={at({ time: x.hhmm })}
                  data-bk-time={x.hhmm}
                  data-free="1"
                  onClick={(e) => {
                    e.preventDefault();
                    onPick(x.startMin);
                  }}
                  className={`flex min-h-[44px] items-center justify-center rounded-xl border text-[15px] font-bold ${pick === x.startMin ? "border-[#0a0a0a] bg-[#0a0a0a] text-white" : "border-[#e5e5e5]"}`}
                >
                  {x.hhmm}
                </a>
              ) : (
                <span key={x.startMin} data-bk-time={x.hhmm} data-free="0" className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#f0f0f0] bg-[#f4f5f7] text-[15px] text-[#a3a3a3] line-through">
                  {x.hhmm}
                </span>
              ),
            )}
          </div>
          <div className="flex items-start gap-2 rounded-2xl border border-[#e5e5e5] px-4 py-3 text-[13.5px]">
            <span aria-hidden>◷</span>
            <div>
              {t("bk7.uses", { service: view.service!.name, dur: duration(view.service!.durationMin, l) })}
              {pick !== null && view.dateSel ? <> · {t("bk7.endsAt", { time: "" })}<b>{hhmm(bkkMs(view.dateSel, pick + view.service!.durationMin))}</b></> : null}
              <br />
              <small className="text-[12px] text-[#737373]">{t("bk7.strikeNote")}</small>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function StepThree({ view, t, basePath, query, idempotencyKey, staffName }: { view: OnlineBookingView; t: T; basePath: string; query: OnlineQuery; idempotencyKey: string; staffName: string | null }) {
  const l = view.locale;
  const s = view.summary!;
  const svc = view.service!;
  const pol = view.policy;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // O2: ลิงก์ตัวตนใช้ไม่ได้แล้ว (หมดอายุ/ Party ไม่มีเบอร์) ⇒ ร้านตอบ BAD_INPUT ⇒ เปิดช่องชื่อ/เบอร์ให้กรอกเอง
  const [askContact, setAskContact] = useState(false);
  const showContact = !view.identity || askContact;
  const before = pol ? duration(pol.freeChangeBeforeMin, l) : "";
  const dep = s.depositSatang > 0;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v : undefined;
    };
    setBusy(true);
    setErr(null);
    try {
      const api = `${basePath.replace(/^\/s\//, "/api/store/")}/book`;
      const res = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId: svc.id,
          staffId: view.staffSel && view.staffSel !== "any" ? view.staffSel : null,
          dateStr: view.dateSel,
          startMin: view.timeSel?.startMin,
          ...(showContact ? { name: get("name") ?? "", phone: get("phone") ?? "" } : {}),
          ...(get("note") ? { note: get("note") } : {}),
          idempotencyKey: get("idempotencyKey") ?? idempotencyKey,
          ...(query.who ? { who: query.who } : {}),
        }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; manageUrl?: string | null; code?: string } | null;
      if (j?.ok) {
        if (typeof j.manageUrl === "string" && j.manageUrl.startsWith("/bq/m/")) {
          window.location.assign(query.lang ? `${j.manageUrl}?lang=${encodeURIComponent(query.lang)}` : j.manageUrl);
          return;
        }
        setDone(true);
      } else {
        const code = typeof j?.code === "string" && /^[A-Z_]{1,40}$/.test(j.code) ? j.code : "DEFAULT";
        if (code === "BAD_INPUT" && view.identity && !askContact) setAskContact(true);
        const msg = t(`bk7.err.${code}`);
        setErr(msg === `bk7.err.${code}` ? t("bk7.err.DEFAULT") : msg);
      }
    } catch {
      setErr(t("bk7.err.DEFAULT"));
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#e5e5e5] p-6 text-center">
        <p className="text-[20px] font-bold">{t("bk7.done")}</p>
        <p className="text-[14px] text-[#737373]">
          {svc.name} · {dateLong(s.startMs, l)} {hhmm(s.startMs)}
        </p>
        <p className="text-[14px] text-[#737373]">{t("bk7.done.desc")}</p>
      </div>
    );
  }

  return (
    <>
      <div data-bk-summary="" data-start={String(s.startMs)} className="flex flex-col rounded-2xl border border-[#e5e5e5] px-4 py-2">
        <div className="flex gap-2.5 py-2 text-[14.5px]">
          <span className="flex-1">
            {svc.name}
            {staffName ? ` · ${staffName}` : ""}
          </span>
          <span className="font-bold">{money(s.priceSatang, l)}</span>
        </div>
        <div className="py-2 text-[14.5px] text-[#737373]">
          {dateLong(s.startMs, l)} · {hhmm(s.startMs)}–{hhmm(s.endMs)}
        </div>
        {dep ? (
          <>
            <div data-bk-deposit-now="" data-satang={String(s.depositSatang)} className="mt-1 flex gap-2.5 border-t-[1.5px] border-[#0a0a0a] py-2.5 text-[14.5px]">
              <span className="flex-1">{t("bk7.depositNow")}</span>
              <span className="font-bold">{money(s.depositSatang, l)}</span>
            </div>
            <div data-bk-pay-at-shop="" data-satang={String(s.payAtShopSatang)} className="flex gap-2.5 py-2 text-[14.5px] text-[#737373]">
              <span className="flex-1">{t("bk7.payAtShop")}</span>
              <span className="font-bold text-[#404040]">{money(s.payAtShopSatang, l)}</span>
            </div>
          </>
        ) : null}
      </div>

      <div data-bk-ends="" className="flex items-start gap-2 rounded-2xl border border-[#e5e5e5] px-4 py-3 text-[13.5px]">
        <span aria-hidden>◷</span>
        <div>
          {t("bk7.uses", { service: svc.name, dur: duration(Math.round((s.endMs - s.startMs) / 60_000), l) })} · {t("bk7.endsAt", { time: "" })}
          <b>{hhmm(s.endMs)}</b>
        </div>
      </div>

      {pol ? (
        <div data-bk-policy="" className="rounded-2xl bg-[#f4f5f7] px-4 py-3 text-[13px] leading-relaxed text-[#404040]">
          {pol.graceMin !== null ? (
            <p>
              <b className="text-[#0a0a0a]">{t("bk7.policy.grace", { n: pol.graceMin })}</b>{" "}
              {pol.afterGrace === "RELEASE_REQUEUE" ? t("bk7.policy.release") : t("bk7.policy.wait")}
            </p>
          ) : null}
          <p>
            <b className="text-[#0a0a0a]">{t("bk7.policy.free")}</b> {t("bk7.policy.until", { when: `${dateLong(s.freeUntilMs, l)} ${hhmm(s.freeUntilMs)}`, before })} ·{" "}
            {dep ? t("bk7.policy.afterDeposit") : t("bk7.policy.after")}
          </p>
          {pol.selfRescheduleMax > 0 ? <p>{t("bk7.policy.resched", { n: pol.selfRescheduleMax })}</p> : null}
          {pol.requireConfirm ? <p>{t("bk7.policy.confirm")}</p> : null}
        </div>
      ) : null}

      {dep ? (
        <div data-bk-deposit-slot="" className="flex items-center gap-3.5 rounded-2xl border border-[#e5e5e5] p-3">
          <span className="grid h-[72px] w-[72px] flex-none place-items-center rounded-xl border border-dashed border-[#d4d4d4] text-[22px] text-[#a3a3a3]" aria-hidden>
            ▦
          </span>
          <div>
            <b className="block text-[15px]">{t("bk7.dep.title", { amt: money(s.depositSatang, l) })}</b>
            <small className="block text-[12.5px] leading-snug text-[#737373]">
              {pol?.payWithinMin ? t("bk7.dep.within", { min: pol.payWithinMin }) : t("bk7.dep.later")}
            </small>
          </div>
        </div>
      ) : null}

      <form data-bk-confirm-form="" onSubmit={submit} className="flex flex-col gap-3">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {!showContact ? (
          <p className="text-[13px] text-[#525252]">{t("bk7.lineNote")}</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              {t("bk7.name")}
              <input name="name" required maxLength={80} autoComplete="name" className="min-h-[48px] rounded-xl border border-[#d4d4d4] px-3 text-[16px] font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              {t("bk7.phone")}
              <input name="phone" type="tel" required maxLength={20} autoComplete="tel" inputMode="tel" className="min-h-[48px] rounded-xl border border-[#d4d4d4] px-3 text-[16px] font-normal" />
            </label>
          </>
        )}
        {view.extraField ? (
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {view.extraField.label}
            <textarea name="note" maxLength={300} rows={2} className="rounded-xl border border-[#d4d4d4] px-3 py-2 text-[16px] font-normal" />
          </label>
        ) : null}
        {err ? (
          <p role="alert" className="text-[13px] text-[#dc2626]">
            {err}
          </p>
        ) : null}
        <div className="sticky bottom-0 -mx-5 mt-2 border-t border-[#f0f0f0] bg-white px-5 py-4">
          <button type="submit" data-bk-submit="" disabled={busy} className="flex min-h-[56px] w-full items-center justify-center rounded-2xl px-4 text-[16px] font-bold text-white disabled:opacity-60" style={{ background: INK }}>
            {busy ? t("bk7.submitting") : t("bk7.confirm")}
          </button>
        </div>
      </form>
    </>
  );
}
