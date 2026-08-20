import { requireTenant } from "@/lib/core/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ExportDataButton } from "@/components/pdpa/ExportDataButton";
import { requestDeleteAction, cancelDeleteAction, deleteMyAccountAction } from "@/lib/pdpa/actions";
import { previewAccountDeletion } from "@/lib/platform/account-deletion";

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

  // ผลกระทบของการลบบัญชี — คำนวณสด เพื่อบอกผู้ใช้ก่อนกด (ห้ามให้เซอร์ไพรส์ทีหลัง)
  const impact = await previewAccountDeletion(auth.user.id);
  const deleteDetail = [
    "อีเมล ชื่อ และการเข้าสู่ระบบทุกช่องทางของคุณจะถูกลบออกจากระบบทันที",
    impact.tenantsHandedOver.length > 0
      ? `ร้าน ${impact.tenantsHandedOver.map((t) => `“${t.name}” จะเปลี่ยนเจ้าของเป็น ${t.newOwner}`).join(" · ")}`
      : "",
    impact.tenantsToDelete.length > 0
      ? `ร้าน ${impact.tenantsToDelete.map((t) => `“${t.name}”`).join(" · ")} ไม่เหลือสมาชิกคนอื่น จะเข้าช่วงพัก ${GRACE_DAYS} วันก่อนถูกลบถาวร`
      : "",
    "ทำแล้วกู้คืนไม่ได้",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="ความเป็นส่วนตัว (PDPA)"
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

      {/* ── ลบบัญชีผู้ใช้ — App Store Review 5.1.1(v) บังคับให้ทำได้จากในแอป ──
          🔴 ทุกบทบาททำได้ ไม่ใช่แค่ OWNER · บอกผลกระทบต่อร้านให้เห็นก่อนกดยืนยัน */}
      <Section title="ลบบัญชีของฉัน" card>
        <p className="text-sm text-[color:var(--color-muted)]">
          ลบตัวตนของคุณออกจาก SHARK ถาวร — อีเมล ชื่อ และการเข้าสู่ระบบทุกช่องทาง ทำแล้วกู้คืนไม่ได้
        </p>

        {impact.tenantsHandedOver.length > 0 && (
          <div className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-3 text-sm">
            <div className="font-medium">ร้านที่จะเปลี่ยนมือให้คนอื่นดูแลต่อ</div>
            <ul className="mt-1 list-disc pl-5 text-[color:var(--color-muted)]">
              {impact.tenantsHandedOver.map((t) => (
                <li key={t.id}>
                  {t.name} → {t.newOwner}
                </li>
              ))}
            </ul>
          </div>
        )}

        {impact.tenantsToDelete.length > 0 && (
          <div className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm">
            <div className="font-semibold text-[color:var(--color-danger)]">
              ร้านที่จะถูกลบไปด้วย (ไม่เหลือสมาชิกคนอื่น)
            </div>
            <ul className="mt-1 list-disc pl-5 text-[color:var(--color-muted)]">
              {impact.tenantsToDelete.map((t) => (
                <li key={t.id}>{t.name}</li>
              ))}
            </ul>
            <p className="mt-1 text-[color:var(--color-muted)]">
              ร้านเหล่านี้จะเข้าช่วงพัก {GRACE_DAYS} วันก่อนถูกลบถาวร
              — ถ้าต้องการเก็บข้อมูลไว้ ให้กด “ดาวน์โหลดข้อมูลของร้าน” ด้านบนก่อน
            </p>
          </div>
        )}

        <ConfirmDialog
          triggerLabel="ลบบัญชีของฉันถาวร"
          triggerClassName="btn btn-ghost text-sm text-[color:var(--color-danger)]"
          danger
          title="ลบบัญชีของคุณถาวร?"
          detail={deleteDetail}
          confirmLabel="ยืนยัน ลบบัญชีของฉัน"
          action={deleteMyAccountAction}
        />
      </Section>
    </div>
  );
}
