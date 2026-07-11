import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/core/db";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { closePeriod, reopenPeriod } from "@/lib/modules/account/gl";

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
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">ปิดงวดบัญชี</h1>
        <p className="text-sm text-[color:var(--color-muted)]">ปิดงวด = ล็อกไม่ให้ลงบัญชีย้อน · ต้องเคลียร์บัญชีพัก (9999) ก่อน</p>
      </div>
      {sp.err && <div className="rounded-lg border-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{sp.err}</div>}

      <form action={closeAction} className="card flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs">งวด (YYYY-MM)</label>
          <input name="periodKey" defaultValue={current} className="rounded-lg border px-2 py-1.5 text-sm" />
        </div>
        <button className="btn btn-primary text-sm">ปิดงวด</button>
      </form>

      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">งวดที่บันทึกไว้</h2>
        {periods.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีงวดที่เปิด/ปิด</p>}
        {periods.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span>{p.periodKey} · <span className={p.status === "CLOSED" ? "text-[color:var(--color-danger)]" : ""}>{p.status === "CLOSED" ? "ปิดแล้ว 🔒" : "เปิดอยู่"}</span></span>
            {p.status === "CLOSED" && (
              <form action={reopenAction}>
                <input type="hidden" name="periodKey" value={p.periodKey} />
                <button className="text-xs text-[color:var(--color-muted)] hover:underline">เปิดงวดใหม่</button>
              </form>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
