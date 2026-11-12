// HR H2.6 ▸ คำขอแก้เวลา (server components — mockup 05 การ์ด "แก้เวลา" · 04A แถว "แก้เวลา" · 04B "ขอแก้เวลา")
//   ฟอร์ม: ชนิดคำขอ · ชนิดการลงเวลา · แถวเดิม (แก้/ยกเลิก) · วันเวลาไทย · เหตุผล → server action (closure ของหน้า) → redirect รหัสผลสั้น ·
//   การ์ด: ชิป · ชื่อ · เวลายื่น · หัวเรื่อง · เวลาที่ขอ + เหตุผล · หลักฐาน POS · ป้ายขอซ้ำ · อนุมัติ/ไม่อนุมัติ · ยกเลิก ·
//   รับ DTO ของ correction.ts เท่านั้น (ไม่มีพิกัด/อุปกรณ์/เงิน) · ไม่อ่านนาฬิกา · ปุ่มสูง ≥ 44 px · tokens ล้วน ◂
import { getTranslations } from "next-intl/server";
import type { CorrectablePunch, CorrectionItem } from "./correction";

type FormFn = (fd: FormData) => Promise<void>;
type T = Awaited<ReturnType<typeof getTranslations>>;

const BKK_MS = 7 * 3_600_000;
const hm = (iso: string | null) => (iso ? new Date(Date.parse(iso) + BKK_MS).toISOString().slice(11, 16) : "—");
const bkkLocal = (iso: string) => new Date(Date.parse(iso) + BKK_MS).toISOString().slice(0, 16);
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MONTHS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;
const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const muted = "text-[color:var(--color-muted)]";
const KINDS = ["OUT", "IN", "BREAK_START", "BREAK_END"] as const;
const ACTIONS = ["ADD", "CHANGE", "VOID"] as const;

function dayText(t: T, day: string | null): string {
  if (!day) return "";
  const d = new Date(`${day}T00:00:00Z`);
  return t("dayLabel", { dow: t(`dow.${DOW[d.getUTCDay()]!}`), d: d.getUTCDate(), month: t(`months.${MONTHS[d.getUTCMonth()]!}`) });
}
function stampText(t: T, iso: string): string {
  const b = new Date(Date.parse(iso) + BKK_MS);
  return t("stamp", { d: b.getUTCDate(), month: t(`months.${MONTHS[b.getUTCMonth()]!}`), time: b.toISOString().slice(11, 16) });
}

