// SVC B.5 — จอคิววันนี้แถวเดียว (ภาพ จอง 01 · แท็บเล็ต/คอมหน้าร้าน) · สัญญา DOM: ใบสั่ง §4
// ซ้าย: หัว + การ์ด 4 ใบ + สัญลักษณ์ + ตารางช่างแนวนอน (เส้นตอนนี้) + การ์ด "ต้องจัดการ" · ขวา: แถวรอแถวเดียว + กล่องทำไม + รับ walk-in
// 🔴 ไม่มี state/hook (render บน server ได้) · ปุ่ม = เฉพาะ actions ของงานนั้น · 390 px ไม่ล้นทั้งหน้า (ตารางช่างเลื่อนในกล่อง)
import Link from "next/link";
import type { LineBlock, LineJob, TodayLineView } from "@/lib/modules/booking/today-line";
import { JobButtons, TicketTag, dayLabel, hhmm, jobSubline, minLabel, type LineActions } from "./line-parts";
import JobNotes, { hasJobNotes, type JobNotesMap } from "./JobNotes"; // SVC B.16

// SVC B.16 ▸ notes = ความชอบ/ข้อห้ามลูกค้า (loadJobCustomerNotes) · ไม่ส่ง/{} ⇒ DOM เดิมทุกไบต์ ◂
type Props = { view: TodayLineView; unitSlug: string; actions: LineActions; at?: string; bookingHref?: string; notes?: JobNotesMap };

const LOOK_CLASS: Record<LineBlock["look"], string> = {
  now: "bg-[color:var(--color-ink)] text-[color:var(--color-surface)] border border-[color:var(--color-ink)]",
  arrived: "bg-[color:var(--color-surface)] border-[1.5px] border-[color:var(--color-ink)]",
  booked: "bg-[color:var(--color-surface)] border-[1.5px] border-dashed border-[color:var(--color-ink)]",
  placed: "bg-[#d4d4d4] border-2 border-[color:var(--color-accent)] text-[color:var(--color-ink)]",
  noshow: "bg-[color:var(--color-surface)] border-[1.5px] border-dashed border-[color:var(--color-danger)] text-[color:var(--color-danger)]",
  done: "bg-[color:var(--color-surface-2)] border border-[color:var(--color-line)] text-[color:var(--color-muted)]",
};
const LOOK_SUB: Partial<Record<LineBlock["look"], string>> = { done: "เสร็จ", noshow: "ไม่มา" };

