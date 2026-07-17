import { requireUnit } from "@/lib/core/context";
import {
  listCourses,
  listClasses,
  listEnrollments,
  attendanceSheet,
} from "@/lib/modules/school/service";
import {
  createCourseAction,
  toggleCourseAction,
  createClassAction,
  enrollAction,
  markPaidAction,
  cancelEnrollmentAction,
  refundEnrollmentAction,
  checkInAction,
} from "@/lib/modules/school/actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });
const fmtDate = (d: Date) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  ENROLLED: { text: "รอชำระ", cls: "text-amber-600" },
  PAID: { text: "ชำระแล้ว", cls: "text-green-600" },
  CANCELLED: { text: "ยกเลิก", cls: "text-[color:var(--color-muted)]" },
  REFUNDED: { text: "คืนเงินแล้ว", cls: "text-rose-600" },
};

// จัดการคอร์สเรียน — /app/u/[unitSlug]/school (คอร์ส · รอบเรียน · สมัคร · ชำระ · เช็คชื่อรายวัน)
export default async function SchoolManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ date?: string; err?: string }>;
}) {
  const { unitSlug } = await params;
  const { date: dateParam, err } = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const sheetDateStr = dateParam || todayStr;
  const sheetDate = new Date(sheetDateStr);

  const [courses, classes, enrollments] = await Promise.all([
    listCourses(ctx, {}),
    listClasses(ctx),
    listEnrollments(ctx),
  ]);
  const activeCourses = courses.filter((c) => c.active);

  // ใบเช็คชื่อรายวันของแต่ละรอบ (สำหรับวันที่เลือก)
  const sheets = await Promise.all(
    classes.map(async (cl) => ({ cl, rows: await attendanceSheet(ctx, cl.id, sheetDate) })),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <div className="text-sm text-[color:var(--color-muted)]">🎓 โรงเรียน/คอร์สเรียน</div>
        <h1 className="text-2xl font-semibold">{unit.name}</h1>
      </div>

      {err && (
        <div className="rounded-lg border border-[color:var(--color-danger)] bg-rose-50 px-3 py-2 text-sm text-[color:var(--color-danger)]">
          {err}
        </div>
      )}

      {/* เพิ่มคอร์ส */}
      <form action={createCourseAction.bind(null, unitSlug)} className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">เพิ่มคอร์ส</h2>
        <input name="name" required maxLength={120} placeholder="ชื่อคอร์ส (เช่น ว่ายน้ำเด็ก)" className="rounded-lg border px-3 py-2 text-sm" />
        <input name="priceBaht" required type="number" min={0} step="0.01" placeholder="ค่าเรียน (บาท)" className="rounded-lg border px-3 py-2 text-sm" />
        <input name="description" maxLength={500} placeholder="รายละเอียด (ถ้ามี)" className="rounded-lg border px-3 py-2 text-sm" />
        <button className="btn btn-primary text-sm">บันทึกคอร์ส</button>
      </form>

      {/* รายการคอร์ส + เพิ่มรอบเรียน */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">คอร์สทั้งหมด ({courses.length})</h2>
        {courses.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีคอร์ส</p>}
        {courses.map((c) => {
          const cls = classes.filter((cl) => cl.courseId === c.id);
          return (
            <div key={c.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {c.name} {!c.active && <span className="text-xs text-[color:var(--color-muted)]">(ปิดใช้)</span>}
                  </div>
                  <div className="text-sm text-[color:var(--color-muted)]">
                    ฿{baht(c.priceSatang)}
                    {c.description && ` · ${c.description}`}
                  </div>
                </div>
                <form action={toggleCourseAction.bind(null, unitSlug, c.id, !c.active)}>
                  <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">
                    {c.active ? "ปิดใช้" : "เปิดใช้"}
                  </button>
                </form>
              </div>

              {/* รอบเรียนของคอร์สนี้ */}
              {cls.length > 0 && (
                <div className="flex flex-col gap-1 text-sm">
                  {cls.map((cl) => (
                    <div key={cl.id} className="flex items-center justify-between gap-2 text-[color:var(--color-muted)]">
                      <span className="truncate">
                        {cl.name}
                        {cl.startDate && ` · เริ่ม ${fmtDate(cl.startDate)}`}
                      </span>
                      <span className="shrink-0 text-xs">
                        {cl._count.enrollments} คน{cl.capacity !== null ? ` / ${cl.capacity}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* เพิ่มรอบเรียน */}
              {c.active && (
                <form action={createClassAction.bind(null, unitSlug)} className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <input type="hidden" name="courseId" value={c.id} />
                  <input name="name" required maxLength={120} placeholder="ชื่อรอบ (เช่น รอบเช้า)" className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm" />
                  <input name="startDate" type="date" className="rounded-lg border px-3 py-1.5 text-sm" />
                  <input name="capacity" type="number" min={0} placeholder="รับ (คน)" className="w-24 rounded-lg border px-3 py-1.5 text-sm" />
                  <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">เพิ่มรอบ</button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      {/* สมัครเรียน */}
      {classes.length > 0 && (
        <form action={enrollAction.bind(null, unitSlug)} className="card flex flex-col gap-3">
          <h2 className="text-sm font-medium">สมัครเรียน</h2>
          <select name="classId" required className="rounded-lg border px-3 py-2 text-sm">
            {classes.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.course.name} — {cl.name} (฿{baht(cl.course.priceSatang)})
              </option>
            ))}
          </select>
          <input name="studentName" required maxLength={120} placeholder="ชื่อนักเรียน" className="rounded-lg border px-3 py-2 text-sm" />
          <input name="studentPhone" maxLength={30} placeholder="เบอร์โทร (ถ้ามี)" className="rounded-lg border px-3 py-2 text-sm" />
          <button className="btn btn-primary text-sm">บันทึกการสมัคร</button>
        </form>
      )}

      {/* รายชื่อผู้สมัคร */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">ผู้สมัคร ({enrollments.length})</h2>
        {enrollments.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีผู้สมัคร</p>}
        {enrollments.map((e) => {
          const st = STATUS_LABEL[e.status] ?? { text: e.status, cls: "" };
          return (
            <div key={e.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{e.studentName}</div>
                <div className="text-sm text-[color:var(--color-muted)]">
                  {e.class.course.name} · {e.class.name} · ฿{baht(e.priceSatang)}
                  {e.studentPhone && ` · ${e.studentPhone}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-xs font-medium ${st.cls}`}>{st.text}</span>
                {e.status === "ENROLLED" && (
                  <>
                    <form action={markPaidAction.bind(null, unitSlug, e.id)}>
                      <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">รับชำระ</button>
                    </form>
                    <form action={cancelEnrollmentAction.bind(null, unitSlug, e.id)}>
                      <button className="rounded-full border px-3 py-1 text-xs text-red-600 hover:bg-[color:var(--color-surface-2)]">ยกเลิก</button>
                    </form>
                  </>
                )}
                {e.status === "PAID" && (
                  <ConfirmDialog
                    triggerLabel="คืนเงิน"
                    triggerClassName="rounded-full border border-[color:var(--color-danger)] px-3 py-1 text-xs text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]"
                    title={`คืนเงินค่าเรียน ${e.studentName}?`}
                    detail={`ยกเลิกบิลและคืนเงิน ฿${baht(e.priceSatang)} — ระบบจะกลับรายการขาย คืนแต้ม/คูปอง และคืนที่นั่งในรอบให้อัตโนมัติ (ทำแล้วย้อนไม่ได้)`}
                    confirmLabel="ยืนยันคืนเงิน"
                    danger
                    action={refundEnrollmentAction.bind(null, unitSlug, e.id)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* เช็คชื่อรายวัน */}
      {classes.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">เช็คชื่อรายวัน</h2>
            <form className="flex items-center gap-2">
              <input type="date" name="date" defaultValue={sheetDateStr} className="rounded-lg border px-3 py-1.5 text-sm" />
              <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">ดูวันนี้</button>
            </form>
          </div>
          {sheets.map(({ cl, rows }) => (
            <div key={cl.id} className="card flex flex-col gap-2">
              <div className="text-sm font-medium">
                {cl.course.name} · {cl.name}
              </div>
              {rows.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีผู้สมัครในรอบนี้</p>}
              {rows.map((r) => (
                <div key={r.enrollmentId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    {r.studentName}
                    {r.present === true && <span className="ml-2 text-xs text-green-600">มา</span>}
                    {r.present === false && <span className="ml-2 text-xs text-red-600">ขาด</span>}
                    {r.present === null && <span className="ml-2 text-xs text-[color:var(--color-muted)]">ยังไม่เช็ค</span>}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <form action={checkInAction.bind(null, unitSlug, r.enrollmentId, sheetDateStr, true)}>
                      <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">มา</button>
                    </form>
                    <form action={checkInAction.bind(null, unitSlug, r.enrollmentId, sheetDateStr, false)}>
                      <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">ขาด</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
