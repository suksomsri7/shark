// SVC B.5 — มือถือช่าง "ของฉัน" (390 px · DESIGN-BOOKING-QUEUE §7 "ช่างเห็นงานของตัวเอง + แถวรวม") · สัญญา DOM: ใบสั่ง §4
// งานตอนนี้ของฉัน (ปุ่มเสร็จ) → คิวถัดไปของฉัน (เรียก/เริ่ม/ข้าม) → แถวรวมทั้งร้าน (ปุ่มเฉพาะที่ผู้ดูทำได้) · ไม่มีเบอร์
import type { LineJob, TodayLineView } from "@/lib/modules/booking/today-line";
import { JobButtons, TicketTag, dayLabel, hhmm, jobSubline, type LineActions } from "./line-parts";

type Props = { view: TodayLineView; unitSlug: string; actions: LineActions; at?: string };

export default function MyQueue({ view, actions, at }: Props) {
  const staff = view.staff.map((s) => ({ staffId: s.staffId, name: s.name }));
  const mineCur = view.inService.filter((j) => j.mine);
  const otherCur = view.inService.filter((j) => !j.mine && j.actions.length > 0);
  const mineNext = view.waiting.filter((j) => j.mine);
  const myNames = view.staff.filter((s) => s.mine).map((s) => s.name);
  const buttons = (j: LineJob, primary?: "start" | "done") => (
    <JobButtons job={j} acts={j.actions} staff={staff} actions={actions} at={at} from="mine" primary={primary} />
  );
  const todoWithActs = view.todo.filter((t) => t.actions.length > 0);

  return (
    <div data-my-queue="" className="mx-auto flex w-full max-w-[430px] flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">ของฉัน · {dayLabel(view.dayStr)}</h1>
        <p className="text-[13px] text-[color:var(--color-muted)]">
          {myNames.length ? myNames.join(" · ") : "บัญชีนี้ยังไม่ผูกกับช่าง — ดูแถวรวมได้อย่างเดียว"} · ตอนนี้ {hhmm(view.nowMs)}
        </p>
      </div>

      <section data-my-current="" className="rounded-2xl bg-[color:var(--color-ink)] p-4 text-[color:var(--color-surface)]">
        <h2 className="text-xs font-semibold opacity-70">กำลังทำ</h2>
        {mineCur.length === 0 ? <p className="mt-2 text-sm opacity-80">ยังไม่มีงานที่กำลังทำ</p> : null}
        {mineCur.map((j) => (
          <div key={j.appointmentId} className="mt-2 flex flex-col gap-2" data-my-job={j.appointmentId}>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-xs font-semibold">{j.ticketNumber ?? "นัด"}</span>
              <b className="truncate text-base">{j.label}</b>
            </div>
            <small className="text-xs opacity-80">
              {j.serviceName} · เริ่ม {hhmm(j.plannedStartMs)} · ถึง {hhmm(j.plannedEndMs)}
            </small>
            {j.actions.length ? <div className="flex flex-wrap gap-2 text-[color:var(--color-ink)]">{buttons(j, "done")}</div> : null}
          </div>
        ))}
      </section>

      <section data-my-next="" className="card p-4">
        <h2 className="text-[15px] font-bold">คิวถัดไปของฉัน</h2>
        {mineNext.length === 0 ? <p className="mt-2 text-sm text-[color:var(--color-muted)]">ยังไม่มีคิวที่วางให้</p> : null}
        <div className="mt-1 flex flex-col">
          {mineNext.map((j) => (
            <Row key={j.appointmentId} j={j}>
              {j.actions.length ? buttons(j, "start") : null}
            </Row>
          ))}
        </div>
      </section>

      {otherCur.length || view.skipped.length || todoWithActs.length ? (
        <section className="card p-4">
          <h2 className="text-[15px] font-bold">งานอื่นที่ทำได้</h2>
          {otherCur.map((j) => (
            <div key={j.appointmentId} className="flex items-center gap-2 border-b py-2 last:border-b-0">
              <TicketTag job={j} />
              <span className="min-w-0 flex-1 truncate text-sm">{j.label} · {j.staffName ?? ""}</span>
              <div className="flex gap-1.5">{buttons(j)}</div>
            </div>
          ))}
          {view.skipped.map((j) => (
            <div key={j.appointmentId} className="flex items-center gap-2 border-b py-2 last:border-b-0">
              <TicketTag job={j} />
              <span className="min-w-0 flex-1 truncate text-sm">{j.label} · ข้ามแล้ว</span>
              {j.actions.length ? <div className="flex flex-wrap gap-1.5">{buttons(j)}</div> : null}
            </div>
          ))}
          {todoWithActs.map((t) => (
            <div key={`${t.kind}-${t.appointmentId}`} className="flex flex-col gap-1.5 border-b py-2 last:border-b-0">
              <b className="text-sm">{t.title}</b>
              <div className="flex flex-wrap gap-1.5">
                <JobButtons job={{ appointmentId: t.appointmentId, staffId: null }} acts={t.actions} staff={staff} actions={actions} at={at} from="mine" />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section data-my-line="" className="card p-4">
        <h2 className="text-[15px] font-bold">แถวรวมทั้งร้าน</h2>
        {view.waiting.length === 0 ? <p className="mt-2 text-sm text-[color:var(--color-muted)]">ไม่มีคิวรอ</p> : null}
        <div className="mt-1 flex flex-col">
          {view.waiting.map((j) => (
            <Row key={j.appointmentId} j={j} dim={!j.mine}>
              {j.actions.length ? buttons(j) : null}
            </Row>
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({ j, dim, children }: { j: LineJob; dim?: boolean; children?: React.ReactNode }) {
  return (
    <div data-line-wait={j.appointmentId} className={"flex items-start gap-3 border-b py-3 last:border-b-0 " + (dim ? "text-[color:var(--color-ink-soft)]" : "")}>
      <div className="w-12 flex-none">
        <b className="block text-sm tabular-nums">{hhmm(j.plannedStartMs ?? j.bookedStartMs)}</b>
        <small className="block text-[11px] text-[color:var(--color-muted)]">{j.waitMin === null ? "" : `อีก ${j.waitMin} น.`}</small>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <TicketTag job={j} />
          <b className="truncate text-sm">{j.label}</b>
        </div>
        <small className="mt-0.5 block text-xs text-[color:var(--color-muted)]">{jobSubline({ ...j, phone: null })}</small>
        {children ? <div className="mt-2 flex flex-wrap gap-1.5">{children}</div> : null}
      </div>
    </div>
  );
}
