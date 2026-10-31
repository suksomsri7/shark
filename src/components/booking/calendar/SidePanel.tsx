// SVC B.14 — กล่องข้างของปฏิทินนัด (ภาพ 02): รับ walk-in ตอนนี้ได้ไหม · ห้อง/เตียงตอนนี้ · การ์ดงานที่เลือก
// 🔴 ไม่มี state · import ค่าได้เฉพาะ react · @/components · resource-kinds (pure) — ชนิดจาก booking ใช้ import type
// 🔴 ไม่มีเบอร์ลูกค้า · ความชอบลูกค้า = notes จากหน้า (loadJobCustomerNotes ตามสิทธิ์)
import type { ReactNode } from "react";
import type { CalCard, CalendarView } from "@/lib/modules/booking/calendar";
import { RESOURCE_KIND_LABELS_TH, isResourceKind } from "@/lib/modules/booking/resource-kinds";
import JobNotes, { type JobNotesMap } from "../JobNotes";
import { hhmm } from "../line-parts";
import { HiddenFields, baht, hm, minOf, shortNames, timeOptions, viewFields, type CalActions } from "./cal-utils";

const kindLabel = (k: string) => (isResourceKind(k) ? RESOURCE_KIND_LABELS_TH[k] : k);
const BOX = "rounded-[18px] border bg-[color:var(--color-surface)] p-5";

