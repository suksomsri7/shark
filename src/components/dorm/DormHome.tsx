"use client";
// SVC D.13 ▸ หอ 01 — KPI · (ผังห้องเป็น children) · ต้องทำวันนี้ · รอบบิล (ภาพ ledger/design-dorm/01-floorplan.png · ใบสั่ง svc-brief-d.13 §4.4)
//   • ข้อมูลทั้งหมดมาจาก dormHomeModel (ฝั่งเซิร์ฟเวอร์ตัดขอบเขตอาคาร/เงินแล้ว) — ไฟล์นี้ไม่คำนวณสิทธิ์
//   • ไม่เห็นเงิน (model.money=false) ⇒ ไม่มีการ์ดเงิน/แผงรอบบิล/สัญลักษณ์เงินเลย
//   • ไม่ใช้ hook ของ Next · ลิงก์ <a> · render ด้วย renderToStaticMarkup ได้
import type { ReactNode } from "react";
import type { DormHomeModel } from "@/lib/modules/dorm";
import { bahtText, thaiMonthShort, thaiMonthYear, thaiShortDate } from "./dorm-home-shared";

type Props = { model: DormHomeModel; unitSlug: string; children?: ReactNode };

const baht = (satang: number) => `฿${bahtText(satang)}`;

const TODO_ACTION: Record<DormHomeModel["todo"][number]["kind"], string> = {
  overdue: "ดูยอดค้าง",
  slips: "ตรวจสลิป",
  repairs: "ดูห้องปิดซ่อม",
  moveIns: "ทำสัญญา",
  expiring: "ดูสัญญา",
};
const TODO_HEAD: Record<DormHomeModel["todo"][number]["kind"], string> = {
  overdue: "ค้างจ่ายเกินกำหนด",
  slips: "สลิปรอตรวจ",
  repairs: "แจ้งซ่อมใหม่",
  moveIns: "ผู้เช่าใหม่เข้า",
  expiring: "สัญญาหมดภายใน 30 วัน",
};

function Kpi({ k, value, label, children }: { k: string; value: string; label: string; children: ReactNode }) {
  return (
    <div data-kpi={k} data-kpi-value={value} className="flex min-w-0 flex-col gap-1 border-[color:var(--color-line)] p-4 sm:p-5 [&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-t-0">
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      {children}
    </div>
  );
}

function Big({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <span className="text-2xl font-bold leading-tight tabular-nums sm:text-3xl" style={{ color: tone === "danger" ? "var(--color-danger)" : "var(--color-ink)" }}>
      {children}
    </span>
  );
}
function Sub({ children }: { children: ReactNode }) {
  return <span className="text-xs leading-snug text-[color:var(--color-muted)]">{children}</span>;
}

