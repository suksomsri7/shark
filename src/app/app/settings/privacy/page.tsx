import { requireTenant } from "@/lib/core/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ExportDataButton } from "@/components/pdpa/ExportDataButton";
import { requestDeleteAction, cancelDeleteAction } from "@/lib/pdpa/actions";

const GRACE_DAYS = 30;

const fmtThaiDate = (d: Date): string =>
  d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

// ความเป็นส่วนตัว (PDPA) — ดาวน์โหลดข้อมูลร้าน + ขอลบร้าน (รอ 30 วัน)
export default async function PrivacyPage() {
  const auth = await requireTenant();
  const tenant = auth.active.tenant;
  const isOwner = auth.active.role === "OWNER";
  const isPendingDelete = tenant.status === "PENDING_DELETE" && tenant.deleteRequestedAt !== null;
  const purgeAt = tenant.deleteRequestedAt
    ? new Date(tenant.deleteRequestedAt.getTime() + GRACE_DAYS * 86_400_000)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="ความเป็นส่วนตัว (PDPA)"
        back={{ href: "/app", label: "หน้าหลัก" }}
        desc="ดาวน์โหลดข้อมูลทั้งหมดของร้าน หรือขอลบร้านถาวรตามสิทธิ์ PDPA"
      />

      {!isOwner && (
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-4 text-sm text-[color:var(--color-muted)]">
          เฉพาะเจ้าของร้าน (OWNER) เท่านั้นที่ดาวน์โหลดข้อมูลหรือขอลบร้านได้
        </div>
      )}

      <Section title="ดาวน์โหลดข้อมูลของร้าน" card>
        <p className="text-sm text-[color:var(--color-muted)]">
          รวมข้อมูลทุกระบบของร้านนี้เป็นไฟล์ JSON ไฟล์เดียว (ลูกค้า สมาชิก ธุรกรรม ตั้งค่า ฯลฯ)
        </p>
        {isOwner ? (
          <ExportDataButton />
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">ไม่มีสิทธิ์</p>
        )}
      </Section>

      <Section title="ลบร้านถาวร" card>
        <p className="text-sm text-[color:var(--color-muted)]">
          ลบร้านนี้และข้อมูลทั้งหมดออกจากระบบ — ทำแล้วกู้คืนไม่ได้
        </p>
        {isPendingDelete ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[color:var(--color-danger)] bg-[color:var(--color-danger)]/5 p-4 text-sm">
              <div className="font-semibold text-[color:var(--color-danger)]">
                ร้านนี้อยู่ระหว่างรอลบถาวร
              </div>
              <p className="mt-1 text-[color:var(--color-muted)]">
                {purgeAt
                  ? `ข้อมูลทั้งหมดจะถูกลบถาวรในวันที่ ${fmtThaiDate(purgeAt)} — ยกเลิกได้จนถึงก่อนวันดังกล่าว`
                  : "ข้อมูลทั้งหมดจะถูกลบถาวรหลังครบ 30 วัน"}
              </p>
            </div>
            {isOwner && (
              <form action={cancelDeleteAction}>
                <button type="submit" className="btn btn-primary w-full text-sm sm:w-auto">
                  ยกเลิกคำขอลบร้าน
                </button>
              </form>
            )}
          </div>
        ) : isOwner ? (
          <ConfirmDialog
            triggerLabel="ขอลบร้านถาวร"
            triggerClassName="btn btn-ghost text-sm"
            danger
            title="ขอลบร้านนี้ถาวร?"
            detail={`ร้านจะเข้าสู่ช่วงรอ ${GRACE_DAYS} วัน หลังจากนั้นข้อมูลทั้งหมด (ลูกค้า สมาชิก ธุรกรรม ตั้งค่า) จะถูกลบถาวรและกู้คืนไม่ได้ · ระหว่างนี้ยกเลิกได้ตลอด`}
            confirmLabel="ยืนยัน ขอลบร้าน"
            action={requestDeleteAction}
          />
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">ไม่มีสิทธิ์</p>
        )}
      </Section>
    </div>
  );
}
