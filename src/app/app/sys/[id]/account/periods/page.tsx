import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/core/db";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { closePeriod, reopenPeriod } from "@/lib/modules/account/gl";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import StatusChip from "@/components/ui/StatusChip";

function curKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

export default async function PeriodsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.period.close");
  const base = `/app/sys/${id}/account`;
  const periods = await prisma.accountPeriod.findMany({ where: { systemId: id }, orderBy: { periodKey: "desc" } });
  const current = curKey();

  async function closeAction(formData: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    assertAccountCan(auth, "account.period.close");
    const key = String(formData.get("periodKey") ?? "");
    const r = await closePeriod({ tenantId, systemId: id }, key, auth.user.id);
    await writeAudit({ tenantId, actorId: auth.user.id, action: "account.period.close", targetType: "AccountPeriod", targetId: key, after: { ok: r.ok } });
    revalidatePath(`${base}/periods`);
    if (!r.ok) return; // reason แสดงผ่าน status ปกติ
  }
  async function reopenAction(formData: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    assertAccountCan(auth, "account.period.close");
    const key = String(formData.get("periodKey") ?? "");
    await reopenPeriod({ tenantId, systemId: id }, key, String(formData.get("reason") ?? "เปิดงวดใหม่"), auth.user.id);
    await writeAudit({ tenantId, actorId: auth.user.id, action: "account.period.reopen", targetType: "AccountPeriod", targetId: key });
    revalidatePath(`${base}/periods`);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader
        title="ปิดงวดบัญชี"
        back={{ href: base, label: "ระบบบัญชี" }}
        desc="ปิดงวด = ล็อกไม่ให้ลงบัญชีย้อน · ต้องเคลียร์บัญชีพัก (9999) ก่อน"
      />
      {sp.err && <p className="text-sm text-[color:var(--color-danger)]">{sp.err}</p>}

      <div className="card flex items-end gap-2">
        <ConfirmDialog
          action={closeAction}
          reasonField={{ name: "periodKey", label: "งวดที่จะปิด (YYYY-MM)", required: true }}
          triggerLabel="ปิดงวด"
          triggerClassName="btn btn-primary text-sm"
          title="ปิดงวดบัญชีนี้?"
          detail="เมื่อปิดงวดแล้วจะลงบัญชีย้อนหลังในงวดนั้นไม่ได้ (เปิดใหม่ได้ภายหลัง)"
          confirmLabel="ยืนยันปิดงวด"
          danger
        />
      </div>

      <Section title="งวดที่บันทึกไว้">
        <DataList
          items={periods.map((p) => ({
            key: p.id,
            primary: p.periodKey,
            trailing: (
              <>
                <StatusChip
                  value={p.status}
                  map={{ CLOSED: "ปิดแล้ว", OPEN: "เปิดอยู่" }}
                  toneOf={(v) => (v === "CLOSED" ? "strong" : "muted")}
                />
                {p.status === "CLOSED" && (
                  <ConfirmDialog
                    action={reopenAction}
                    fields={{ periodKey: p.periodKey }}
                    triggerLabel="เปิดงวดใหม่"
                    triggerClassName="text-xs text-[color:var(--color-muted)] hover:underline"
                    title="เปิดงวดนี้ใหม่?"
                    detail="งวดจะถูกปลดล็อกให้ลงบัญชีได้อีกครั้ง"
                    confirmLabel="ยืนยันเปิดงวด"
                    danger
                  />
                )}
              </>
            ),
          }))}
          empty="ยังไม่มีงวดที่เปิด/ปิด — เลือกงวดด้านบนเพื่อปิดงวดแรก"
        />
      </Section>
    </div>
  );
}