/** ฟอร์มยื่นคำขอแก้เวลา (พับไว้ใต้ปุ่ม) — employeeId = ยื่นแทน · null = ของตัวเอง */
export async function CorrectionForm({
  systemId,
  employeeId,
  day,
  punches,
  onSubmit,
  self,
}: {
  systemId: string;
  employeeId: string | null;
  day: string;
  punches: CorrectablePunch[];
  onSubmit: FormFn;
  self: boolean;
}) {
  const t = await getTranslations("hr.correction");
  return (
    <details className="relative">
      <summary data-testid="hr-corr-open" className={`${ghost} cursor-pointer list-none`}>
        {self ? t("openSelf") : t("open")}
      </summary>
      <form action={onSubmit} data-testid="hr-corr-form" className="mt-2 flex w-80 max-w-[85vw] flex-col gap-2 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3 text-left text-sm">
        <input type="hidden" name="systemId" value={systemId} />
        {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
        <label className="flex flex-col gap-1 text-xs">
          {t("actionLabel")}
          <select name="action" defaultValue="ADD" className="input min-h-[44px]" data-testid="hr-corr-action">
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`action.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("kindLabel")}
          <select name="kind" defaultValue="OUT" className="input min-h-[44px]" data-testid="hr-corr-kind">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("targetLabel")}
          <select name="attendanceId" defaultValue="" className="input min-h-[44px]" data-testid="hr-corr-target">
            <option value="">{t("targetNone")}</option>
            {punches.map((p) => (
              <option key={p.id} value={p.id}>
                {t(`kind.${p.kind}`)} {stampText(t, p.at)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("timeLabel")}
          <input type="datetime-local" name="at" defaultValue={`${day}T17:00`} className="input min-h-[44px]" data-testid="hr-corr-time" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("reasonLabel")}
          <textarea name="reason" required minLength={3} maxLength={200} rows={2} className="input min-h-[44px]" data-testid="hr-corr-reason" />
        </label>
        <p className={`text-xs ${muted}`}>{t("hint")}</p>
        <button type="submit" className={btn} data-testid="hr-corr-submit">
          {t("submit")}
        </button>
      </form>
    </details>
  );
}

const STATUS_TONE: Record<CorrectionItem["status"], string> = {
  PENDING: "border-[color:var(--color-ink)] text-[color:var(--color-ink)] font-semibold",
  APPROVED: "border-[color:var(--color-line)] text-[color:var(--color-muted)]",
  REJECTED: "border-[color:var(--color-danger)] text-[color:var(--color-danger)]",
  CANCELLED: "border-[color:var(--color-line)] text-[color:var(--color-muted)]",
};

/** รายการการ์ดคำขอแก้เวลา (mockup 05) — decideIds/cancelIds = id ที่ผู้ดูกดได้ (หน้าเป็นคนคำนวณจากสิทธิ์ · service ตรวจซ้ำ) */
export async function CorrectionList({
  items,
  systemId,
  decideIds,
  cancelIds,
  onDecide,
  onCancel,
}: {
  items: CorrectionItem[];
  systemId: string;
  decideIds: ReadonlySet<string>;
  cancelIds: ReadonlySet<string>;
  onDecide: FormFn | null;
  onCancel: FormFn | null;
}) {
  const t = await getTranslations("hr.correction");
  return (
    <section data-testid="hr-corr-list" className="flex flex-col gap-3">
      {items.length === 0 && <p className={`rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-6 text-sm ${muted}`}>{t("empty")}</p>}
      {items.map((c) => {
        const pending = c.status === "PENDING";
        const ev = c.evidence?.posShifts ?? [];
        return (
          <article key={c.id} data-testid={`hr-corr-card-${c.id}`} className="flex flex-col gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-7 items-center rounded-lg border-[1.5px] border-[color:var(--color-ink)] px-2.5 text-[13px] font-bold">{t("chip")}</span>
              <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-stage)] text-sm">
                {Array.from(c.employeeName.trim())[0] ?? "·"}
              </span>
              <b className="text-[17px]">{c.employeeName}</b>
              {c.filedOnBehalf && <span className={`text-[13px] ${muted}`}>{t("onBehalf")}</span>}
              <span className="flex-1" />
              {!pending && <span className={`inline-flex items-center rounded-lg border-[1.5px] px-2 py-0.5 text-[13px] ${STATUS_TONE[c.status]}`}>{t(`status.${c.status}`)}</span>}
              <span className={`text-[13px] ${muted}`}>{t("filed", { at: stampText(t, c.createdAt) })}</span>
            </div>
            <p className="flex flex-wrap items-center gap-2.5 text-[15px]">
              <b>{t(`headline.${c.action}`, { kind: t(`kindShort.${c.kind}`), day: dayText(t, c.day) })}</b>
              {c.originalAt && <span className={muted}>· {t("original", { time: hm(c.originalAt) })}</span>}
            </p>
            <p className="flex flex-wrap items-center gap-2.5 text-[15px]">
              {c.proposedAt ? (
                <>
                  <span className={muted}>{t("propose", { kind: t(`kindShort.${c.kind}`) })}</span>
                  <b className="tabular-nums">{hm(c.proposedAt)}</b>
                </>
              ) : (
                <span className={muted}>{t("voidLine")}</span>
              )}
              <span className={muted}>· “{c.reason}”</span>
            </p>
            <p data-testid={`hr-corr-evidence-${c.id}`} className="flex items-start gap-2.5 rounded-xl bg-[color:var(--color-stage)] px-3.5 py-2.5 text-[13.5px] leading-relaxed">
              {ev.length === 0
                ? t("evidenceNone")
                : t("evidence", {
                    list: ev.map((s) => t(s.forced ? "evidenceForced" : "evidenceShift", { no: s.shiftNo, open: hm(s.openedAt), close: hm(s.closedAt) })).join(" · "),
                  })}
            </p>
            {c.repeat && (
              <p data-testid={`hr-corr-repeat-${c.id}`} className="text-[13px] font-semibold text-[color:var(--color-danger)]">
                ⚠ {t("repeat", { n: c.periodCount ?? 0 })}
              </p>
            )}
            {pending && (decideIds.has(c.id) || cancelIds.has(c.id)) && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {cancelIds.has(c.id) && onCancel && (
                  <form action={onCancel}>
                    <input type="hidden" name="systemId" value={systemId} />
                    <input type="hidden" name="correctionId" value={c.id} />
                    <button type="submit" className={ghost} data-testid={`hr-corr-cancel-${c.id}`}>
                      {t("cancel")}
                    </button>
                  </form>
                )}
                {decideIds.has(c.id) && onDecide && (
                  <>
                    <form action={onDecide}>
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="correctionId" value={c.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                      <button type="submit" className={ghost} data-testid={`hr-corr-reject-${c.id}`}>
                        {t("reject")}
                      </button>
                    </form>
                    <form action={onDecide}>
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="correctionId" value={c.id} />
                      <input type="hidden" name="decision" value="APPROVED" />
                      <button type="submit" className={btn} data-testid={`hr-corr-approve-${c.id}`}>
                        {t("approve")}
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}
          </article>
        );
      })}
      <p className={`text-xs ${muted}`}>{t("note")}</p>
    </section>
  );
}
