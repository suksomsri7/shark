import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import { tenantDetail } from "@/lib/platform/service";
import { suspendTenant, reactivateTenant, listTenantAudit } from "@/lib/platform/support";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatThaiDateLong, formatThaiDateTime } from "@/lib/ui/date";
import { systemDef } from "@/lib/systems";

// ป้ายสถานะร้านเป็นไทย (ไม่โชว์ enum ดิบ)
const STATUS_LABEL: Record<string, string> = {
  PENDING: "รอยืนยัน",
  ACTIVE: "ใช้งานอยู่",
  SUSPENDED: "ถูกระงับ",
  CLOSED: "ปิดร้าน",
  PENDING_DELETE: "รอลบข้อมูล",
};
const PLAN_LABEL: Record<string, string> = { FREE: "ฟรี" };

// ป้ายการกระทำใน audit log
const AUDIT_LABEL: Record<string, string> = {
  "tenant.suspend": "ระงับร้าน",
  "tenant.reactivate": "เปิดใช้ร้านอีกครั้ง",
};

// รายละเอียดร้าน + การกระทำของแพลตฟอร์ม (ระงับ/เปิดใช้ — SUPER_ADMIN) + audit
export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireBackoffice();
  const { id } = await params;
  const t = await tenantDetail(id);
  if (!t) notFound();
  const audit = await listTenantAudit(id);
  const isSuperAdmin = me.role === "SUPER_ADMIN";
  const canReactivate = t.status === "SUSPENDED";

  // ระงับร้าน (SUPER_ADMIN) — reason บันทึกใน audit
  async function suspendAction(formData: FormData) {
    "use server";
    const admin = await requireBackoffice(["SUPER_ADMIN"]);
    const reason = String(formData.get("reason") ?? "").trim();
    await suspendTenant(admin, id, reason || "—");
    revalidatePath(`/backoffice/tenants/${id}`);
  }

  // เปิดใช้ร้านอีกครั้ง (SUPER_ADMIN)
  async function reactivateAction() {
    "use server";
    const admin = await requireBackoffice(["SUPER_ADMIN"]);
    await reactivateTenant(admin, id);
    revalidatePath(`/backoffice/tenants/${id}`);
  }

  const info: { label: string; value: string }[] = [
    { label: "สถานะ", value: STATUS_LABEL[t.status] ?? t.status },
    { label: "แพ็กเกจ", value: PLAN_LABEL[t.plan] ?? t.plan },
    { label: "รหัสร้าน (slug)", value: t.slug },
    { label: "วันสมัคร", value: formatThaiDateLong(t.createdAt) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.name}
        back={{ href: "/backoffice/tenants", label: "ร้านค้าทั้งหมด" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isSuperAdmin &&
              (canReactivate ? (
                <ConfirmDialog
                  triggerLabel="เปิดใช้อีกครั้ง"
                  triggerClassName="btn btn-primary text-sm"
                  title="เปิดใช้ร้านนี้อีกครั้ง?"
                  detail="ร้านจะกลับมาเข้าใช้งานระบบได้ตามปกติ"
                  confirmLabel="ยืนยันเปิดใช้"
                  action={reactivateAction}
                />
              ) : (
                t.status !== "CLOSED" &&
                t.status !== "PENDING_DELETE" && (
                  <ConfirmDialog
                    triggerLabel="ระงับร้าน"
                    title="ระงับการใช้งานร้านนี้?"
                    detail="ผู้ใช้ของร้านจะเข้าใช้งานระบบไม่ได้จนกว่าจะเปิดใช้อีกครั้ง"
                    confirmLabel="ยืนยันระงับร้าน"
                    danger
                    action={suspendAction}
                    reasonField={{ name: "reason", label: "เหตุผล (บันทึกไว้)", required: true }}
                  />
                )
              ))}
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost text-sm">
                ออกจากระบบ
              </button>
            </form>
          </div>
        }
      />

      <Section title="ข้อมูลร้าน" card>
        <dl className="flex flex-col gap-2 text-sm">
          {info.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-[color:var(--color-muted)]">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={`ระบบที่เปิด (${t.systems.length.toLocaleString("th-TH")})`}>
        <DataList
          items={t.systems.map((s) => ({
            key: s.id,
            primary: `${systemDef(s.type)?.icon ?? "•"} ${s.name}`,
            secondary: systemDef(s.type)?.label ?? s.type,
            trailing: (
              <span className="text-xs text-[color:var(--color-muted)]">
                {s.active ? "เปิดใช้งาน" : "ปิดอยู่"}
              </span>
            ),
          }))}
          empty="ร้านนี้ยังไม่ได้เปิดระบบใด"
        />
      </Section>

      <Section title="ประวัติการดำเนินการ">
        <DataList
          items={audit.map((a) => ({
            key: a.id,
            primary: AUDIT_LABEL[a.action] ?? a.action,
            secondary: a.detail ?? undefined,
            trailing: (
              <span className="text-xs text-[color:var(--color-muted)]">
                {formatThaiDateTime(a.createdAt)}
              </span>
            ),
          }))}
          empty="ยังไม่มีการดำเนินการกับร้านนี้"
        />
      </Section>
    </div>
  );
}
