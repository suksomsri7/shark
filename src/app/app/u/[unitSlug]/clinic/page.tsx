import { requireUnit } from "@/lib/core/context";
import { searchPatients, listVisits } from "@/lib/modules/clinic/service";
import { listItems } from "@/lib/modules/inventory/service";
import { listSystems } from "@/lib/modules/system/service";
import {
  createPatientAction,
  createVisitAction,
  dispenseAction,
  billVisitAction,
  refundVisitAction,
} from "@/lib/modules/clinic/actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

type DispenseRecord = { invItemId: string; name: string; qty: number };

// จัดการคลินิก — /app/u/[unitSlug]/clinic (ค้น/เพิ่มผู้ป่วย · เปิด visit · จ่ายยา · เก็บเงิน)
// PDPA: แสดงเท่าที่จำเป็น (ชื่อ/เบอร์/ปีเกิด/แพ้ยา) · แพ้ยาแสดงเด่นชัด
export default async function ClinicManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ q?: string; err?: string }>;
}) {
  const { unitSlug } = await params;
  const { q, err } = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const tenantId = auth.active.tenantId;
  const ctx = { tenantId, unitId: unit.id };

  const [patients, openVisitsAll, invSystems] = await Promise.all([
    searchPatients(ctx, q),
    listVisits(ctx),
    listSystems(tenantId, "INVENTORY"),
  ]);
  const openVisits = openVisitsAll.filter((v) => v.status === "OPEN");
  const billedVisits = openVisitsAll.filter((v) => v.status === "BILLED");

  // รายการยาในคลัง (ถ้ามีระบบคลัง) สำหรับดรอปดาวน์จ่ายยา
  const invSys = invSystems[0];
  const stock = invSys ? await listItems({ tenantId, systemId: invSys.id }, 500) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <div className="text-sm text-[color:var(--color-muted)]">🏥 คลินิก</div>
        <h1 className="text-2xl font-semibold">{unit.name}</h1>
      </div>

      {err && (
        <div className="rounded-lg border border-[color:var(--color-danger)] bg-rose-50 px-3 py-2 text-sm text-[color:var(--color-danger)]">
          {err}
        </div>
      )}

      {/* ค้นหาผู้ป่วย */}
      <form className="flex items-center gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          maxLength={60}
          placeholder="ค้นผู้ป่วยด้วยชื่อหรือเบอร์"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button className="rounded-full border px-4 py-2 text-sm hover:bg-[color:var(--color-surface-2)]">
          ค้นหา
        </button>
      </form>

      {/* เพิ่มผู้ป่วย */}
      <form action={createPatientAction.bind(null, unitSlug)} className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">เพิ่มผู้ป่วย</h2>
        <div className="flex flex-wrap gap-2">
          <input name="name" required maxLength={120} placeholder="ชื่อ-นามสกุล" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
          <input name="phone" required maxLength={30} placeholder="เบอร์โทร" className="w-40 rounded-lg border px-3 py-2 text-sm" />
          <input name="birthYear" type="number" min={1900} max={2200} placeholder="ปีเกิด (พ.ศ./ค.ศ.)" className="w-40 rounded-lg border px-3 py-2 text-sm" />
        </div>
        <input name="allergies" maxLength={300} placeholder="ประวัติแพ้ยา/อาหาร (ถ้ามี)" className="rounded-lg border px-3 py-2 text-sm" />
        <input name="note" maxLength={500} placeholder="หมายเหตุ (ถ้ามี)" className="rounded-lg border px-3 py-2 text-sm" />
        <button className="btn btn-primary text-sm">บันทึกผู้ป่วย</button>
      </form>

      {/* รายชื่อผู้ป่วย + เปิด visit */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">ผู้ป่วย ({patients.length})</h2>
        {patients.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ไม่พบผู้ป่วย</p>
        )}
        {patients.map((p) => (
          <div key={p.id} className="card flex flex-col gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{p.name}</div>
              <div className="text-sm text-[color:var(--color-muted)]">
                {p.phone}
                {p.birthYear ? ` · ปีเกิด ${p.birthYear}` : ""}
              </div>
              {p.allergies && (
                <div className="mt-1 inline-block rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                  ⚠️ แพ้: {p.allergies}
                </div>
              )}
            </div>

            {/* เปิด visit */}
            <form action={createVisitAction.bind(null, unitSlug)} className="flex flex-wrap items-center gap-2 border-t pt-3">
              <input type="hidden" name="patientId" value={p.id} />
              <input name="symptom" required maxLength={500} placeholder="อาการ / เหตุที่มา" className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm" />
              <input name="feeBaht" type="number" min={0} step="0.01" placeholder="ค่าบริการ (บาท)" className="w-32 rounded-lg border px-3 py-1.5 text-sm" />
              <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">เปิดตรวจ</button>
            </form>
          </div>
        ))}
      </section>

      {/* visit ที่เปิดอยู่ — จ่ายยา + เก็บเงิน */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">กำลังตรวจ ({openVisits.length})</h2>
        {openVisits.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ไม่มีรายการที่กำลังตรวจ</p>
        )}
        {openVisits.map((v) => {
          const dispensed = Array.isArray(v.dispenseJson)
            ? (v.dispenseJson as unknown as DispenseRecord[])
            : [];
          return (
            <div key={v.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{v.patient.name}</div>
                  <div className="text-sm text-[color:var(--color-muted)]">อาการ: {v.symptom}</div>
                  {v.patient.allergies && (
                    <div className="mt-1 inline-block rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      ⚠️ แพ้: {v.patient.allergies}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div className="font-medium">฿{baht(v.feeSatang)}</div>
                </div>
              </div>

              {/* ยาที่จ่ายแล้ว */}
              {dispensed.length > 0 && (
                <div className="flex flex-col gap-0.5 border-t pt-2 text-sm text-[color:var(--color-muted)]">
                  {dispensed.map((d, i) => (
                    <div key={`${d.invItemId}-${i}`}>
                      {d.name} × {d.qty}
                    </div>
                  ))}
                </div>
              )}

              {/* จ่ายยา (เลือกจากคลัง) */}
              {invSys ? (
                stock.length > 0 ? (
                  <form action={dispenseAction.bind(null, unitSlug)} className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <input type="hidden" name="visitId" value={v.id} />
                    <select name="invItemId" required className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm">
                      {stock.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (คงเหลือ {s.onHand})
                        </option>
                      ))}
                    </select>
                    <input name="qty" type="number" min={1} defaultValue={1} className="w-20 rounded-lg border px-3 py-1.5 text-sm" />
                    <button className="rounded-full border px-3 py-1 text-xs hover:bg-[color:var(--color-surface-2)]">จ่ายยา</button>
                  </form>
                ) : (
                  <p className="border-t pt-3 text-xs text-[color:var(--color-muted)]">ยังไม่มีรายการยาในคลัง</p>
                )
              ) : (
                <p className="border-t pt-3 text-xs text-[color:var(--color-muted)]">เปิดระบบคลังสินค้าเพื่อจ่ายยา</p>
              )}

              {/* เก็บเงิน */}
              <form action={billVisitAction.bind(null, unitSlug, v.id)} className="border-t pt-3">
                <button className="btn btn-primary text-sm">เก็บเงิน (฿{baht(v.feeSatang)})</button>
              </form>
            </div>
          );
        })}
      </section>

      {/* เก็บเงินแล้ว — คืนเงิน/void (void PosSale + คืนยาเข้าคลัง) */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">เก็บเงินแล้ว ({billedVisits.length})</h2>
        {billedVisits.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการที่เก็บเงินแล้ว</p>
        )}
        {billedVisits.map((v) => {
          const dispensed = Array.isArray(v.dispenseJson)
            ? (v.dispenseJson as unknown as DispenseRecord[])
            : [];
          return (
            <div key={v.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{v.patient.name}</div>
                  <div className="text-sm text-[color:var(--color-muted)]">อาการ: {v.symptom}</div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div className="font-medium">฿{baht(v.feeSatang)}</div>
                  <div className="text-xs text-green-600">เก็บเงินแล้ว</div>
                </div>
              </div>

              {dispensed.length > 0 && (
                <div className="flex flex-col gap-0.5 border-t pt-2 text-sm text-[color:var(--color-muted)]">
                  {dispensed.map((d, i) => (
                    <div key={`${d.invItemId}-${i}`}>
                      {d.name} × {d.qty}
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-3">
                <ConfirmDialog
                  triggerLabel="คืนเงิน / ยกเลิกบิล"
                  triggerClassName="rounded-full border border-[color:var(--color-danger)] px-3 py-1 text-xs text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]"
                  title={`คืนเงิน ${v.patient.name}?`}
                  detail={`ยกเลิกบิลและคืนเงิน ฿${baht(v.feeSatang)} — ระบบจะกลับรายการขาย คืนแต้ม/คูปอง และคืนยาที่จ่ายกลับเข้าคลังให้อัตโนมัติ (ทำแล้วย้อนไม่ได้)`}
                  confirmLabel="ยืนยันคืนเงิน"
                  danger
                  action={refundVisitAction.bind(null, unitSlug, v.id)}
                />
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