export default function DormHome({ model, unitSlug, children }: Props) {
  const k = model.kpi;
  const base = model.basePath || `/app/u/${unitSlug}/dorm`;
  const period = model.billing?.periodKey ?? model.kpi.collected?.periodKey ?? null;
  const vacancy = `${k.vacant}·${k.booked}·${k.repair}`;
  const cols = model.money ? "lg:grid-cols-5" : "lg:grid-cols-3";
  return (
    <div data-dorm-home="" data-date={model.date} className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-[color:var(--color-ink)]">ผังห้อง</h1>
        <span className="text-sm text-[color:var(--color-muted)]">
          {model.unitName} · {k.rooms.total} ห้อง
        </span>
        {model.money && period ? (
          <span className="rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink-soft)]">
            รอบบิล <b className="text-[color:var(--color-ink)]">{thaiMonthYear(period)}</b>
          </span>
        ) : null}
        {model.scope.all ? null : (
          <span className="rounded-full bg-[color:var(--color-surface-2)] px-3 py-1 text-xs text-[color:var(--color-ink-soft)]">เห็นเฉพาะอาคารที่ดูแล</span>
        )}
      </header>

      <section data-dorm-kpi="" aria-label="ภาพรวมหอ" className={`grid min-w-0 grid-cols-1 overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] sm:grid-cols-2 ${cols}`}>
        <Kpi k="rooms" value={String(k.rooms.total)} label="ห้องทั้งหมด">
          <Big>{k.rooms.total}</Big>
          <Sub>
            {[`${k.rooms.floors} ชั้น`, ...k.rooms.byType.map((t) => `${t.name} ${t.count}`)].join(" · ")}
          </Sub>
        </Kpi>
        <Kpi k="occupied" value={String(k.occupied.count)} label="มีผู้เช่า">
          <span className="flex items-baseline gap-1">
            <Big>{k.occupied.count}</Big>
            <span className="text-sm text-[color:var(--color-muted)]">· {k.occupied.pct}%</span>
          </span>
          <Sub>
            เดือนก่อน {k.occupied.prevMonthCount} ห้อง ({k.occupied.prevMonthPct}%)
          </Sub>
        </Kpi>
        <Kpi k="vacancy" value={vacancy} label="ว่าง · จอง · ซ่อม">
          <Big>
            {k.vacant} · {k.booked} · {k.repair}
          </Big>
          <Sub>{k.longestVacant ? `${k.longestVacant.roomNumber} ว่างนานสุด ${k.longestVacant.days} วัน` : "ไม่มีห้องว่างค้างนาน"}</Sub>
        </Kpi>
        {model.money ? (
          <Kpi k="collected" value={String(k.collected?.satang ?? 0)} label={k.collected ? `บิล ${thaiMonthShort(k.collected.periodKey)} รับแล้ว` : "บิลรอบนี้ รับแล้ว"}>
            <Big>{k.collected ? baht(k.collected.satang) : "—"}</Big>
            <Sub>
              {k.collected
                ? `${k.collected.paidBills} จาก ${k.collected.billCount} ห้อง${k.collected.dueDate ? ` · ครบกำหนด ${thaiShortDate(k.collected.dueDate)}` : ""}`
                : "ยังไม่มีรอบบิล"}
            </Sub>
          </Kpi>
        ) : null}
        {model.money ? (
          <Kpi k="overdue" value={String(k.overdue?.satang ?? 0)} label="ค้างจ่ายเดือนก่อน">
            <Big tone={k.overdue && k.overdue.satang > 0 ? "danger" : undefined}>{baht(k.overdue?.satang ?? 0)}</Big>
            <Sub>
              {k.overdue && k.overdue.rooms.length
                ? `${k.overdue.rooms.length} ห้อง (${k.overdue.rooms.join(" · ")}) · เลยกำหนด ${k.overdue.maxDaysLate} วัน`
                : "ไม่มียอดค้างเกินกำหนด"}
            </Sub>
          </Kpi>
        ) : null}
      </section>

      {children ? <div className="min-w-0">{children}</div> : null}

      <div className={`grid min-w-0 gap-5 ${model.money ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
        <section data-dorm-todo="" aria-label="ต้องทำวันนี้" className="min-w-0 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[color:var(--color-ink)]">ต้องทำวันนี้</h2>
            <span className="text-xs text-[color:var(--color-muted)]">เรียงตามเร่งด่วน</span>
          </div>
          {model.todo.length === 0 ? (
            <p className="py-3 text-sm text-[color:var(--color-muted)]">วันนี้ไม่มีงานค้าง</p>
          ) : (
            <ul className="flex min-w-0 flex-col">
              {model.todo.map((t) => {
                const urgent = t.kind === "overdue" || t.kind === "slips" || t.kind === "repairs";
                const dash = t.textTh.indexOf(" — ");
                const head = dash > 0 ? t.textTh.slice(0, dash) : TODO_HEAD[t.kind];
                const rest = dash > 0 ? t.textTh.slice(dash + 3) : t.textTh;
                return (
                  <li key={t.kind} data-todo={t.kind} data-count={t.count} className="flex min-w-0 items-start gap-3 border-t border-[color:var(--color-line)] py-3 first:border-t-0">
                    <span
                      className="mt-0.5 inline-flex h-6 min-w-6 flex-none items-center justify-center rounded-md px-1.5 text-xs font-bold"
                      style={
                        t.kind === "overdue"
                          ? { background: "var(--color-danger)", color: "#fff" }
                          : urgent
                            ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                            : { border: "1px solid var(--color-line)", color: "var(--color-ink)" }
                      }
                    >
                      {t.count}
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-snug text-[color:var(--color-ink)]">
                      <b>{head}</b> — {rest}
                    </span>
                    <a href={t.href} className="flex-none whitespace-nowrap text-sm font-bold text-[color:var(--color-accent)] underline-offset-2 hover:underline">
                      {TODO_ACTION[t.kind]}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {model.money ? (
          model.billing ? (
            <BillingPanel b={model.billing} />
          ) : (
            <section data-billing-empty="" className="min-w-0 rounded-2xl border border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5 text-sm text-[color:var(--color-muted)]">
              <h2 className="mb-1 text-base font-bold text-[color:var(--color-ink)]">รอบบิล</h2>
              ยังไม่มีรอบบิล — เมื่อออกบิลรอบแรก ยอดเก็บแล้ว/รอเก็บจะแสดงที่นี่
            </section>
          )
        ) : null}
      </div>
    </div>
  );
}

function BillingPanel({ b }: { b: NonNullable<DormHomeModel["billing"]> }) {
  const total = Math.max(1, b.paid + b.slipPending + b.unpaid);
  const segs = [
    { key: "paid", label: "จ่ายแล้ว", count: b.paid, style: { background: "var(--color-ink)" } },
    { key: "pending", label: "สลิปรอตรวจ", count: b.slipPending, style: { background: "var(--color-accent)" } },
    { key: "unpaid", label: "ยังไม่จ่าย", count: b.unpaid, style: { background: "var(--color-line)" } },
  ];
  return (
    <section data-dorm-billing="" data-period={b.periodKey} aria-label="รอบบิล" className="min-w-0 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[color:var(--color-ink)]">รอบบิล {thaiMonthYear(b.periodKey)}</h2>
        {b.sentAt ? (
          <span className="rounded-lg border-2 border-[color:var(--color-ink)] px-3 py-1 text-sm font-bold text-[color:var(--color-ink)]">ส่งแล้ว {thaiShortDate(b.sentAt)}</span>
        ) : (
          <span className="rounded-lg border border-[color:var(--color-line)] px-3 py-1 text-sm text-[color:var(--color-muted)]">ยังไม่ส่ง</span>
        )}
      </div>
      <div aria-hidden="true" className="flex h-3.5 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
        {segs.map((s) => (s.count > 0 ? <span key={s.key} style={{ ...s.style, width: `${(s.count * 100) / total}%` }} /> : null))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[color:var(--color-ink-soft)]">
        {segs.map((s) => (
          <li key={s.key} data-seg={s.key} data-count={s.count} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5" style={s.style} />
            {s.label} {s.count}
          </li>
        ))}
      </ul>
      {b.held + b.draft > 0 ? (
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">
          {b.held > 0 ? `พักบิล ${b.held}` : ""}
          {b.held > 0 && b.draft > 0 ? " · " : ""}
          {b.draft > 0 ? `ร่าง ${b.draft}` : ""}
        </p>
      ) : null}
      <dl className="mt-5 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <dt className="text-xs text-[color:var(--color-muted)]">ยอดบิลทั้งรอบ</dt>
          <dd className="text-xl font-bold tabular-nums text-[color:var(--color-ink)] sm:text-2xl">{baht(b.totalSatang)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[color:var(--color-muted)]">รอเก็บ</dt>
          <dd className="text-xl font-bold tabular-nums text-[color:var(--color-ink)] sm:text-2xl">{baht(b.outstandingSatang)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-[color:var(--color-muted)]">
        {b.billCount} บิล · รับแล้ว {baht(b.collectedSatang)}
      </p>
    </section>
  );
}
