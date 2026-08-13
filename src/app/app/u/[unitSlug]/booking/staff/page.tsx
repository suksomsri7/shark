import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { setStaffReceivingAction, linkStaffToHrAction } from "@/lib/actions/booking";
import { queueRoster } from "@/lib/modules/booking/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubmitButton } from "@/components/ui/SubmitButton";

// ฟังก์ชันย่อย "ใครรับคิว" ของระบบจอง
// มติเจ้าของ 13 ส.ค. 2026: เพิ่ม/ลบพนักงานทำที่ระบบ "พนักงาน HR" ที่เดียว (เดิมกรอกคนเดิม 2 ที่)
// ที่นี่เหลือหน้าที่เดียว = ติ๊กว่าพนักงานคนไหนรับคิวที่สาขานี้
export default async function BookingStaffPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const { rows, hrSystemId, unlinked } = await queueRoster({
    tenantId: auth.active.tenantId,
    unitId: unit.id,
  });
  const receivingCount = rows.filter((r) => r.receiving).length;
  const muted = "text-[color:var(--color-muted)]";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="ใครรับคิว"
        desc="ติ๊กพนักงานที่รับนัดของสาขานี้ — ทะเบียนพนักงานอยู่ที่ระบบ “พนักงาน HR” ที่เดียว ไม่ต้องกรอกซ้ำ"
      />

      {hrSystemId == null ? (
        <p className="text-sm">
          ยังไม่ได้เปิดระบบ <b>พนักงาน HR</b> — เปิดก่อนแล้วเพิ่มพนักงานที่นั่น แล้วกลับมาติ๊กว่าใครรับคิว
          <Link href="/app/settings/systems" className="ml-1 underline">
            เปิดระบบ
          </Link>
        </p>
      ) : (
        <>
          <p className={`text-xs ${muted}`}>
            รับคิวอยู่ {receivingCount} คนจาก {rows.length} คน · เวลาทำการใช้ตาม “เวลาทำการ” ของร้าน ·
            ตารางเข้างาน/วันลารายคนตั้งที่ระบบพนักงาน HR ·{" "}
            <Link href={`/app/sys/${hrSystemId}/hr/employees`} className="underline">
              เพิ่ม/แก้พนักงาน
            </Link>
          </p>

          {/* ช่างที่เพิ่มไว้ก่อนมีการเชื่อม (ร้านเก่า) = ยังไม่อยู่ในทะเบียนพนักงาน → ลงเวลา/เงินเดือนไม่ได้ */}
          {unlinked > 0 && (
            <form
              action={linkStaffToHrAction.bind(null, unitSlug)}
              className="card flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <span className={`text-xs ${muted}`}>
                มีผู้รับคิว {unlinked} คนที่ยังไม่อยู่ในทะเบียนพนักงาน HR — ขึ้นทะเบียนให้เพื่อใช้ลงเวลา/ตารางงาน/เงินเดือน
              </span>
              <button className="btn-sm min-h-[40px]">ขึ้นทะเบียนให้</button>
            </form>
          )}

          {rows.length === 0 ? (
            <p className="text-sm">
              ยังไม่มีพนักงานในทะเบียน —{" "}
              <Link href={`/app/sys/${hrSystemId}/hr/employees`} className="underline">
                เพิ่มพนักงานคนแรก
              </Link>
            </p>
          ) : (
            <section className="flex flex-col gap-2">
              {rows.map((r) => (
                <div
                  key={r.employeeId}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className={`truncate text-xs ${muted}`}>
                      {r.receiving ? "รับคิวอยู่" : "ไม่รับคิว"}
                      {r.position ? ` · ${r.position}` : ""}
                      {r.appointmentCount > 0 ? ` · มีนัด ${r.appointmentCount} ใบ` : ""}
                    </div>
                  </div>
                  <form action={setStaffReceivingAction.bind(null, unitSlug)} className="shrink-0">
                    <input type="hidden" name="employeeId" value={r.employeeId} />
                    <input type="hidden" name="receiving" value={r.receiving ? "0" : "1"} />
                    <SubmitButton variant={r.receiving ? "ghost" : "primary"}>
                      {r.receiving ? "ปิดรับคิว" : "ให้รับคิว"}
                    </SubmitButton>
                  </form>
                </div>
              ))}
              <p className={`text-xs ${muted}`}>
                ปิดรับคิว = คนนี้ไม่มีช่องเวลาให้ลูกค้าจองใหม่ · นัดที่รับไว้แล้วยังอยู่ครบ (ไม่ถูกยกเลิก)
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
