"use client";

// SVC B.6 — ตู้รับบัตรคิว/เช็กอิน (แท็บเล็ตหน้าร้าน แนวนอน · ภาพ จอง 04) · สัญญา DOM: ใบสั่ง §4
//   home → เช็กอิน (เบอร์/QR) | รับบัตร walk-in (บริการ · ช่าง · เบอร์) → บัตร (เลข · QR LINE/หน้าบัตร · พิมพ์) / เช็กอินแล้ว
// 🔴 ไม่มีชื่อ/เบอร์ลูกค้าบนจอ (X8 — ไม่ทักชื่อตอนเช็กอิน ต่างจากภาพ 04ข โดยตั้งใจ) · ค่าตั้งรายเครื่องมาใน view (ไม่ฮาร์ดโค้ดคีย์)
// 🔴 รีเฟรชอัตโนมัติเฉพาะหน้าแรก (prop refresher) — ห้ามรีเฟรชทับระหว่างกรอก · at (นาฬิกา QC) ⇒ hidden ทุกฟอร์ม
// 🔴 K1 (รีวิว B.6): หน้าบัตร/เช็กอินแล้วกลับหน้าแรกเองเมื่อครบเวลา (ค่าเริ่ม 45 วิ · ไม่ต่อเวลาด้วยการแตะ) — คนถัดไปจะไม่เห็น QR หน้าบัตรของคนก่อน ·
//    หน้ากรอก (เช็กอิน/walk-in) กลับเมื่อนิ่งครบเวลา · กลับหน้าแรก = remount ทั้งชุด (ล้างผล useActionState)
import { useActionState, useCallback, useEffect, useState, type ReactNode } from "react";
import { QrCode } from "@/components/qr-code";
import type { KioskCheckedIn, KioskTicket, KioskView } from "@/lib/modules/booking/public-line";
import { baht, dayLabel, hhmm, waitLabel } from "./fmt";

type Act = (prev: unknown, fd: FormData) => Promise<unknown>;
type Screen =
  | { screen: "home" | "checkin" | "walkin" }
  | { screen: "ticket"; ticket: KioskTicket }
  | { screen: "checkedIn"; ticket: KioskCheckedIn };
type Props = { view: KioskView; actions: { checkIn: Act; walkIn: Act }; at?: string; initial?: Screen; refresher?: ReactNode; idleResetMs?: number };
const IDLE_RESET_MS = 45_000;
type Res = { ok: true; ticket: KioskTicket | KioskCheckedIn } | { ok: false; reason: string };

const asRes = (x: unknown): Res | null => {
  if (!x || typeof x !== "object") return null;
  const o = x as { ok?: unknown; ticket?: unknown; reason?: unknown };
  if (o.ok === true && o.ticket && typeof o.ticket === "object") return { ok: true, ticket: o.ticket as KioskTicket };
  if (o.ok === false) return { ok: false, reason: typeof o.reason === "string" ? o.reason : "ทำรายการไม่สำเร็จ" };
  return null;
};
const BTN_DARK = "inline-flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-[#0a0a0a] px-6 text-[18px] font-bold text-white disabled:opacity-50";
const BTN_GHOST = "inline-flex min-h-[56px] items-center justify-center rounded-2xl border border-[#d4d4d4] bg-white px-6 text-[18px] font-bold text-[#0a0a0a]";

function Shell({ view, title, right, children }: { view: KioskView; title: string; right?: ReactNode; children: ReactNode }) {
  const mark = view.unitName.replace(/\s+/g, "").slice(0, 2) || "Q";
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col overflow-hidden rounded-[28px] border border-[#e5e5e5] bg-white text-[#0a0a0a]">
      <div className="flex items-center gap-4 border-b border-[#e5e5e5] px-6 py-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0a0a0a] text-[15px] font-bold text-white">{mark}</span>
        <p className="min-w-0 flex-1 truncate text-[19px] font-bold">{title}</p>
        <span className="shrink-0 text-[14px] text-[#737373]">{right ?? `${dayLabel(view.dayStr)} · ${hhmm(view.nowMs)}`}</span>
      </div>
      <div className="flex flex-col gap-6 p-6">{children}</div>
    </div>
  );
}

const AtField = ({ at }: { at?: string }) => (at ? <input type="hidden" name="at" value={at} /> : null);

export default function Kiosk(props: Props) {
  const [epoch, setEpoch] = useState(0);
  const reset = useCallback(() => setEpoch((e) => e + 1), []);
  return <KioskScreens key={epoch} {...props} initial={epoch === 0 ? props.initial : undefined} onReset={reset} />;
}