export function WalkInNowBox({ view }: { view: CalendarView }) {
  const rows = view.walkInNow ?? [];
  return (
    <section data-bq-walkin-now="" className={BOX}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-bold">รับ walk-in ตอนนี้ได้ไหม</h2>
        <span className="rounded-lg border px-2 py-0.5 text-xs tabular-nums text-[color:var(--color-muted)]">{hhmm(view.nowMs)}</span>
      </div>
      {rows.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">ไม่มีบริการที่รับ walk-in</p> : null}
      <ul className="flex flex-col">
        {rows.map((r, i) => {
          const at = r.startAt ? new Date(r.startAt).getTime() : null;
          const now = r.limitedBy === "NONE" && at !== null && at <= view.nowMs + 60_000;
          const red = r.limitedBy !== "NONE";
          return (
            <li key={r.serviceId} data-walkin-service={r.serviceId} className={"grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-3 " + (i ? "border-t" : "pt-1")}>
              <b className="text-[14.5px]">{r.serviceName}</b>
              <span className={"whitespace-nowrap text-sm font-bold tabular-nums " + (red ? "text-[color:var(--color-danger)]" : "")}>
                {r.closed && at === null ? "ปิดรับ" : now ? "ได้ทันที" : at !== null ? hhmm(at) : "—"}
              </span>
              <small className="col-span-2 text-[12.5px] leading-snug text-[color:var(--color-muted)]">{r.reasonTh}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ResourcesNowBox({ view }: { view: CalendarView }) {
  const items = view.resourcesNow ?? [];
  // แถวละชนิด (ช่วงต่อเนื่องตามลำดับ resourcesNow — ไม่สลับลำดับ)
  const runs: { kind: string; items: typeof items }[] = [];
  for (const it of items) {
    const last = runs[runs.length - 1];
    if (last && last.kind === it.kind) last.items.push(it);
    else runs.push({ kind: it.kind, items: [it] });
  }
  return (
    <section data-bq-res-now="" className={BOX}>
      <h2 className="mb-4 text-[15px] font-bold">ห้อง/เตียง ตอนนี้</h2>
      {items.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีห้อง/เตียงในสาขานี้</p> : null}
      <div className="flex flex-col gap-3">
        {runs.map((run, k) => {
          const sn = shortNames(run.items.map((x) => x.name));
          return (
            <div key={`${run.kind}-${k}`} className="flex items-center gap-2.5 text-[13.5px]">
              <span className="w-24 flex-none truncate text-[color:var(--color-ink-soft)]">{sn.prefix || kindLabel(run.kind)}</span>
              <div className="flex flex-wrap gap-1.5">
                {run.items.map((x, j) => (
                  <i
                    key={x.id}
                    data-res-now={x.id}
                    data-state={x.state}
                    title={x.name}
                    className={
                      "grid h-[30px] min-w-[40px] place-items-center rounded-lg px-2 text-[12.5px] font-bold not-italic " +
                      (x.state === "BUSY"
                        ? "border border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
                        : x.state === "NEXT"
                          ? "border-[1.5px] border-dashed border-[color:var(--color-ink)]"
                          : x.state === "MAINT"
                            ? "border text-[color:var(--color-muted)] [background:repeating-linear-gradient(135deg,var(--color-surface-2)_0_6px,var(--color-stage)_6px_12px)]"
                            : "border text-[color:var(--color-ink-soft)]")
                    }
                  >
                    {sn.short[j]}
                    {x.state === "NEXT" && x.nextStartMs !== null ? ` · ${hhmm(x.nextStartMs)}` : ""}
                  </i>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-[color:var(--color-muted)]">ดำ = ใช้อยู่ · เส้นประ = เตรียมรอบถัดไป · ว่าง = กรอบเทา · ลาย = ปิดซ่อม</p>
    </section>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-t py-2.5 text-sm first:border-t-0">
      <span className="flex-none text-[color:var(--color-ink-soft)]">{k}</span>
      <span className="min-w-0 flex-1 text-right font-semibold">{v}</span>
    </div>
  );
}

/** ฟอร์มย้าย (ตัวเดียวกับการลาก — moveAppointmentAction) */
function MoveCardForm({ view, card, actions, at, kind }: { view: CalendarView; card: CalCard; actions: CalActions; at?: string; kind: "who" | "when" }) {
  const day = new Date(card.startMs + 7 * 3_600_000).toISOString().slice(0, 10);
  const startMin = minOf(card.startMs, day);
  const times = timeOptions(view);
  if (!times.includes(startMin)) times.push(startMin);
  times.sort((a, b) => a - b);
  return (
    <details className="relative">
      <summary data-cal-card-move={kind} className="btn-sm min-h-[44px] cursor-pointer list-none px-4">
        {kind === "who" ? `ย้าย${view.providerLabel}/ห้อง` : "เลื่อนนัด"}
      </summary>
      <form action={actions.move} className="absolute bottom-full right-0 z-30 mb-2 flex w-72 flex-col gap-2 rounded-xl border bg-[color:var(--color-surface)] p-3 shadow-lg">
        <HiddenFields fields={{ appointmentId: card.appointmentId, expectStartAt: new Date(card.startMs).toISOString(), expectStaffId: card.staffId ?? "", ...viewFields(view, at) }} />
        {kind === "when" ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              วันที่
              <input type="date" name="dateStr" defaultValue={day} className="input" required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              เวลา
              <select name="startMin" defaultValue={String(startMin)} className="input">
                {times.map((t) => (
                  <option key={t} value={t}>
                    {hm(t)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <input type="hidden" name="dateStr" value={day} />
            <input type="hidden" name="startMin" value={String(startMin)} />
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              {view.providerLabel}
              <select name="staffId" defaultValue={card.staffId ?? ""} className="input">
                {view.options.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {view.options.resources.length ? (
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ห้อง/เตียง
                <select name="resourceId" defaultValue="" className="input">
                  <option value="">ให้ระบบเลือก (ชิ้นเดิมก่อน)</option>
                  {view.options.resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {kindLabel(r.kind)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        )}
        <button type="submit" data-cal-move-submit={card.appointmentId} className="btn btn-primary text-sm">
          ยืนยันย้าย
        </button>
      </form>
    </details>
  );
}
export function JobCard({ view, card, actions, at, notes }: { view: CalendarView; card: CalCard; actions: CalActions; at?: string; notes?: JobNotesMap }) {
  const title = card.kind === "WALKIN" ? card.label : `${card.label}${card.ticketNumber ? ` · ${card.ticketNumber}` : ""}`;
  const pay = card.depositSatang > 0 ? `มัดจำ ${baht(card.depositSatang)} ${card.depositPaid ? "✓ รับแล้ว" : "· ยังไม่รับ"}` : card.priceSatang !== null ? `ค่าบริการ ${baht(card.priceSatang)}` : "—";
  return (
    <section data-cal-card={card.appointmentId} className={BOX + " border-[1.5px] border-[color:var(--color-accent)]"}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold">{title}</h2>
        {card.checkedInMs !== null ? (
          <span className="rounded-lg border border-[color:var(--color-ink)] px-2 py-0.5 text-xs font-semibold tabular-nums">เช็กอิน {hhmm(card.checkedInMs)}</span>
        ) : (
          <span className="rounded-lg border px-2 py-0.5 text-xs tabular-nums text-[color:var(--color-muted)]">
            {hhmm(card.startMs)}–{hhmm(card.endMs)}
          </span>
        )}
      </div>
      <Row k="บริการ" v={card.serviceName} />
      <Row k={`${view.providerLabel} · ห้อง`} v={[card.staffName ?? "ใครก็ได้", ...card.resourceNames].filter(Boolean).join(" · ")} />
      <Row k="ชำระ" v={pay} />
      <div className="border-t py-2.5 text-sm">
        <span className="text-[color:var(--color-ink-soft)]">ลูกค้า</span>
        <JobNotes notes={notes} appointmentId={card.appointmentId} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {card.canStart ? (
          <form action={actions.start} className="inline-flex">
            <HiddenFields fields={{ appointmentId: card.appointmentId, ...(at ? { at } : {}) }} />
            <button type="submit" data-line-action="start" data-appointment-id={card.appointmentId} className="btn btn-primary min-h-[44px] px-4 text-sm">
              เริ่ม{view.providerLabel.includes("นวด") ? "นวด" : "งาน"}
            </button>
          </form>
        ) : null}
        {card.movable ? (
          <>
            <MoveCardForm view={view} card={card} actions={actions} at={at} kind="who" />
            <MoveCardForm view={view} card={card} actions={actions} at={at} kind="when" />
          </>
        ) : null}
      </div>
    </section>
  );
}
