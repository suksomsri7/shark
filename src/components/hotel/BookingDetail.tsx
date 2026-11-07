"use client";
// SVC H.3 ▸ รายละเอียดการจอง (ใบสั่ง h.3 §4) — แท็บ แขก · ห้องและคืน · เงิน · ประวัติ · ปุ่มตามสถานะและสิทธิ์
//   • ปุ่มเขียนทุกปุ่มอยู่ใต้เงื่อนไขสิทธิ์จากเซิร์ฟเวอร์ (canManage · canCancel · isManager) — อ่านอย่างเดียวไม่เห็นปุ่ม
//   • ต่อคืนแสดงราคาใหม่ก่อนยืนยัน · ยกเลิกแสดงยอดคืนตามขั้นบันได (snapshot) ก่อนยืนยัน · กลุ่ม = รายการห้องในกลุ่ม + ยกเลิกทั้งกลุ่ม
//   • มือถือ 390: ตารางคืนอยู่ในกรอบเลื่อนแนวนอน + data-scroll-hint
import { useState } from "react";
import { useRouter } from "next/navigation";
import BookingDepositDialog from "./BookingDepositDialog";
import {
  DETAIL_TABS,
  DONE_TH,
  HISTORY_TH,
  NO_SHOW_TH,
  PRICE_SOURCE_TH,
  SOURCE_TH,
  STATUS_TH,
  addDaysStr,
  cancelRulesTh,
  countdownTh,
  dateTh,
  dateTimeTh,
  moneyTh,
  statusToneClass,
  stayTh,
  type AssignableRoom,
  type Runner,
  type BookingDetail as Detail,
  type DetailActions,
  type DetailPerms,
  type DetailTab,
} from "./booking-shared";

type Props = { booking: Detail; unitSlug: string; perms: DetailPerms; rooms: AssignableRoom[]; actions: DetailActions; nowMs: number };
type Pending = "" | "confirm" | "cancel" | "cancelGroup" | "extend" | "shorten" | "assign" | "noShow" | "undo" | "deposit";
type Notice = { tone: "ok" | "err"; text: string } | null;
type Quote = { nights: { date: string; priceSatang: number; source: string }[]; addedSatang: number } | null;

const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const BTN_DANGER = "inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const INPUT = "min-h-11 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";
const CARD = "flex min-w-0 flex-col gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";

