"use client";
// SVC H.2 ▸ ปฏิทินห้อง (tape chart · ภาพ ledger/design-dorm/08-hotel-tape.png · ใบสั่ง h.2 §2 มติ 1/2/7/8/9 · §4)
//   กริด: คอลัมน์ห้อง (เลข + ป้ายแม่บ้าน) × วัน (วันนี้ไฮไลต์ · ศ./ส. แรเงา) · หัวกลุ่มประเภทพร้อมราคา · แถว «ยังไม่กำหนดห้อง» · แถวอัตราเข้าพักท้ายกริด
//   ลาก (pointer events เอง ไม่ใช้ไลบรารี): ตัวแถบ = ย้ายห้อง (แนวตั้ง) และ/หรือเลื่อนวัน (แนวนอน · พักอยู่เลื่อนวันเข้าไม่ได้) · ขอบขวา = ยืด/ย่นคืน
//     ปล่อยแล้วเปิดไดอะล็อกยืนยันเสมอ · ล้ม ⇒ แถบกลับที่เดิม + ข้อความ (ไม่มีการเปลี่ยนจนยืนยัน)
//   ผู้ดูอย่างเดียว (แม่บ้าน · ไม่มีสิทธิ์จัดการการจอง) ⇒ ไม่มีที่จับลาก/ยืด และไม่มีปุ่มปิดห้อง
//   มือถือ 390: รายการรายวัน (ห้อง → แถบของวัน) + แถบเล็กสัปดาห์ · ไม่ลาก (ปุ่ม «ย้ายห้อง/เลื่อน» เปิดไดอะล็อกแทน)
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { releaseBlockAction } from "@/lib/modules/hotel/actions";
import TapeBar, { type GrabEvent } from "./TapeBar";
import MoveConfirmDialog, { type MoveRequest, type RoomOption } from "./MoveConfirmDialog";
import BlockDialog from "./BlockDialog";
import {
  HK_TH,
  LEGEND_TH,
  TAPE_KINDS,
  TXT,
  VIEW_TH,
  BAR_CLASS,
  addDays,
  baht,
  canShiftDates,
  dayMonthTh,
  diffDays,
  dowTh,
  isDraggable,
  isWeekend,
  pct,
  rangeTh,
  shiftFrom,
  timeTh,
  firstOfMonth,
  holdExpired,
  type TapeBarDto,
  type TapeModel,
  type TapeView,
} from "./tape-shared";

type Props = {
  model: TapeModel;
  view: TapeView;
  /** สิทธิ์ hotel.booking.manage (ลาก/ยืด/ปิดห้อง) — จากเซสชันฝั่งเซิร์ฟเวอร์ */
  canEdit: boolean;
  canCreate: boolean;
  /** เวลาที่หน้าโหลด (เซิร์ฟเวอร์) — ป้าย HOLD หมดเวลา */
  nowMs: number;
  /** แถบ KPI (เซิร์ฟเวอร์ประกอบ) */
  children?: ReactNode;
};
type Drag = { bar: TapeBarDto; mode: "move" | "resize"; startX: number; startY: number; colPx: number; dx: number; dy: number; px: number; roomId: string | null };

const SEG = "rounded-lg px-3 py-1.5 text-sm";
const BTN = "inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const BTN_PRIMARY = "inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-[color:var(--color-ink)] px-3 py-2 text-sm font-bold text-white";

