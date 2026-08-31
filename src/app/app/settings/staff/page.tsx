import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { permissionLabel } from "@/lib/core/permissions";
import { listGrantableEmployees, listStaffAccess, listTenantUnits, ROLE_LABELS } from "@/lib/staff/service";
import { STAFF_ADMIN_ACTION, STAFF_READ_ACTION } from "@/lib/staff/service";
import { revokeStaffAccessAction, restoreStaffAccessAction } from "@/lib/staff/actions";
import { GrantAccessForm } from "./GrantAccessForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatThaiDateTime } from "@/lib/ui/date";

// ผู้ใช้งานและสิทธิ์ (WO-CW2) — หน้าจอแรกของระบบที่จัดการ Membership ได้
// ก่อนหน้านี้ทั้งระบบไม่มีหน้าไหนสร้าง/แก้ Membership เลย ⇒ ร้านมีได้แค่คนที่สมัครเอง (G6)
//
// 🔴 สิทธิ์รายข้อทั้งหมดอ่านจากทะเบียนกลาง `@/lib/core/permissions` ที่เดียว
//    ห้ามพิมพ์ลิสต์ซ้ำในหน้าจอ (บทเรียน AS-6.1/6.3 — ลิสต์พิมพ์มือเพี้ยนจากของจริงเสมอ)

export default async function StaffSettingsPage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const ctx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  const canRead =
    evaluate(ctx, { module: "settings", action: STAFF_READ_ACTION }) ||
    evaluate(ctx, { module: "settings", action: STAFF_ADMIN_ACTION });
  const canWrite = evaluate(ctx, { module: "settings", action: STAFF_ADMIN_ACTION });

  if (!canRead) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeader title="ผู้ใช้งานและสิทธิ์" desc="กำหนดว่าพนักงานคนไหนเข้าใช้อะไรได้บ้าง" />
        <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">
          หน้านี้ต้องได้รับสิทธิ์ “ดูรายชื่อผู้ใช้งานและสิทธิ์” ก่อน — ขอให้เจ้าของร้านเปิดสิทธิ์นี้ให้คุณจากหน้าเดียวกันนี้
        </div>
      </div>
    );
  }

  const [rows, employees, units] = await Promise.all([
    listStaffAccess(tenantId),
    canWrite ? listGrantableEmployees(tenantId) : Promise.resolve([]),
    listTenantUnits(tenantId),
  ]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const activeOwners = rows.filter((r) => r.active && r.role === "OWNER").length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="ผู้ใช้งานและสิทธิ์"
        desc="เลือกพนักงานจากทะเบียนงานบุคคล เปิดให้เขาเข้าใช้งาน แล้วติ๊กสิทธิ์ทีละข้อ — คนใหม่เริ่มจากไม่มีสิทธิ์อะไรเลยเสมอ"
      />

      <Section title={`ผู้ใช้งานในร้าน (${rows.length} คน)`} card>
        {rows.length === 0 ? (
          <EmptyState text="ยังไม่มีผู้ใช้งาน — เพิ่มคนแรกได้จากช่อง “ให้พนักงานเข้าใช้งาน” ด้านล่าง" />
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const isSelf = r.userId === auth.user.id;
              const permCount = Object.values(r.permissions).filter((v) => v === true).length;
              const perms = Object.entries(r.permissions)
                .filter(([, v]) => v === true)
                .slice(0, 3)
                .map(([k]) => permissionLabel(k));
              const units_ = r.unitAccess.includes("*")
                ? "ทุกสาขา"
                : r.unitAccess.length === 0
                  ? "ยังไม่ได้เลือกสาขา"
                  : r.unitAccess.map((id) => unitName.get(id) ?? id).join(" · ");
              return (
                <div
                  key={r.membershipId}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{r.name}</span>
                      <StatusChip
                        value={r.active ? "on" : "off"}
                        map={{ on: ROLE_LABELS[r.role], off: "ถูกถอนสิทธิ์" }}
                        tone={r.active ? "strong" : "muted"}
                      />
                      {isSelf && <span className="text-xs text-[color:var(--color-muted)]">(คุณ)</span>}
                    </div>
                    <div className="truncate text-xs text-[color:var(--color-muted)]">
                      {r.email}
                      {" · "}
                      {units_}
                      {r.role === "STAFF" &&
                        ` · ${permCount === 0 ? "ยังไม่มีสิทธิ์ใช้งานข้อไหนเลย" : `${permCount} สิทธิ์: ${perms.join(", ")}${permCount > 3 ? " …" : ""}`}`}
                    </div>
                    <div className="truncate text-xs text-[color:var(--color-muted)]">
                      {r.employee ? `พนักงาน: ${r.employee.name}${r.employee.position ? ` (${r.employee.position})` : ""}` : "ยังไม่ได้ผูกกับทะเบียนพนักงาน"}
                      {" · เข้าร่วม "}
                      {formatThaiDateTime(r.joinedAt)}
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link href={`/app/settings/staff/${r.membershipId}`} className="btn btn-ghost text-sm">
                        แก้สิทธิ์
                      </Link>
                      {r.active && r.role === "OWNER" && activeOwners <= 1 ? (
                        /* 🔴 เจ้าของคนสุดท้าย: ด่านฝั่ง service ปฏิเสธเสมอ (กติกา 4)
                           ⇒ ยื่นปุ่ม "ยืนยันถอนสิทธิ์" ที่ล้มแน่นอน = หลอกให้กดแล้วเจอ error
                           บอกตั้งแต่แรกว่าต้องทำอะไรก่อน ดีกว่าให้กดแล้วค่อยปฏิเสธ */
                        <span className="text-xs text-[color:var(--color-muted)]">
                          เจ้าของกิจการคนสุดท้าย — ตั้งอีกคนเป็นเจ้าของก่อนจึงจะถอนได้
                        </span>
                      ) : r.active ? (
                        <ConfirmDialog
                          triggerLabel="ถอนสิทธิ์"
                          triggerClassName="btn-sm"
                          title={`ถอนสิทธิ์ของ ${r.name}?`}
                          detail="เขาจะเข้าระบบของร้านนี้ไม่ได้อีกทันที แต่ประวัติการทำงานและชื่อที่แสดงในแชท/ประวัติการแก้ไขยังอยู่ครบ เปิดคืนได้ทุกเมื่อ"
                          confirmLabel="ยืนยันถอนสิทธิ์"
                          danger
                          action={revokeStaffAccessAction}
                          fields={{ membershipId: r.membershipId }}
                        />
                      ) : (
                        <ConfirmDialog
                          triggerLabel="เปิดสิทธิ์คืน"
                          triggerClassName="btn-sm"
                          title={`เปิดสิทธิ์คืนให้ ${r.name}?`}
                          detail="บทบาทและสิทธิ์เดิมที่เคยตั้งไว้จะกลับมาเหมือนเดิมทั้งหมด"
                          confirmLabel="ยืนยันเปิดคืน"
                          action={restoreStaffAccessAction}
                          fields={{ membershipId: r.membershipId }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {canWrite && (
        <Section title="ให้พนักงานเข้าใช้งาน" card>
          <GrantAccessForm employees={employees} />
        </Section>
      )}
    </div>
  );
}