export default function BookingDetail({ booking: b, unitSlug, perms, rooms, actions, nowMs }: Props) {
  const { canManage, canCancel, isManager } = perms;
  const router = useRouter();
  const [tab, setTab] = useState("guest" as DetailTab);
  const [pending, setPending] = useState("" as Pending);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null as Notice);
  const [newCheckOut, setNewCheckOut] = useState(addDaysStr(b.checkOut, 1));
  const [shortTo, setShortTo] = useState(addDaysStr(b.checkOut, -1));
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [quote, setQuote] = useState(null as Quote);
  const base = `/app/u/${unitSlug}/hotel/reservations`;
  const active = b.status === "HOLD" || b.status === "CONFIRMED";
  const unpaid = !b.depositPaidAt && b.depositSatang > 0;
  const groupActive = b.group.filter((g) => g.status === "HOLD" || g.status === "CONFIRMED").length;
  const run = async (key: string, fn: Runner) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) {
        setPending("");
        setQuote(null);
        const warn = typeof r.moneyWarning === "string" ? r.moneyWarning : "";
        setNotice({ tone: warn ? "err" : "ok", text: warn || DONE_TH[key] || "" });
        router.refresh();
      } else {
        setNotice({ tone: "err", text: r.reason || "ทำรายการไม่สำเร็จ" });
      }
    } catch {
      setNotice({ tone: "err", text: "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  };
  const loadQuote = async () => {
    setQuote(null);
    const r = await actions.quoteExtend({ id: b.id, newCheckOut });
    if (r.ok && Array.isArray(r.nights)) {
      setQuote({ nights: r.nights as { date: string; priceSatang: number; source: string }[], addedSatang: Number(r.addedSatang) || 0 });
    } else {
      setNotice({ tone: "err", text: r.reason || "คิดราคาไม่สำเร็จ" });
    }
  };
  const dropNights = b.nights.filter((n) => {
    return n.counted && n.date >= shortTo;
  });

  return (
    <div data-booking-detail={b.status} className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <a href={base} className="text-sm text-[color:var(--color-muted)]">
            ← การจองทั้งหมด
          </a>
          <h1 className="text-xl font-bold text-[color:var(--color-ink)]">
            {b.code} · {b.guestName}
          </h1>
          <p className="text-sm text-[color:var(--color-muted)]">
            {b.roomTypeName}
            {b.roomNumber ? ` · ห้อง ${b.roomNumber}` : " · ยังไม่ระบุห้อง"} · {stayTh(b.checkIn, b.checkOut)} · {SOURCE_TH[b.source] ?? b.source}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`inline-block rounded-full border px-3 py-1 text-sm ${statusToneClass(b.status)}`}>{STATUS_TH[b.status] ?? b.status}</span>
          {b.status === "HOLD" ? (
            <span data-hold-countdown="" className="text-xs text-amber-700">
              {countdownTh(b.holdExpiresAt, nowMs)}
            </span>
          ) : null}
        </div>
      </header>

      {notice ? (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {notice.text}
        </p>
      ) : null}

      <div data-booking-actions="" className="flex flex-wrap gap-2">
        {canManage && b.status === "HOLD" ? (
          <button type="button" className={BTN} onClick={() => setPending("confirm")}>
            ยืนยันการจอง
          </button>
        ) : null}
        {canManage && unpaid && (active || b.status === "CHECKED_IN") ? (
          <button type="button" className={BTN_PRIMARY} onClick={() => setPending("deposit")}>
            รับมัดจำ
          </button>
        ) : null}
        {canManage && active ? (
          <button type="button" className={BTN} onClick={() => setPending("assign")}>
            กำหนดห้อง
          </button>
        ) : null}
        {canManage && (active || b.status === "CHECKED_IN") ? (
          <button type="button" className={BTN} onClick={() => setPending("extend")}>
            ต่อคืน
          </button>
        ) : null}
        {canManage && (active || b.status === "CHECKED_IN") && b.nights.filter((n) => n.counted).length > 1 ? (
          <button type="button" className={BTN} onClick={() => setPending("shorten")}>
            ย่นคืน
          </button>
        ) : null}
        {canManage && b.status === "CONFIRMED" && b.checkIn <= b.today ? (
          <button type="button" className={BTN_DANGER} onClick={() => setPending("noShow")}>
            ไม่มา
          </button>
        ) : null}
        {canManage && isManager && b.status === "NO_SHOW" ? (
          <button type="button" className={BTN} onClick={() => setPending("undo")}>
            ย้อนสถานะไม่มา
          </button>
        ) : null}
        {canCancel && active ? (
          <button type="button" className={BTN_DANGER} onClick={() => setPending("cancel")}>
            ยกเลิก
          </button>
        ) : null}
      </div>

      {b.groupId && b.group.length > 1 ? (
        <section className={CARD} data-booking-group={b.groupId}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">กลุ่ม {b.group.length} ห้อง</h2>
            {canCancel && groupActive > 0 ? (
              <button type="button" className={BTN_DANGER} onClick={() => setPending("cancelGroup")}>
                ยกเลิกทั้งกลุ่ม
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {b.group.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2">
                <a href={`${base}/${g.id}`} className={g.id === b.id ? "font-bold" : "text-[color:var(--color-accent)]"}>
                  {g.code} · {g.roomTypeName}
                  {g.roomNumber ? ` · ห้อง ${g.roomNumber}` : ""}
                  {g.isHead ? " · ถือมัดจำของกลุ่ม" : ""}
                </a>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${statusToneClass(g.status)}`}>{STATUS_TH[g.status] ?? g.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label="หมวดรายละเอียด" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            data-detail-tab={t.key}
            aria-current={t.key === tab ? "page" : undefined}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm ${t.key === tab ? "bg-[color:var(--color-surface-2)] font-bold" : "text-[color:var(--color-ink-soft)]"}`}
          >
            {t.labelTh}
          </button>
        ))}
      </nav>

      {tab === "guest" ? (
        <section className={CARD}>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-[color:var(--color-muted)]">ชื่อผู้เข้าพัก</dt>
            <dd>{b.guestName}</dd>
            <dt className="text-[color:var(--color-muted)]">เบอร์โทร</dt>
            <dd>{b.guestPhone || "—"}</dd>
            <dt className="text-[color:var(--color-muted)]">อีเมล</dt>
            <dd>{b.guestEmail || "—"}</dd>
            <dt className="text-[color:var(--color-muted)]">ผู้เข้าพัก</dt>
            <dd>
              ผู้ใหญ่ {b.adults} · เด็ก {b.children}
            </dd>
            <dt className="text-[color:var(--color-muted)]">เลขอ้างอิงช่องทาง</dt>
            <dd>{b.channelRef || "—"}</dd>
            <dt className="text-[color:var(--color-muted)]">หมายเหตุ</dt>
            <dd>{b.note || "—"}</dd>
          </dl>
        </section>
      ) : null}

      {tab === "rooms" ? (
        <section className={CARD}>
          <div className="overflow-x-auto" data-scroll-hint="เลื่อนซ้ายขวาเพื่อดูทั้งตาราง">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-[color:var(--color-muted)]">
                <tr>
                  <th className="px-2 py-1">คืนวันที่</th>
                  <th className="px-2 py-1">ห้อง</th>
                  <th className="px-2 py-1">ที่มาของราคา</th>
                  <th className="px-2 py-1 text-right">ราคา</th>
                  <th className="px-2 py-1">สถานะคืน</th>
                </tr>
              </thead>
              <tbody>
                {b.nights.map((n) => (
                  <tr key={n.date} data-night={n.counted ? "counted" : "released"} className="border-t border-[color:var(--color-line)]">
                    <td className="px-2 py-1">{dateTh(n.date, true)}</td>
                    <td className="px-2 py-1">{n.roomNumber ?? "—"}</td>
                    <td className="px-2 py-1">{PRICE_SOURCE_TH[n.priceSource] ?? n.priceSource}</td>
                    <td className="px-2 py-1 text-right">฿{moneyTh(n.priceSatang)}</td>
                    <td className="px-2 py-1">{n.counted ? (n.posted ? "นับแล้ว · ปิดวันแล้ว" : "นับ") : "ปล่อยแล้ว"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[color:var(--color-muted)]">
            ห้องที่ถือ: {b.occupancy.length ? b.occupancy.map((o) => `ห้อง ${o.roomNumber} (${dateTh(o.from)} – ${dateTh(o.to)})`).join(" · ") : "ยังไม่มี — กำหนดห้องได้ภายหลังหรือตอนเช็กอิน"}
          </p>
        </section>
      ) : null}

      {tab === "money" ? (
        <section className={CARD}>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
            <dt className="text-[color:var(--color-muted)]">ยอดค่าห้อง</dt>
            <dd>฿{moneyTh(b.totalSatang)}</dd>
            <dt className="text-[color:var(--color-muted)]">มัดจำ</dt>
            <dd>
              {b.depositSatang > 0 ? `฿${moneyTh(b.depositSatang)} · ${b.depositPaidAt ? `รับแล้ว ${dateTimeTh(b.depositPaidAt)}` : "ยังไม่รับ"}` : "ไม่มีมัดจำที่แถวนี้"}
            </dd>
            <dt className="text-[color:var(--color-muted)]">แผนราคา</dt>
            <dd>{b.ratePlanName ?? "—"}</dd>
            <dt className="text-[color:var(--color-muted)]">นโยบายยกเลิก</dt>
            <dd>{cancelRulesTh(b.cancelRules)}</dd>
            <dt className="text-[color:var(--color-muted)]">นโยบายเมื่อแขกไม่มา</dt>
            <dd>{NO_SHOW_TH[b.noShowPolicy] ?? b.noShowPolicy}</dd>
            <dt className="text-[color:var(--color-muted)]">ใบแจ้งค่าห้อง</dt>
            <dd>{b.folio ? `${b.folio.status === "OPEN" ? "เปิดอยู่" : b.folio.status === "VOID" ? "ยกเลิกแล้ว" : "ปิดแล้ว"} · คงค้าง ฿${moneyTh(b.folio.balanceSatang)}` : "ยังไม่เปิด (เปิดเมื่อยืนยันการจอง)"}</dd>
          </dl>
          {b.refund ? (
            <p className="text-sm">
              ถ้ายกเลิกวันนี้: คืน ฿{moneyTh(b.refund.refundSatang)} · เก็บ ฿{moneyTh(b.refund.forfeitSatang)} (ก่อนเข้าพัก {b.refund.daysBefore} วัน)
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "history" ? (
        <section className={CARD}>
          <ol className="flex flex-col gap-1 text-sm">
            {b.history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex flex-wrap gap-2">
                <span className="text-[color:var(--color-muted)]">{dateTimeTh(h.at)}</span>
                <span>{HISTORY_TH[h.action] ?? h.action}</span>
                <span className="text-xs text-[color:var(--color-muted)]">{h.actorType === "SYSTEM" ? "โดยระบบ" : "โดยพนักงาน"}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {pending && pending !== "deposit" ? (
        <div role="dialog" aria-modal="true" aria-label="ยืนยันรายการ" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-[color:var(--color-surface)] p-5 shadow-xl">
            {pending === "confirm" ? (
              <>
                <h2 className="text-lg font-bold">ยืนยันการจองโดยไม่รอมัดจำ?</h2>
                <p className="text-sm text-[color:var(--color-muted)]">ห้องจะถูกถือไว้ถาวรจนกว่าจะยกเลิก</p>
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => run("confirm", () => actions.confirm({ id: b.id }))}>
                  ยืนยัน
                </button>
              </>
            ) : null}
            {pending === "cancel" || pending === "cancelGroup" ? (
              <>
                <h2 className="text-lg font-bold">{pending === "cancelGroup" ? "ยกเลิกทุกห้องในกลุ่มนี้?" : "ยกเลิกการจองนี้?"}</h2>
                {b.refund ? (
                  <p className="text-sm">
                    มัดจำที่รับไว้ ฿{moneyTh(b.refund.paidSatang)} · คืนตามขั้นบันได ฿{moneyTh(b.refund.refundSatang)} · เก็บเป็นค่าธรรมเนียม ฿{moneyTh(b.refund.forfeitSatang)}
                  </p>
                ) : (
                  <p className="text-sm text-[color:var(--color-muted)]">ไม่มีการคืนเงิน (ยังไม่ได้รับมัดจำ หรือมัดจำอยู่กับห้องอื่นในกลุ่ม)</p>
                )}
                <label className="flex flex-col gap-1 text-sm">
                  <span>เหตุผล</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={INPUT} />
                </label>
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={busy || !reason.trim()}
                  onClick={() => run(pending, () => actions.cancel(pending === "cancelGroup" ? { groupId: b.groupId, reason } : { reservationId: b.id, reason }))}
                >
                  ยืนยัน
                </button>
              </>
            ) : null}
            {pending === "extend" ? (
              <>
                <h2 className="text-lg font-bold">ต่อคืนถึงวันที่</h2>
                <input type="date" value={newCheckOut} min={addDaysStr(b.checkOut, 1)} onChange={(e) => { setNewCheckOut(e.target.value); setQuote(null); }} className={INPUT} aria-label="วันออกใหม่" />
                <button type="button" className={BTN} disabled={busy} onClick={loadQuote}>
                  ดูราคาคืนที่เพิ่ม
                </button>
                {quote ? (
                  <div className="text-sm">
                    {quote.nights.map((n) => (
                      <div key={n.date}>
                        {dateTh(n.date)} · ฿{moneyTh(n.priceSatang)}
                      </div>
                    ))}
                    <div className="font-bold">รวมเพิ่ม ฿{moneyTh(quote.addedSatang)}</div>
                  </div>
                ) : null}
                <button type="button" className={BTN_PRIMARY} disabled={busy || !quote} onClick={() => run("extend", () => actions.extend({ id: b.id, newCheckOut }))}>
                  ยืนยัน
                </button>
              </>
            ) : null}
            {pending === "shorten" ? (
              <>
                <h2 className="text-lg font-bold">ออกเร็วขึ้นเป็นวันที่</h2>
                <input type="date" value={shortTo} min={addDaysStr(b.checkIn, 1)} max={addDaysStr(b.checkOut, -1)} onChange={(e) => setShortTo(e.target.value)} className={INPUT} aria-label="วันออกใหม่" />
                <p className="text-sm">
                  คืนที่ปล่อย {dropNights.length} คืน · ลดยอด ฿{moneyTh(dropNights.reduce((a, n) => a + n.priceSatang, 0))} · ไม่คืนเงินอัตโนมัติ
                </p>
                <button type="button" className={BTN_PRIMARY} disabled={busy || dropNights.length === 0} onClick={() => run("shorten", () => actions.shorten({ id: b.id, newCheckOut: shortTo }))}>
                  ยืนยัน
                </button>
              </>
            ) : null}
            {pending === "assign" ? (
              <>
                <h2 className="text-lg font-bold">เลือกห้อง</h2>
                {rooms.length ? (
                  <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={INPUT} aria-label="ห้อง">
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        ห้อง {r.number} · {r.roomTypeName}
                        {r.sameType ? "" : " (ต่างประเภท ไม่คิดส่วนต่าง)"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-[color:var(--color-muted)]">ไม่มีห้องที่ว่างตลอดช่วงนี้</p>
                )}
                <button type="button" className={BTN_PRIMARY} disabled={busy || !roomId} onClick={() => run("assign", () => actions.assign({ id: b.id, roomId }))}>
                  ยืนยัน
                </button>
              </>
            ) : null}
            {pending === "noShow" ? (
              <>
                <h2 className="text-lg font-bold">บันทึกว่าแขกไม่มา?</h2>
                <p className="text-sm">ตามนโยบายตอนจอง: {NO_SHOW_TH[b.noShowPolicy] ?? b.noShowPolicy}</p>
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => run("noShow", () => actions.noShow({ id: b.id }))}>
                  ยืนยัน
                </button>
              </>
            ) : null}
            {pending === "undo" ? (
              <>
                <h2 className="text-lg font-bold">ย้อนสถานะเป็นยืนยัน?</h2>
                <p className="text-sm text-[color:var(--color-muted)]">ทำได้ภายในวันเดียวกันและห้องต้องยังว่าง · เงินที่ริบไปแล้วไม่คืนอัตโนมัติ</p>
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => run("undo", () => actions.undo({ id: b.id }))}>
                  ยืนยัน
                </button>
              </>
            ) : null}
            <button type="button" className={BTN} disabled={busy} onClick={() => { setPending(""); setQuote(null); }}>
              ปิด
            </button>
          </div>
        </div>
      ) : null}

      {pending === "deposit" ? (
        <BookingDepositDialog
          amountSatang={b.depositSatang}
          code={b.code}
          onSubmit={(i) => actions.takeDeposit({ reservationId: b.id, payType: i.payType, reference: i.reference })}
          onDone={(r) => {
            if (r.ok) {
              setPending("");
              setNotice({ tone: "ok", text: DONE_TH.deposit });
              router.refresh();
            }
          }}
          onClose={() => setPending("")}
        />
      ) : null}
    </div>
  );
}