export default function TapeChart({ model, view, canEdit, canCreate, nowMs, children }: Props) {
  const router = useRouter();
  const base = `/app/u/${model.unitSlug}/hotel`;
  const n = model.days.length;
  const last = model.days[n - 1] ?? model.from;
  const [drag, setDrag] = useState(null as Drag | null);
  const [pending, setPending] = useState(null as MoveRequest | null);
  const [selected, setSelected] = useState(null as TapeBarDto | null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [notice, setNotice] = useState({ ok: true, text: "" });
  const [mobileDay, setMobileDay] = useState(model.days.includes(model.today) ? model.today : model.from);
  const moved = useRef(false);
  const rooms: RoomOption[] = model.groups.flatMap((g) => g.rooms.map((r) => ({ roomId: r.roomId, number: r.number, roomTypeId: g.roomTypeId, typeName: g.name })));
  const href = (v: TapeView, from: string) => `${base}/calendar?view=${v}&from=${from}`;
  const nav = (dir: 1 | -1) => href(view, shiftFrom(view, model.from, dir));
  const todayFrom = view === "month" ? firstOfMonth(model.today) : model.today;

  // ───────── ลาก (pointer events) ─────────
  const onGrab = (e: GrabEvent, bar: TapeBarDto, mode: "move" | "resize") => {
    if (!canEdit) return;
    const area = e.currentTarget.closest("[data-days-area]");
    const colPx = area ? area.getBoundingClientRect().width / n : 80;
    e.currentTarget.setPointerCapture(e.pointerId);
    moved.current = false;
    setDrag({ bar, mode, startX: e.clientX, startY: e.clientY, colPx, dx: 0, dy: 0, px: 0, roomId: bar.roomId });
  };
  const onPointerMove = (e: GrabEvent) => {
    if (!drag) return;
    const px = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(px) + Math.abs(dy) >= 4) moved.current = true;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-room-row]")?.getAttribute("data-room-row") ?? drag.roomId;
    setDrag({ ...drag, px, dx: Math.round(px / drag.colPx), dy, roomId: drag.mode === "move" ? row : drag.bar.roomId });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!moved.current) {
      setSelected(d.bar);
      return;
    }
    if (d.mode === "resize") {
      const out = addDays(d.bar.to, d.dx);
      if (d.dx === 0 || diffDays(d.bar.from, out) === 0 || out.localeCompare(d.bar.from) === -1) return;
      setPending({ bar: d.bar, mode: "resize", roomId: d.bar.roomId, checkIn: d.bar.from, checkOut: out });
      return;
    }
    const shift = canShiftDates(d.bar.kind) ? d.dx : 0;
    const roomId = d.roomId && d.roomId !== "unassigned" ? d.roomId : d.bar.roomId;
    if (shift === 0 && roomId === d.bar.roomId) return;
    setPending({ bar: d.bar, mode: "move", roomId, checkIn: addDays(d.bar.from, shift), checkOut: addDays(d.bar.to, shift) });
  };
  const offsetOf = (bar: TapeBarDto) => {
    if (!drag || drag.bar.refId !== bar.refId || drag.mode !== "move") return { x: 0, y: 0 };
    return { x: canShiftDates(bar.kind) ? drag.dx * drag.colPx : 0, y: drag.dy };
  };
  const resizeOf = (bar: TapeBarDto) => (drag && drag.mode === "resize" && drag.bar.refId === bar.refId ? drag.dx : 0);
  const done = (ok: boolean, text: string) => {
    if (!ok) {
      setNotice({ ok: false, text: `${text} — แถบกลับที่เดิม` });
      return;
    }
    setPending(null);
    setNotice({ ok: true, text });
    router.refresh();
  };
  const confirmRelease = (blockId: string) => {
    if (!window.confirm("ปล่อยห้องที่ปิดไว้? ห้องจะกลับมาขายได้หลังแม่บ้านตรวจ")) return;
    void release(blockId);
  };
  const release = async (blockId: string) => {
    const r = await releaseBlockAction(model.unitSlug, { blockId });
    setSelected(null);
    setNotice({ ok: r.ok, text: r.ok ? "ปล่อยห้องแล้ว — ห้องรอแม่บ้านตรวจก่อนขาย" : r.reason || "ปล่อยห้องไม่สำเร็จ" });
    if (r.ok) router.refresh();
  };

  const renderBars = (bars: TapeBarDto[]) =>
    bars.map((b) => {
      const o = offsetOf(b);
      return (
        <TapeBar
          key={`${b.kind}-${b.refId}`}
          bar={b}
          gridFrom={model.from}
          nDays={n}
          canEdit={canEdit}
          offsetX={o.x}
          offsetY={o.y}
          resizeDays={resizeOf(b)}
          active={drag?.bar.refId === b.refId}
          nowMs={nowMs}
          onGrab={onGrab}
          onOpen={setSelected}
        />
      );
    });
  const dayCells = (key: string) => (
    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
      {model.days.map((d) => (
        <div key={`${key}-${d}`} className={`border-l border-[color:var(--color-line)] ${d === model.today ? "bg-sky-50/60" : isWeekend(d) ? "bg-gray-50" : ""}`} />
      ))}
    </div>
  );
  const colMin = view === "month" ? 44 : view === "2w" ? 72 : 120;
  const gridCols = { gridTemplateColumns: `9rem minmax(${n * colMin}px, 1fr)` };

  // ───────── มือถือ: แถบของวันที่เลือก ─────────
  const onDay = (b: TapeBarDto, d: string) => b.from.localeCompare(d) !== 1 && (d.localeCompare(b.to) === -1 || (d === b.to && b.kind !== "BLOCK" && b.kind !== "LEASE"));
  const mobileRows = model.groups.flatMap((g) => [
    ...g.rooms.map((r) => ({ key: r.roomId, number: r.number, hk: r.hkStatus, typeName: g.name, bars: r.bars.filter((b) => onDay(b, mobileDay)) })),
    ...(g.unassigned.some((b) => onDay(b, mobileDay)) ? [{ key: `un-${g.roomTypeId}`, number: TXT.unassigned, hk: "", typeName: g.name, bars: g.unassigned.filter((b) => onDay(b, mobileDay)) }] : []),
  ]);
  const openEdit = (b: TapeBarDto) => setPending({ bar: b, mode: "edit", roomId: b.roomId, checkIn: b.from, checkOut: b.to });

  return (
    <div className="flex w-full min-w-0 flex-col gap-4" data-tape-chart="" data-read-only={canEdit ? undefined : ""}>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-[color:var(--color-ink)]">{TXT.title}</h1>
        <nav className="flex rounded-xl border border-[color:var(--color-line)] p-1" aria-label="มุมมอง">
          {(["week", "2w", "month"] as TapeView[]).map((v) => (
            <Link key={v} href={href(v, v === "month" ? firstOfMonth(model.from) : model.from)} className={`${SEG} ${v === view ? "bg-[color:var(--color-ink)] font-bold text-white" : "text-[color:var(--color-muted)]"}`} aria-current={v === view ? "page" : undefined}>
              {VIEW_TH[v]}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 rounded-xl border border-[color:var(--color-line)] px-2 py-1">
          <Link href={nav(-1)} className="px-2 py-1" aria-label="ช่วงก่อนหน้า">
            ‹
          </Link>
          <b className="text-sm">{rangeTh(model.from, last, view)}</b>
          <Link href={nav(1)} className="px-2 py-1" aria-label="ช่วงถัดไป">
            ›
          </Link>
        </div>
        <Link href={href(view, todayFrom)} className="text-sm text-[color:var(--color-muted)] underline">
          วันนี้
        </Link>
        <span className="flex-1" />
        {canEdit ? (
          <button type="button" onClick={() => setBlockOpen(true)} className={BTN} data-block-open="">
            ปิดห้อง
          </button>
        ) : null}
        {canCreate ? (
          <Link href={`${base}/reservations/new`} className={BTN_PRIMARY}>
            ＋ จองใหม่
          </Link>
        ) : null}
      </header>

      {children}

      {canEdit ? null : <p className="text-xs text-[color:var(--color-muted)]">{TXT.readOnly}</p>}
      {notice.text ? (
        <p role={notice.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-[color:var(--color-danger)]"}`}>
          {notice.text}
        </p>
      ) : null}

      {/* ───────── เดสก์ท็อป: กริด ───────── */}
      <div className="hidden md:block">
        <div data-scroll-hint={TXT.scrollHint} className="overflow-x-auto rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
          <div className="grid text-sm" style={gridCols}>
            <div className="sticky left-0 z-10 border-b border-[color:var(--color-line)] bg-gray-50 px-3 py-3 text-xs font-bold text-[color:var(--color-muted)]">ห้อง</div>
            <div className="grid border-b border-[color:var(--color-line)] bg-gray-50" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {model.days.map((d) => (
                <div key={d} className={`border-l border-[color:var(--color-line)] px-1 py-2 text-center text-xs ${d === model.today ? "font-bold text-sky-700" : ""} ${isWeekend(d) ? "bg-gray-100" : ""}`}>
                  {dowTh(d)}
                  <b className="block text-sm">{view === "month" ? d.slice(8, 10).replace(/^0/, "") : dayMonthTh(d)}</b>
                </div>
              ))}
            </div>

            {model.groups.map((g) => (
              <div key={g.roomTypeId} className="contents">
                <div className="col-span-2 border-b border-[color:var(--color-line)] bg-gray-50 px-3 py-2 text-xs font-bold text-[color:var(--color-muted)]" data-tape-group={g.roomTypeId}>
                  {g.name} · ฿{baht(g.rateTodaySatang)}/คืน{g.rateWeekendSatang !== g.rateTodaySatang ? ` · ศ.–ส. ฿${baht(g.rateWeekendSatang)}` : ""}
                </div>
                {g.rooms.map((r) => (
                  <div key={r.roomId} className="contents">
                    <div className="sticky left-0 z-10 flex items-center justify-between gap-2 border-b border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2">
                      <b>{r.number}</b>
                      <span className={`rounded border px-1.5 text-[11px] ${r.hkStatus === "DIRTY" ? "border-red-300 text-red-600" : "border-[color:var(--color-line)] text-[color:var(--color-muted)]"}`}>{HK_TH[r.hkStatus] ?? r.hkStatus}</span>
                    </div>
                    <div className="relative h-11 border-b border-[color:var(--color-line)]" data-days-area="" data-room-row={r.roomId}>
                      {dayCells(r.roomId)}
                      {renderBars(r.bars)}
                    </div>
                  </div>
                ))}
                {g.unassigned.length ? (
                  <div className="contents">
                    <div className="sticky left-0 z-10 flex items-center border-b border-[color:var(--color-line)] bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{TXT.unassigned}</div>
                    <div className="flex flex-col border-b border-[color:var(--color-line)] bg-amber-50/40" data-unassigned={g.roomTypeId}>
                      {g.unassigned.map((b) => (
                        <div key={b.refId} className="relative h-11" data-days-area="" data-room-row="unassigned">
                          {dayCells(`u-${b.refId}`)}
                          {renderBars([b])}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            <div className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-xs font-bold">{TXT.occRow}</div>
            <div className="grid bg-gray-50" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} data-occupancy-row="">
              {model.occupancy.map((o) => (
                <div key={o.date} className="border-l border-[color:var(--color-line)] px-1 py-2 text-center text-xs">
                  <b>
                    {o.occupied.toLocaleString("th-TH")}/{o.sellable.toLocaleString("th-TH")}
                  </b>
                  {view === "month" ? null : ` · ${pct(o.occupied, o.sellable)}`}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ───────── มือถือ 390: รายการรายวัน + แถบเล็กสัปดาห์ (ไม่ลาก) ───────── */}
      <div className="flex flex-col gap-3 md:hidden" data-tape-mobile="">
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="แถบวันของสัปดาห์">
          {model.days.map((d, i) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === mobileDay}
              onClick={() => setMobileDay(d)}
              className={`flex min-w-12 flex-col items-center rounded-lg border px-2 py-1 text-xs ${d === mobileDay ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-white" : "border-[color:var(--color-line)]"}`}
            >
              {dowTh(d)}
              <b>{d.slice(8, 10).replace(/^0/, "")}</b>
              <span className="text-[10px] opacity-80">{model.occupancy[i] ? pct(model.occupancy[i].occupied, model.occupancy[i].sellable) : ""}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">
          {dowTh(mobileDay)} {dayMonthTh(mobileDay)} · สัปดาห์ {rangeTh(model.from, last, view)}
        </p>
        <ul className="flex flex-col divide-y divide-[color:var(--color-line)] rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
          {mobileRows.map((row) => (
            <li key={row.key} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <b>{row.number}</b>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {row.typeName}
                  {row.hk ? ` · ${HK_TH[row.hk] ?? row.hk}` : ""}
                </span>
              </div>
              {row.bars.length ? (
                row.bars.map((b) => (
                  <div key={b.refId} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs ${BAR_CLASS[b.kind]}`}>
                    <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSelected(b)}>
                      {b.label}
                    </button>
                    {canEdit && isDraggable(b.kind) ? (
                      <button type="button" onClick={() => openEdit(b)} className="shrink-0 rounded border border-current px-2 py-0.5">
                        ย้ายห้อง/เลื่อน
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <span className="text-xs text-[color:var(--color-muted)]">ว่าง</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* ───────── คำอธิบายแถบ ───────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" data-tape-legend="">
        {TAPE_KINDS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i className={`inline-block h-3 w-5 rounded ${BAR_CLASS[k]}`} />
            {LEGEND_TH[k]}
          </span>
        ))}
        <span className="ml-auto text-[color:var(--color-muted)]">{TXT.otaNote}</span>
      </div>

      {/* ───────── ป็อปสรุปแถบ ───────── */}
      {selected ? (
        <div role="dialog" aria-modal="true" aria-label="สรุปรายการ" className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-3 sm:items-center" onClick={() => setSelected(null)}>
          <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl bg-[color:var(--color-surface)] p-4 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <b className="text-base">{selected.label}</b>
            <span className="text-[color:var(--color-muted)]">
              {LEGEND_TH[selected.kind]} · {dayMonthTh(selected.from)} – {dayMonthTh(selected.to)} ({diffDays(selected.from, selected.to)} คืน)
              {selected.code ? ` · ${selected.code}` : ""}
            </span>
            {selected.kind === "HOLD" && selected.holdExpiresAt ? <span>{holdExpired(selected.holdExpiresAt, nowMs) ? "หมดเวลาถือห้องแล้ว — รอระบบปล่อยห้อง" : `ถือห้องถึง ${timeTh(selected.holdExpiresAt)} — รอมัดจำ`}</span> : null}
            {selected.roomNote ? <span>{selected.roomNote} — ย้ายไปห้องที่ขายได้</span> : null}
            {selected.kind === "BLOCK" && selected.reason ? <span>เหตุผล: {selected.reason}</span> : null}
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              {selected.kind === "BLOCK" && canEdit ? (
                <button type="button" className={BTN} onClick={() => confirmRelease(selected.refId)} data-release-block="">
                  ปล่อยห้อง
                </button>
              ) : null}
              {canEdit && isDraggable(selected.kind) ? (
                <button type="button" className={BTN} onClick={() => { openEdit(selected); setSelected(null); }}>
                  ย้ายห้อง/เลื่อน
                </button>
              ) : null}
              {selected.href ? (
                <Link href={selected.href} className={BTN_PRIMARY}>
                  {selected.kind === "LEASE" ? "ไปหน้าหอ" : "ดูรายละเอียด"}
                </Link>
              ) : null}
              {!selected.href && selected.kind === "LEASE" ? <span className="text-xs text-[color:var(--color-muted)]">จัดการสัญญาที่ระบบหอ</span> : null}
              <button type="button" className={BTN} onClick={() => setSelected(null)}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pending ? <MoveConfirmDialog unitSlug={model.unitSlug} req={pending} rooms={rooms} onClose={() => setPending(null)} onDone={done} /> : null}
      {blockOpen ? (
        <BlockDialog
          unitSlug={model.unitSlug}
          rooms={rooms}
          today={model.today}
          onClose={() => setBlockOpen(false)}
          onDone={() => {
            setBlockOpen(false);
            setNotice({ ok: true, text: "ปิดห้องแล้ว" });
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