function KioskScreens({ view, actions, at, initial, refresher, idleResetMs, onReset }: Props & { onReset: () => void }) {
  const [s, setS] = useState<Screen>(initial ?? { screen: "home" });
  const idleMs = typeof idleResetMs === "number" && idleResetMs > 0 ? idleResetMs : IDLE_RESET_MS;
  const screen = s.screen;
  useEffect(() => {
    if (screen === "home") return;
    let t = setTimeout(onReset, idleMs);
    const shown = screen === "ticket" || screen === "checkedIn"; // หน้าที่มีข้อมูลบัตร: เวลาคงที่ ไม่ต่อด้วยการแตะ
    const bump = () => {
      clearTimeout(t);
      t = setTimeout(onReset, idleMs);
    };
    if (!shown) for (const ev of ["pointerdown", "keydown", "input"]) window.addEventListener(ev, bump);
    return () => {
      clearTimeout(t);
      if (!shown) for (const ev of ["pointerdown", "keydown", "input"]) window.removeEventListener(ev, bump);
    };
  }, [screen, idleMs, onReset]);
  const [ciState, ciAction, ciPending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await actions.checkIn(prev, fd);
    const x = asRes(r);
    if (x?.ok) setS({ screen: "checkedIn", ticket: x.ticket as KioskCheckedIn });
    return r;
  }, null);
  const [wiState, wiAction, wiPending] = useActionState(async (prev: unknown, fd: FormData) => {
    const r = await actions.walkIn(prev, fd);
    const x = asRes(r);
    if (x?.ok) setS({ screen: "ticket", ticket: x.ticket as KioskTicket });
    return r;
  }, null);
  const ciErr = asRes(ciState);
  const wiErr = asRes(wiState);
  const home = onReset;

  return (
    <div data-kiosk="" className="min-h-screen w-full bg-[#f4f5f7] p-4 sm:p-8">
      {s.screen === "home" ? (
        <Shell view={view} title={view.unitName}>
          {refresher}
          <div data-kiosk-home="" className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <button
                type="button"
                data-kiosk-go="checkin"
                onClick={() => setS({ screen: "checkin" })}
                className="flex min-h-[300px] flex-col justify-end gap-3 rounded-[24px] bg-[#0a0a0a] p-7 text-left text-white"
              >
                <span className="mb-auto grid h-14 w-14 place-items-center rounded-xl bg-white text-[22px] text-[#0a0a0a]" aria-hidden>
                  ▦
                </span>
                <span className="text-[30px] font-bold leading-tight">
                  มีนัดแล้ว
                  <br />
                  เช็กอินที่นี่
                </span>
                <span className="text-[16px] text-white/80">สแกน QR ในข้อความ LINE หรือพิมพ์เบอร์โทร</span>
              </button>
              <button
                type="button"
                data-kiosk-go="walkin"
                onClick={() => setS({ screen: "walkin" })}
                className="flex min-h-[300px] flex-col justify-end gap-3 rounded-[24px] border-2 border-[#0a0a0a] bg-white p-7 text-left"
              >
                <span className="mb-auto grid h-14 w-14 place-items-center rounded-xl bg-[#f4f5f7] text-[26px]" aria-hidden>
                  +
                </span>
                <span className="text-[30px] font-bold leading-tight">
                  ไม่ได้จอง
                  <br />
                  รับบัตรคิว
                </span>
                <span className="text-[16px] text-[#737373]">
                  {view.walkInWaitMin === null ? "ตอนนี้ปิดรับ walk-in — จองเวลาล่วงหน้าได้" : `ตอนนี้รอประมาณ ${waitLabel(view.walkInWaitMin).replace("~", "")}`}
                </span>
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[15px] text-[#525252]">
              <span>
                {view.busyCount >= view.seatCount && view.seatCount > 0 ? `ช่างกำลังทำครบ ${view.seatCount} เก้าอี้` : `ช่างกำลังทำ ${view.busyCount}/${view.seatCount} เก้าอี้`}
              </span>
              <span>
                รอในร้าน {view.waitingCount} คน{view.nextTicketNumber ? <> · ถัดไป <b className="text-[#0a0a0a]">{view.nextTicketNumber}</b></> : null}
              </span>
            </div>
            {view.bookUrl ? <BookAheadQr href={view.bookUrl} /> : null}
            {!view.pinLock ? (
              <a data-kiosk-exit="" href="/app" className="self-start text-[14px] text-[#737373] underline">
                ออกจากโหมดตู้
              </a>
            ) : null}
          </div>
        </Shell>
      ) : null}

      {s.screen === "checkin" ? (
        <Shell view={view} title="เช็กอิน · มีนัดแล้ว">
          <form data-kiosk-checkin-form="" action={ciAction} className="flex flex-col gap-5">
            <AtField at={at} />
            <label className="flex flex-col gap-2">
              <span className="text-[16px] font-semibold">สแกน QR จากใบนัด / ข้อความ LINE</span>
              <input name="qr" autoComplete="off" autoFocus className="min-h-[56px] rounded-2xl border border-[#d4d4d4] px-4 text-[18px]" placeholder="แตะที่นี่แล้วสแกน" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[16px] font-semibold">หรือพิมพ์เบอร์โทรที่ใช้จอง</span>
              <input name="phone" type="tel" inputMode="numeric" autoComplete="off" className="min-h-[56px] rounded-2xl border border-[#d4d4d4] px-4 text-[22px] tracking-wider" placeholder="08x-xxx-xxxx" />
            </label>
            {ciErr && !ciErr.ok ? <p role="alert" className="rounded-xl border border-[color:var(--color-danger,#dc2626)] px-4 py-3 text-[15px] text-[color:var(--color-danger,#dc2626)]">{ciErr.reason}</p> : null}
            <div className="grid grid-cols-[1fr_2fr] gap-4">
              <button type="button" onClick={home} className={BTN_GHOST}>กลับ</button>
              <button type="submit" disabled={ciPending} className={BTN_DARK}>{ciPending ? "กำลังเช็กอิน…" : "เช็กอิน"}</button>
            </div>
          </form>
        </Shell>
      ) : null}

      {s.screen === "walkin" ? (
        <Shell view={view} title="รับบัตรคิว · เลือกบริการ" right={view.walkInWaitMin === null ? "ปิดรับ walk-in" : `รอ ${waitLabel(view.walkInWaitMin)}`}>
          <form data-kiosk-walkin-form="" action={wiAction} className="flex flex-col gap-5">
            <AtField at={at} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {view.services.map((sv, i) =>
                sv.walkIn ? (
                  <label key={sv.id} className="flex min-h-[80px] cursor-pointer flex-col justify-center rounded-2xl border border-[#e5e5e5] px-5 py-4 has-[:checked]:border-2 has-[:checked]:border-[#0a0a0a]">
                    <input type="radio" name="serviceId" value={sv.id} defaultChecked={i === view.services.findIndex((x) => x.walkIn)} required className="sr-only" />
                    <span className="text-[18px] font-bold">{sv.name}</span>
                    <span className="text-[14px] text-[#737373]">{sv.durationMin} นาที · {baht(sv.priceSatang)}</span>
                  </label>
                ) : (
                  <div key={sv.id} data-kiosk-bookonly={sv.id} className="flex min-h-[80px] flex-col justify-center rounded-2xl border border-[#e5e5e5] px-5 py-4 opacity-70">
                    <span className="text-[18px] font-bold">{sv.name}</span>
                    <span className="text-[14px] text-[#737373]">{sv.durationMin} นาที · จองล่วงหน้า</span>
                  </div>
                ),
              )}
            </div>
            {view.bookUrl && view.services.some((x) => !x.walkIn) ? <BookAheadQr href={view.bookUrl} /> : null}
            {view.staff ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[15px] font-semibold">ช่าง</legend>
                <div className="flex flex-wrap gap-2">
                  {[{ id: "", name: "ใครก็ได้ · เร็วสุด" }, ...view.staff].map((st) => (
                    <label key={st.id || "any"} className="inline-flex min-h-[48px] cursor-pointer items-center rounded-full border border-[#d4d4d4] px-5 text-[15px] has-[:checked]:border-[#0a0a0a] has-[:checked]:bg-[#0a0a0a] has-[:checked]:text-white">
                      <input type="radio" name="staffId" value={st.id} defaultChecked={st.id === ""} className="sr-only" />
                      {st.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">เบอร์โทร{view.phone === "REQUIRED" ? "" : " (ไม่บังคับ)"}</span>
              <input name="phone" type="tel" inputMode="numeric" autoComplete="off" required={view.phone === "REQUIRED"} className="min-h-[56px] rounded-2xl border border-[#d4d4d4] px-4 text-[20px]" placeholder="08x-xxx-xxxx" />
            </label>
            {wiErr && !wiErr.ok ? <p role="alert" className="rounded-xl border border-[color:var(--color-danger,#dc2626)] px-4 py-3 text-[15px] text-[color:var(--color-danger,#dc2626)]">{wiErr.reason}</p> : null}
            <div className="grid grid-cols-[1fr_2fr] gap-4">
              <button type="button" onClick={home} className={BTN_GHOST}>กลับ</button>
              <button type="submit" disabled={wiPending || !view.services.some((x) => x.walkIn)} className={BTN_DARK}>{wiPending ? "กำลังออกบัตร…" : "รับบัตรคิว"}</button>
            </div>
          </form>
        </Shell>
      ) : null}

      {s.screen === "ticket" ? <TicketScreen view={view} t={s.ticket} onDone={home} /> : null}

      {s.screen === "checkedIn" ? (
        <Shell view={view} title="เช็กอินแล้ว">
          <div data-kiosk-checkedin={s.ticket.ticketNumber} className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <span className="text-[96px] font-black leading-none tracking-tight">{s.ticket.ticketNumber}</span>
              <span className="flex flex-col gap-1">
                <span className="text-[26px] font-bold">เช็กอินเรียบร้อย</span>
                <span className="text-[16px] text-[#737373]">
                  {[`นัด ${hhmm(s.ticket.bookedStartMs)}`, s.ticket.serviceName, s.ticket.staffName, s.ticket.seat !== null ? `เก้าอี้ ${s.ticket.seat}` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </div>
            <p className="rounded-2xl border border-[#e5e5e5] px-5 py-4 text-[16px]">
              {s.ticket.plannedStartMs !== null ? <>นั่งรอได้เลย จะเรียกราว <b>{hhmm(s.ticket.plannedStartMs)}</b></> : "นั่งรอได้เลย พนักงานจะเรียกตามคิว"}
              {s.ticket.aheadCount > 0 ? ` · ข้างหน้า ${s.ticket.aheadCount} คิว` : ""}
            </p>
            <button type="button" onClick={home} className={BTN_DARK}>เสร็จ</button>
          </div>
        </Shell>
      ) : null}
    </div>
  );
}

function TicketScreen({ view, t, onDone }: { view: KioskView; t: KioskTicket; onDone: () => void }) {
  const href = t.lineLink || t.ticketUrl || null; // ticketUrl "" = ไม่มีหน้าบัตร (ไม่มี SESSION_SECRET) ⇒ ไม่แสดง QR
  const [abs, setAbs] = useState<string | null>(href && /^https?:\/\//.test(href) ? href : null);
  useEffect(() => {
    setAbs(!href ? null : /^https?:\/\//.test(href) ? href : `${window.location.origin}${href}`);
  }, [href]);
  return (
    <Shell view={view} title="บัตรคิวของคุณ" right={t.serviceName}>
      <div data-kiosk-ticket={t.ticketNumber} className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="text-[96px] font-black leading-none tracking-tight">{t.ticketNumber}</span>
            <span className="flex flex-col gap-1">
              <span className="text-[26px] font-bold">{[t.plannedStartMs !== null ? `~${hhmm(t.plannedStartMs)}` : null, t.staffName].filter(Boolean).join(" · ") || "รอเรียกตามคิว"}</span>
              <span className="text-[16px] text-[#737373]">
                ข้างหน้า {t.aheadCount} คิว{t.waitMin !== null ? ` · รอราว ${t.waitMin} นาที` : ""}{t.seat !== null ? ` · เก้าอี้ ${t.seat}` : ""}
              </span>
            </span>
          </div>
          <div className="mt-auto flex gap-4">
            {view.paperTicket ? (
              <button type="button" data-kiosk-print="" onClick={() => window.print()} className={`${BTN_GHOST} flex-1`}>
                พิมพ์บัตร
              </button>
            ) : null}
            <button type="button" onClick={onDone} className={`${BTN_DARK} flex-1`}>เสร็จ</button>
          </div>
        </div>
        {href ? (
          <div data-kiosk-qr="" data-href={href} className="flex flex-col items-center gap-2 rounded-2xl border border-[#e5e5e5] p-4 text-center">
            <QrCode value={abs} size={200} />
            <p className="text-[15px] font-bold">สแกนเพื่อติดตามคิว</p>
            <p className="text-[13px] text-[#737373]">{t.lineLink ? "ออกไปทำธุระได้ · LINE ทักก่อนถึงคิว" : "ดูคิวสดบนมือถือ · ออกไปทำธุระได้"}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#e5e5e5] p-4 text-center text-[14px] text-[#737373]">จำเลขบัตรไว้ · ฟังเสียงเรียกหน้าร้าน</div>
        )}
      </div>
    </Shell>
  );
}

/** SVC B.7 ▸ หนี้ B.6 §9: QR "จองวันอื่นล่วงหน้า" — ลูกค้าสแกนไปจองบนมือถือ (ตู้ไม่ออกจากโหมดตู้) ◂ */
function BookAheadQr({ href }: { href: string }) {
  const [abs, setAbs] = useState<string | null>(/^https?:\/\//.test(href) ? href : null);
  useEffect(() => {
    setAbs(/^https?:\/\//.test(href) ? href : `${window.location.origin}${href}`);
  }, [href]);
  return (
    <div data-kiosk-book-qr="" data-href={href} className="flex items-center gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-4">
      <QrCode value={abs} size={112} />
      <div className="flex flex-col gap-1">
        <p className="text-[18px] font-bold">จองวันอื่นล่วงหน้า</p>
        <p className="text-[14px] text-[#737373]">สแกนด้วยมือถือ เลือกบริการ ช่าง และเวลาได้เอง</p>
      </div>
    </div>
  );
}
