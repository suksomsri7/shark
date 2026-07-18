import { requireTenant } from "@/lib/core/context";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { FormField } from "@/components/ui/FormField";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatBaht } from "@/lib/ui/money";
import { formatThaiDate } from "@/lib/ui/date";
import { listPlans, listSubscriptions, type Ctx } from "./subscription";
import { listCustomers } from "./service";
import {
  cancelSubscriptionAction,
  createPlanAction,
  setPlanActiveAction,
  subscribeAction,
} from "./subscription-actions";

const muted = "text-[color:var(--color-muted)]";

// ป้ายสถานะ subscription (ไทย)
const SUB_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ใช้งานอยู่",
  EXPIRED: "หมดอายุ",
  CANCELLED: "ยกเลิกแล้ว",
};

// รอบวันเป็นข้อความสั้น ๆ
const periodLabel = (days: number) =>
  days === 30 ? "รายเดือน" : days === 365 ? "รายปี" : `ทุก ${days.toLocaleString("th-TH")} วัน`;

// ───────────── แพ็กเกจสมาชิก (ฝังใน MemberContent) ─────────────
export async function SubscriptionSection({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };

  const [plans, subs, customers] = await Promise.all([
    listPlans(ctx, false),
    listSubscriptions(ctx),
    // ลูกค้าในระบบ MEMBER นี้ (สำหรับ dropdown สมัคร) — ผ่าน service กลาง (F5 ratchet: โมดูลห้ามใช้ prisma ตรง)
    listCustomers(auth.active.tenantId).then((cs) =>
      cs.filter((c) => c.memberSystemId === systemId).slice(0, 200),
    ),
  ]);

  const activePlans = plans.filter((p) => p.active);
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const custName = new Map(customers.map((c) => [c.id, c.name ?? c.memberCode]));

  return (
    <Section title={`แพ็กเกจสมาชิก (${plans.length})`}>
      {/* รายการแพ็กเกจ + เปิด/ปิดการขาย */}
      <DataList
        items={plans.map((p) => ({
          key: p.id,
          primary: `${p.name} · ${formatBaht(p.priceSatang)}`,
          secondary: periodLabel(p.periodDays),
          trailing: (
            <>
              <StatusChip
                value={p.active ? "ON" : "OFF"}
                map={{ ON: "เปิดขาย", OFF: "ปิดขาย" }}
                tone={p.active ? "strong" : "muted"}
              />
              <form action={setPlanActiveAction}>
                <input type="hidden" name="systemId" value={systemId} />
                <input type="hidden" name="planId" value={p.id} />
                <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                <button className="text-xs underline">{p.active ? "ปิดขาย" : "เปิดขาย"}</button>
              </form>
            </>
          ),
        }))}
        empty="ยังไม่มีแพ็กเกจ — สร้างแพ็กเกจแรกด้านล่างเพื่อเริ่มขายสมาชิกรายเดือน/รายปี"
      />

      {/* สร้างแพ็กเกจใหม่ */}
      <form action={createPlanAction} className="mt-2 flex flex-col gap-3 rounded-lg border border-dashed p-4">
        <input type="hidden" name="systemId" value={systemId} />
        <h3 className="text-sm font-medium">เพิ่มแพ็กเกจใหม่</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <FormField label="ชื่อแพ็กเกจ" required>
            <input name="name" required placeholder="เช่น สมาชิกรายเดือน" className="input" />
          </FormField>
          <FormField label="ราคา (บาท)" required>
            <input name="price" type="number" min={0} step="0.01" required placeholder="0" className="input" />
          </FormField>
          <FormField label="รอบการต่ออายุ" required>
            <select name="period" required className="input" defaultValue="30">
              <option value="30">รายเดือน (30 วัน)</option>
              <option value="365">รายปี (365 วัน)</option>
              <option value="custom">กำหนดเอง</option>
            </select>
          </FormField>
          <FormField label="จำนวนวัน (ถ้ากำหนดเอง)" hint="ใช้เมื่อเลือก “กำหนดเอง”">
            <input name="customDays" type="number" min={1} step={1} placeholder="เช่น 90" className="input" />
          </FormField>
        </div>
        <SubmitButton variant="ghost">+ เพิ่มแพ็กเกจ</SubmitButton>
      </form>

      {/* สมัครแพ็กเกจให้ลูกค้า */}
      {activePlans.length > 0 && customers.length > 0 && (
        <form action={subscribeAction} className="mt-2 flex flex-col gap-3 rounded-lg border p-4">
          <input type="hidden" name="systemId" value={systemId} />
          <h3 className="text-sm font-medium">สมัครแพ็กเกจให้ลูกค้า</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <FormField label="ลูกค้า" required>
              <select name="customerId" required className="input" defaultValue="">
                <option value="" disabled>
                  เลือกลูกค้า
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.name ?? "ไม่ระบุชื่อ") + " · " + c.memberCode}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="แพ็กเกจ" required>
              <select name="planId" required className="input" defaultValue="">
                <option value="" disabled>
                  เลือกแพ็กเกจ
                </option>
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatBaht(p.priceSatang)} · {periodLabel(p.periodDays)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="วันเริ่ม" hint="ว่างไว้ = เริ่มวันนี้">
              <input name="startAt" type="date" className="input" />
            </FormField>
            <FormField label="วิธีชำระเงิน" hint="เก็บค่าสมาชิกเข้าบัญชีอัตโนมัติ">
              <select name="payMethod" className="input" defaultValue="CASH">
                <option value="CASH">เงินสด</option>
                <option value="PROMPTPAY">พร้อมเพย์</option>
              </select>
            </FormField>
          </div>
          <SubmitButton>สมัครสมาชิก</SubmitButton>
        </form>
      )}

      {/* รายการสมัครล่าสุด */}
      <div className="mt-4">
        <h3 className={`mb-2 text-sm font-medium ${muted}`}>รายการสมัครล่าสุด</h3>
        <DataList
          items={subs.map((s) => ({
            key: s.id,
            primary: `${custName.get(s.customerId) ?? "ลูกค้า"} · ${planName.get(s.planId) ?? "แพ็กเกจ"}`,
            secondary: `หมดอายุ ${formatThaiDate(s.endAt)}`,
            trailing: (
              <>
                <StatusChip
                  value={s.status}
                  map={SUB_STATUS_LABEL}
                  tone={s.status === "ACTIVE" ? "strong" : s.status === "CANCELLED" ? "danger" : "muted"}
                />
                {s.status === "ACTIVE" && (
                  <ConfirmDialog
                    triggerLabel="ยกเลิก"
                    triggerClassName="text-xs text-[color:var(--color-danger)] underline"
                    title="ยกเลิกแพ็กเกจนี้?"
                    detail="สมาชิกจะสิ้นสุดสิทธิ์ทันที (ไม่คืนตามรอบที่เหลือ)"
                    confirmLabel="ยืนยันยกเลิก"
                    danger
                    action={cancelSubscriptionAction}
                    fields={{ systemId, subId: s.id }}
                  />
                )}
              </>
            ),
          }))}
          empty="ยังไม่มีการสมัคร — เลือกลูกค้าและแพ็กเกจด้านบนเพื่อเริ่มสมัครสมาชิก"
        />
      </div>
    </Section>
  );
}

export default SubscriptionSection;