export default function TodayLine({ view, unitSlug, actions, at, bookingHref, notes }: Props) {
  const staff = view.staff.map((s) => ({ staffId: s.staffId, name: s.name }));
  const span = Math.max(1, view.axisEndMs - view.axisStartMs);
  const pct = (ms: number) => ((ms - view.axisStartMs) / span) * 100;
  const hours: number[] = [];
  for (let t = Math.ceil(view.axisStartMs / 3_600_000) * 3_600_000; t <= view.axisEndMs; t += 3_600_000) hours.push(t);
  const k = view.kpi;
  const nowPct = pct(view.nowMs);
  const btn = (j: LineJob, from?: string, primary?: "call") => (
    <JobButtons job={j} acts={j.actions} staff={staff} actions={actions} at={at} from={from} primary={primary} />
  );

  return (
    <div data-today-line="" data-booking-wide="" className="flex w-full min-w-0 flex-col gap-6 xl:flex-row xl:items-start">
      {/* ═════ ซ้าย ═════ */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold tracking-tight">คิววันนี้ · {dayLabel(view.dayStr)}</h1>
            <p className="mt-0.5 text-[13px] text-[color:var(--color-muted)]">
              {view.openMin === null ? "วันนี้ร้านปิด" : `เปิด ${minLabel(view.openMin)}–${minLabel(view.closeMin)}`} · ช่าง {view.staff.length} คนตามกะวันนี้ · เก้าอี้ {view.staff.length} ตัว
            </p>
          </div>
          <Link href={`/app/u/${unitSlug}/booking/devices`} className="btn btn-ghost min-h-[44px]">
            จอทีวี
          </Link>
          {bookingHref ? (
            <Link href={bookingHref} target="_blank" className="btn btn-ghost min-h-[44px]">
              จองให้ลูกค้า
            </Link>
          ) : null}
          {view.walkInForm ? (
            <a href="#line-walkin" className="btn btn-primary min-h-[44px]">
              + รับ walk-in
            </a>
          ) : null}
        </div>

        {/* การ์ด 4 ใบ */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Kpi id="booked" k="นัดวันนี้" v={String(k.booked)} f={`มาแล้ว ${k.arrived} · ไม่มา ${k.absent} · ยังไม่ถึงเวลา ${k.upcoming}`} />
          <Kpi id="walkin" k="walk-in วันนี้" v={String(k.walkIns)} f={`ลุกกลับก่อนได้คิว ${k.walkInsLeft}`} />
          <Kpi id="waiting" k="กำลังรอในร้าน" v={`${k.waiting} คน`} f={k.longestWaitMin === null ? "ไม่มีคนรอ" : `รอนานสุด ${k.longestWaitMin} นาที${k.longestWaitTicket ? ` (${k.longestWaitTicket})` : ""}`} />
          <Kpi id="done" k="เสร็จแล้ว" v={String(k.done)} f="วันนี้" />
        </div>

        {/* สัญลักษณ์ */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[color:var(--color-ink-soft)]">
          <Legend cls={LOOK_CLASS.now} t="กำลังทำ" />
          <Legend cls={LOOK_CLASS.arrived} t="นัด · มาแล้ว" />
          <Legend cls={LOOK_CLASS.booked} t="นัด · ยังไม่มา" />
          <Legend cls={LOOK_CLASS.placed} t="walk-in · ระบบวางให้" />
          <Legend cls={LOOK_CLASS.noshow} t="ไม่มา" />
          <span className="inline-flex items-center gap-2">
            <i className="inline-block h-4 w-0.5 bg-[color:var(--color-accent)]" />
            ตอนนี้
          </span>
        </div>

        {/* ตารางช่างแนวนอน — เลื่อนในกล่อง */}
        <div className="overflow-x-auto rounded-xl border">
          <div className="min-w-[760px]">
            <div className="flex h-10 border-b bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-muted)]">
              <div className="flex w-[150px] flex-none items-center border-r px-3 font-medium">ช่าง · เก้าอี้</div>
              <div className="relative flex-1">
                {hours.map((t) => (
                  <span key={t} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 tabular-nums" style={{ left: `${Math.min(97, Math.max(3, pct(t)))}%` }}>
                    {hhmm(t)}
                  </span>
                ))}
              </div>
            </div>
            {view.staff.map((s, i) => (
              <div key={s.staffId} data-line-staff={s.staffId} className={"flex h-[92px] " + (i < view.staff.length - 1 ? "border-b" : "")}>
                <div className="flex w-[150px] flex-none items-center gap-2 border-r px-3">
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-md border text-[11px]">{s.name.replace(/^ช่าง/, "").slice(0, 1)}</span>
                  <div className="min-w-0">
                    <b className="block truncate text-sm">{s.name}</b>
                    <small className="block text-xs text-[color:var(--color-muted)]">เก้าอี้ {s.seat}{s.mine ? " · ของฉัน" : ""}</small>
                  </div>
                </div>
                <div className="relative flex-1 overflow-hidden">
                  {hours.map((t) => (
                    <i key={t} className="absolute inset-y-0 w-px bg-[color:var(--color-line)]" style={{ left: `${pct(t)}%` }} />
                  ))}
                  {s.blocks.map((b) => {
                    const l = pct(b.startMs);
                    const r = pct(b.endMs);
                    const out = r <= 0 || l >= 100;
                    const left = Math.max(0, l);
                    const width = Math.max(0.8, Math.min(100, r) - left);
                    return (
                      <div
                        key={b.appointmentId}
                        data-line-block={b.appointmentId}
                        data-look={b.look}
                        title={`${b.ticketNumber ?? ""} ${b.label} ${hhmm(b.startMs)}–${hhmm(b.endMs)}`.trim()}
                        className={`absolute inset-y-2.5 overflow-hidden rounded-lg px-2 py-1.5 text-xs leading-tight ${LOOK_CLASS[b.look]} ${out ? "hidden" : ""}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <b className="block truncate text-[12.5px]">
                          {b.look === "booked" ? `${hhmm(b.startMs)} ${b.label}` : [b.ticketNumber, b.look === "placed" ? "" : b.label].filter(Boolean).join(" ")}
                        </b>
                        <small className="block truncate opacity-80">{LOOK_SUB[b.look] ?? (b.look === "placed" ? b.label : hhmm(b.startMs))}</small>
                      </div>
                    );
                  })}
                  {nowPct >= 0 && nowPct <= 100 ? (
                    <div data-now-line="" className="absolute inset-y-0 z-10 w-0.5 bg-[color:var(--color-accent)]" style={{ left: `${nowPct}%` }}>
                      {i === 0 ? (
                        <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded bg-[color:var(--color-accent)] px-1 text-[10px] font-semibold text-white tabular-nums">
                          {hhmm(view.nowMs)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ต้องจัดการ */}
        {view.todo.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {view.todo.map((t) => (
              <div key={`${t.kind}-${t.appointmentId}`} data-line-todo={t.appointmentId} className="card flex items-start gap-3.5 p-4">
                <span
                  className={
                    "grid h-9 w-9 flex-none place-items-center rounded-[10px] text-sm " +
                    (t.kind === "SOON" ? "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]" : "border-[1.5px] border-[color:var(--color-danger)] text-[color:var(--color-danger)]")
                  }
                  aria-hidden
                >
                  {t.kind === "SOON" ? "◷" : "!"}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="text-[14.5px]">{t.title}</b>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[color:var(--color-muted)]">{t.detail}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {t.phone ? (
                      <a href={`tel:${t.phone}`} className="btn-sm min-h-[40px]">
                        โทรหา
                      </a>
                    ) : null}
                    <JobButtons
                      job={jobForTodo(view, t.appointmentId)}
                      acts={t.actions}
                      staff={staff}
                      actions={actions}
                      at={at}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ═════ ขวา ═════ */}
      <aside className="flex w-full flex-col gap-4 xl:w-[350px] xl:flex-none">
        <section className="card p-4">
          <h3 className="flex items-center gap-2 text-[15px] font-bold">
            แถวรอ · แถวเดียว
            <span className="ml-auto rounded-md border px-2 py-0.5 text-[11px] font-normal text-[color:var(--color-muted)]">เรียงตามเวลาที่จะได้ทำ</span>
          </h3>
          {view.waiting.length === 0 ? <p className="mt-3 text-sm text-[color:var(--color-muted)]">ไม่มีคิวรอ</p> : null}
          <div className="mt-2 flex flex-col">
            {view.waiting.map((j) => {
              const ghost = j.ticketNumber === null;
              const hl = view.why?.appointmentId === j.appointmentId;
              return (
                <div
                  key={j.appointmentId}
                  data-line-wait={j.appointmentId}
                  className={"flex items-start gap-3 border-b py-3 last:border-b-0 " + (hl ? "-mx-2 rounded-lg border-b-0 bg-[color:var(--color-accent-soft)] px-2" : "") + (ghost ? " opacity-70" : "")}
                >
                  <div className="w-14 flex-none">
                    <b className="block text-[15px] tabular-nums">{hhmm(j.plannedStartMs ?? j.bookedStartMs)}</b>
                    <small className="block text-xs text-[color:var(--color-muted)]">{waitLabel(j)}</small>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <TicketTag job={j} />
                      <b className="truncate text-sm">{j.label}</b>
                    </div>
                    <small className="mt-0.5 block text-xs text-[color:var(--color-muted)]">{jobSubline(j)}</small>
                    {j.actions.length ? <div className="mt-2 flex flex-wrap gap-1.5">{btn(j, undefined, "call")}</div> : null}
                    <JobNotes notes={notes} appointmentId={j.appointmentId} />
                  </div>
                </div>
              );
            })}
          </div>
          {view.inService.length ? (
            <div className="mt-3 border-t pt-3">
              <h4 className="text-xs font-semibold text-[color:var(--color-muted)]">กำลังทำ</h4>
              {view.inService.map((j) => (
                <div key={j.appointmentId} data-line-inservice={j.appointmentId} className={"flex items-center gap-2 py-2" + (hasJobNotes(notes, j.appointmentId) ? " flex-wrap" : "")}>
                  <TicketTag job={j} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {j.label} <small className="text-xs text-[color:var(--color-muted)]">· {j.staffName ?? ""} · ถึง {hhmm(j.plannedEndMs)}</small>
                  </span>
                  {j.actions.length ? <div className="flex gap-1.5">{btn(j)}</div> : null}
                  <JobNotes notes={notes} appointmentId={j.appointmentId} />
                </div>
              ))}
            </div>
          ) : null}
          {view.skipped.length ? (
            <div className="mt-3 border-t pt-3">
              <h4 className="text-xs font-semibold text-[color:var(--color-muted)]">ข้ามแล้ว (เรียกแล้วไม่มา)</h4>
              {view.skipped.map((j) => (
                <div key={j.appointmentId} data-line-skipped={j.appointmentId} className="flex items-center gap-2 py-2">
                  <TicketTag job={j} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {j.label} <small className="text-xs text-[color:var(--color-muted)]">· ต่อท้ายแถว {hhmm(j.plannedStartMs)}</small>
                  </span>
                  {j.actions.length ? <div className="flex flex-wrap gap-1.5">{btn(j)}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {view.why ? (
          <div data-line-why={view.why.appointmentId} className="rounded-xl bg-[color:var(--color-accent-soft)] p-4 text-[13px] leading-relaxed text-[color:var(--color-accent)]">
            <b>
              ทำไม {view.why.ticketNumber ?? ""} ได้{view.why.staffName ?? ""} {hhmm(view.why.startMs)}
            </b>
            <br />
            {view.why.text}
          </div>
        ) : null}

        {view.walkInForm ? (
          <details id="line-walkin" className="card p-4" open>
            <summary className="cursor-pointer text-[15px] font-bold">รับ walk-in</summary>
            <form data-line-walkin-form="" action={actions.walkin} className="mt-3 flex flex-col gap-3">
              {at ? <input type="hidden" name="at" value={at} /> : null}
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                บริการ
                <select name="serviceId" className="input" required defaultValue={view.walkInForm.services.find((s) => s.walkIn !== false)?.id}>
                  {view.walkInForm.services.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.walkIn === false}>
                      {s.name} · {s.durationMin} นาที{s.walkIn === false ? " (ไม่รับ walk-in)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ช่าง
                <select name="staffId" className="input" defaultValue="">
                  <option value="">ใครก็ได้ (เร็วสุด)</option>
                  {view.walkInForm.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ชื่อเรียก (ไม่บังคับ)
                <input name="customerName" className="input" maxLength={80} />
              </label>
              <button type="submit" data-line-action="walkin" className="btn btn-primary min-h-[44px]">
                ออกบัตรคิว
              </button>
            </form>
          </details>
        ) : null}

        <section className="card p-4">
          <h3 className="text-[15px] font-bold">เชื่อมกับระบบอื่น</h3>
          <div className="mt-2 flex flex-col text-[13px]">
            <div className="flex justify-between border-b py-2">
              ตารางช่าง<small className="text-xs text-[color:var(--color-muted)]">กะวันนี้จากระบบพนักงาน</small>
            </div>
            <div className="flex justify-between py-2">
              จบงาน → บิล<small className="text-xs text-[color:var(--color-muted)]">กดเสร็จที่แถวงาน</small>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Kpi({ id, k, v, f }: { id: string; k: string; v: string; f: string }) {
  return (
    <div data-line-kpi={id} className="card px-5 py-4">
      <div className="text-[13px] text-[color:var(--color-muted)]">{k}</div>
      <div className="mt-1 text-[28px] font-bold tabular-nums tracking-tight">{v}</div>
      <div className="mt-0.5 text-[12.5px] text-[color:var(--color-muted)]">{f}</div>
    </div>
  );
}

function Legend({ cls, t }: { cls: string; t: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <i className={`inline-block h-[13px] w-[22px] rounded ${cls}`} />
      {t}
    </span>
  );
}

function waitLabel(j: LineJob): string {
  if (j.ticketNumber === null && j.kind === "BOOKED") return "นัด";
  if (j.kind === "BOOKED" && j.bookedStartMs !== null && j.plannedStartMs === j.bookedStartMs) return "ตรงนัด";
  if (j.waitMin === null) return "";
  return j.waitMin === 0 ? "ถึงคิว" : `อีก ${j.waitMin} นาที`;
}

/** งานของการ์ด todo (ใช้ช่างปัจจุบันกรองตัวเลือกย้ายช่าง) */
function jobForTodo(view: TodayLineView, id: string): { appointmentId: string; staffId: string | null } {
  const j = [...view.waiting, ...view.inService, ...view.skipped].find((x) => x.appointmentId === id);
  if (j) return j;
  const b = view.staff.flatMap((s) => s.blocks).find((x) => x.appointmentId === id);
  return { appointmentId: id, staffId: b?.staffId ?? null };
}

