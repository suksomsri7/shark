// SVC B.5 — ชิ้นส่วนร่วมของจอคิววันนี้ / ของฉัน / ปฏิทินรายวัน (ไม่มี state · render ได้ทั้ง server และ renderToStaticMarkup)
// 🔴 import ค่าได้เฉพาะ react · next · @/components · @/lib/ui · ไฟล์ข้าง ๆ — ชนิดจาก booking ใช้ `import type` (ข้อสอบ U-0)
// 🔴 ทุกปุ่มต่องานอยู่ใน <form action={actions[a]}> ที่มี input appointmentId (+ at ในโหมด QC) · noshow/cancel = ConfirmDialog
// 🔴 เวลาแสดงคิดจาก epoch + 7 ชม. (ไม่ใช้นาฬิกาเครื่อง)
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { LineAction, LineJob } from "@/lib/modules/booking/today-line";

export type LineActionKey = LineAction | "walkin";
export type LineActions = Record<LineActionKey, (fd: FormData) => Promise<void>>;

/** HH:MM เวลาไทยจาก epoch ms */
export function hhmm(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "--:--";
  return new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16);
}
/** "ส. 31 ต.ค." จาก YYYY-MM-DD (วันที่ปฏิทิน — ไม่ขึ้นกับนาฬิกาเครื่อง) */
export function dayLabel(dayStr: string): string {
  const [y, m, d] = dayStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
export const minLabel = (min: number | null) => (min === null ? "--:--" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);

export const ACTION_LABEL: Record<LineAction, string> = {
  call: "เรียก",
  recall: "เรียกคืน",
  skip: "ข้าม",
  start: "เริ่ม",
  done: "เสร็จ",
  move: "ย้ายช่าง",
  checkin: "เช็กอินให้",
  noshow: "ไม่มาแน่นอน",
  cancel: "ยกเลิกงานค้าง",
};

/** input ซ่อนของทุกฟอร์ม: appointmentId · at (โหมด QC เท่านั้น) · from (หน้าที่ต้องกลับเมื่อมีข้อผิดพลาด) */
function Hidden({ id, at, from }: { id: string; at?: string; from?: string }) {
  return (
    <>
      <input type="hidden" name="appointmentId" value={id} />
      {at ? <input type="hidden" name="at" value={at} /> : null}
      {from ? <input type="hidden" name="from" value={from} /> : null}
    </>
  );
}

/** ปุ่มหนึ่ง action ของงานหนึ่งชิ้น (ไม่รวม move — ใช้ MoveForm) */
export function ActButton({ a, id, actions, at, from, primary }: { a: Exclude<LineAction, "move">; id: string; actions: LineActions; at?: string; from?: string; primary?: boolean }) {
  if (a === "noshow" || a === "cancel") {
    return (
      <ConfirmDialog
        testId={`line-${a}-${id}`}
        triggerLabel={ACTION_LABEL[a]}
        triggerClassName="btn-sm min-h-[40px] text-[color:var(--color-danger)]"
        title={a === "noshow" ? "บันทึกว่าลูกค้าไม่มา?" : "ยกเลิกงานที่ค้างอยู่?"}
        detail={a === "noshow" ? "นัดนี้จะถูกนับว่าไม่มา และปล่อยช่องให้คิวถัดไป" : "งานนี้จะถูกยกเลิกและบัตรคิวปิด"}
        confirmLabel={a === "noshow" ? "ยืนยันไม่มา" : "ยืนยันยกเลิก"}
        danger
        action={actions[a]}
        fields={{ appointmentId: id, ...(at ? { at } : {}), ...(from ? { from } : {}) }}
      />
    );
  }
  return (
    <form action={actions[a]} className="inline-flex">
      <Hidden id={id} at={at} from={from} />
      <button
        type="submit"
        data-line-action={a}
        data-appointment-id={id}
        className={primary ? "btn btn-primary min-h-[40px] px-4 text-sm" : "btn-sm min-h-[40px]"}
      >
        {ACTION_LABEL[a]}
      </button>
    </form>
  );
}

/** ย้ายช่าง: ฟอร์มใน <details> (เลือกช่างอื่นของสาขา) */
export function MoveForm({ job, staff, actions, at, from }: { job: LineJob; staff: { staffId: string; name: string }[]; actions: LineActions; at?: string; from?: string }) {
  const others = staff.filter((s) => s.staffId !== job.staffId);
  return (
    <details className="relative inline-block">
      <summary className="btn-sm min-h-[40px] cursor-pointer list-none">{ACTION_LABEL.move}</summary>
      <form
        action={actions.move}
        data-line-move={job.appointmentId}
        className="absolute right-0 z-20 mt-1 flex w-56 flex-col gap-2 rounded-xl border bg-[color:var(--color-surface)] p-3 shadow-lg"
      >
        <Hidden id={job.appointmentId} at={at} from={from} />
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ย้ายไปช่าง
          <select name="toStaffId" className="input" defaultValue={others[0]?.staffId ?? ""}>
            {others.map((s) => (
              <option key={s.staffId} value={s.staffId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" data-line-action="move" data-appointment-id={job.appointmentId} className="btn btn-primary text-sm">
          ย้าย
        </button>
      </form>
    </details>
  );
}

/** ปุ่มทั้งหมดของงาน/การ์ด ตามลำดับคงที่ (เฉพาะที่อยู่ใน actions — ไม่มีปุ่มเกิน) */
const ORDER: LineAction[] = ["call", "recall", "start", "done", "checkin", "skip", "move", "noshow", "cancel"];
export function JobButtons({
  job, acts, staff, actions, at, from, primary,
}: { job: LineJob | { appointmentId: string; staffId: string | null }; acts: LineAction[]; staff: { staffId: string; name: string }[]; actions: LineActions; at?: string; from?: string; primary?: LineAction }) {
  return (
    <>
      {ORDER.filter((a) => acts.includes(a)).map((a) =>
        a === "move" ? (
          <MoveForm key={a} job={job as LineJob} staff={staff} actions={actions} at={at} from={from} />
        ) : (
          <ActButton key={a} a={a} id={job.appointmentId} actions={actions} at={at} from={from} primary={primary === a} />
        ),
      )}
    </>
  );
}

/** ป้ายเลขบัตร (P = นัด · A = walk-in) */
export function TicketTag({ job }: { job: Pick<LineJob, "ticketNumber" | "kind" | "status"> }) {
  if (!job.ticketNumber) {
    return <span className="rounded-md border border-dashed px-1.5 py-0.5 text-[11px] text-[color:var(--color-muted)]">ยังไม่มา</span>;
  }
  return (
    <span
      className={
        "rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums " +
        (job.kind === "WALKIN" ? "bg-[color:var(--color-surface-2)] ring-1 ring-[color:var(--color-line)]" : "ring-1 ring-[color:var(--color-ink)]")
      }
    >
      {job.ticketNumber}
    </span>
  );
}

/** บรรทัดรองของงานในแถวรอ (ไม่มีเบอร์เต็มเว้นแต่ผู้ดูมีสิทธิ์ — phone มาจากตัวโหลดแล้ว) */
export function jobSubline(j: LineJob): string {
  const parts: string[] = [];
  if (j.kind === "WALKIN") parts.push("walk-in");
  else if (j.bookedStartMs !== null) parts.push(`นัด ${hhmm(j.bookedStartMs)}`);
  if (j.kind === "BOOKED") parts.push(j.serviceName);
  if (j.staffName) parts.push(j.staffName);
  if (j.waitedMin !== null) parts.push(`รอแล้ว ${j.waitedMin} นาที`);
  if (j.kind === "BOOKED" && j.ticketNumber === null && j.phoneMasked) parts.push(j.phone ?? j.phoneMasked);
  return parts.join(" · ");
}
