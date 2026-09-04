import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, accountCan, writeAudit } from "@/lib/modules/account/access";
import {
  listPeriods,
  periodChecklist,
  closePeriodWithChecklist,
  reopenPeriodV2,
  currentPeriodKey,
  isPeriodKey,
} from "@/lib/modules/account/period-close";
import { formatDateTh } from "@/lib/ui/date";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusChip from "@/components/ui/StatusChip";
import { AccountIcon } from "@/components/account-v2/AccountIcon";

// ปิดงวดบัญชี V2 — DESIGN-SPEC-V2 §11.4
// ซ้าย: เช็กลิสต์ก่อนปิดของงวดที่เลือก (4 ข้อ · บังคับ 2 / เตือน 2) · ขวา: ตารางงวด + ปุ่ม ปิด/เปิดใหม่
// ภาษาภาพ: หัวข้อ + ปุ่มขวาบน + การ์ด + DataTable แบบเดียวกับ g16/f8 (ไม่มีเฟรมเฉพาะของหน้านี้)

export default async function PeriodsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string; err?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.period.close");
  const ctx = { tenantId, systemId };
  const base = `/app/sys/${id}/account`;
  const path = `${base}/periods`;
  const canReopen = accountCan(auth, "account.period.reopen");

  const periods = await listPeriods(ctx);
  const cur = currentPeriodKey();
  // งวดที่เลือกดูเช็กลิสต์ = จาก URL · ไม่ระบุ = งวดเปิดล่าสุดที่ไม่ใช่งวดปัจจุบัน (งวดที่ "ถึงคิวปิด")
  const selected =
    (sp.p && isPeriodKey(sp.p) ? sp.p : null) ??
    periods.find((p) => p.status === "OPEN" && p.periodKey !== cur)?.periodKey ??
    periods[0]?.periodKey ??
    cur;
  const checklist = await periodChecklist(ctx, selected);
  const selectedRow = periods.find((p) => p.periodKey === selected);

  async function closeAction(formData: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    assertAccountCan(auth, "account.period.close");
    const key = String(formData.get("periodKey") ?? "");
    const r = await closePeriodWithChecklist({ tenantId, systemId: id }, key, auth.user.id);
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.period.close",
      targetType: "AccountPeriod",
      targetId: key,
      after: { ok: r.ok, ...(r.ok ? { warnings: r.checklist.warnings } : { reason: r.reason }) },
    });
    revalidatePath(path);
    redirect(
      r.ok
        ? `${path}?p=${key}&ok=${encodeURIComponent(`ปิดงวด ${key} แล้ว`)}`
        : `${path}?p=${key}&err=${encodeURIComponent(r.reason)}`,
    );
  }

  async function reopenAction(formData: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    // 🔴 เปิดงวดใหม่ = สิทธิ์คนละตัวกับปิดงวด (ลบล็อกของงวดที่ปิดไปแล้ว — ระดับเจ้าของ)
    assertAccountCan(auth, "account.period.reopen");
    const key = String(formData.get("periodKey") ?? "");
    const r = await reopenPeriodV2(
      { tenantId, systemId: id },
      key,
      String(formData.get("reason") ?? ""),
      auth.user.id,
    );
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.period.reopen",
      targetType: "AccountPeriod",
      targetId: key,
      after: { ok: r.ok },
    });
    revalidatePath(path);
    redirect(
      r.ok
        ? `${path}?p=${key}&ok=${encodeURIComponent(`เปิดงวด ${key} ใหม่แล้ว`)}`
        : `${path}?p=${key}&err=${encodeURIComponent(r.reason)}`,
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">ปิดงวดบัญชี</h1>
          <p className="text-sm text-[color:var(--color-muted)]">
            ปิดงวด = ล็อกไม่ให้ลงบัญชีย้อนหลังในงวดนั้น · เปิดใหม่ได้แต่ต้องมีเหตุผลและถูกบันทึกไว้
          </p>
        </div>
        <Link href={`${base}/reports/trial-balance?from=${selected}&to=${selected}`} className="btn btn-ghost text-sm">
          <AccountIcon name="report" className="h-4 w-4" /> ดูงบทดลองของงวด
        </Link>
      </div>

      {sp.err && <p className="text-sm text-[color:var(--color-danger)]">{sp.err}</p>}
      {sp.ok && <p className="text-sm font-medium">{sp.ok}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ───── เช็กลิสต์ก่อนปิด ───── */}
        <section className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid="period-checklist">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-semibold">เช็กลิสต์ก่อนปิดงวด</h2>
            <span className="text-sm text-[color:var(--color-muted)]">{selected}</span>
          </div>
          <p className="mb-3 text-xs text-[color:var(--color-muted)]">
            ข้อที่มีป้าย “บังคับ” ต้องผ่านก่อนถึงจะปิดงวดได้ · ข้อ “เตือน” ปิดได้แต่ระบบจะบันทึกไว้ว่าข้ามมา
          </p>
          <ul className="flex flex-col gap-2">
            {checklist.items.map((it) => (
              <li
                key={it.key}
                className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-line)" }}
                data-testid={`checklist-${it.key}`}
              >
                <span
                  className={
                    it.state === "PASS"
                      ? "mt-0.5 text-[color:var(--color-ink)]"
                      : it.state === "UNKNOWN"
                        ? "mt-0.5 text-[color:var(--color-muted)]"
                        : it.blocking
                          ? "mt-0.5 text-[color:var(--color-danger)]"
                          : "mt-0.5 text-[color:var(--color-muted)]"
                  }
                >
                  <AccountIcon
                    name={it.state === "PASS" ? "check" : it.state === "UNKNOWN" ? "info" : "warn"}
                    className="h-4 w-4"
                  />
                </span>
                <span className="flex-1">
                  <span className="font-medium">{it.label}</span>
                  <span
                    className="ml-2 rounded-md border px-1.5 py-0.5 text-[11px] text-[color:var(--color-muted)]"
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    {it.blocking ? "บังคับ" : "เตือน"}
                  </span>
                  <span className="block text-xs text-[color:var(--color-muted)]" data-testid={`checklist-${it.key}-detail`}>
                    {it.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {selectedRow?.status === "CLOSED" ? (
              <span className="text-sm text-[color:var(--color-muted)]">งวดนี้ปิดแล้ว</span>
            ) : (
              <ConfirmDialog
                action={closeAction}
                fields={{ periodKey: selected }}
                triggerLabel="ปิดงวดนี้"
                triggerClassName={`btn text-sm ${checklist.canClose ? "btn-primary" : "btn-ghost"}`}
                title={`ปิดงวด ${selected}?`}
                detail={
                  checklist.canClose
                    ? `เมื่อปิดแล้วจะลงบัญชีย้อนหลังในงวดนี้ไม่ได้${checklist.warnings > 0 ? ` · ยังมีข้อเตือนค้าง ${checklist.warnings} ข้อ` : ""}`
                    : "ยังมีข้อบังคับที่ไม่ผ่าน — ระบบจะปฏิเสธ"
                }
                confirmLabel="ยืนยันปิดงวด"
                danger
              />
            )}
            {selected === cur && (
              <span className="text-xs text-[color:var(--color-muted)]">
                ⓘ นี่คืองวดปัจจุบัน — ปกติปิดเมื่อสิ้นเดือนแล้ว
              </span>
            )}
          </div>
        </section>

        {/* ───── ตารางงวด ───── */}
        <section className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-line)" }} data-testid="period-table">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                <th className="px-3 py-3 font-medium">เดือน</th>
                <th className="px-3 py-3 font-medium">สถานะ</th>
                <th className="px-3 py-3 text-right font-medium">ใบสำคัญ</th>
                <th className="px-3 py-3 font-medium">ปิดโดย</th>
                <th className="px-3 py-3 font-medium">เมื่อ</th>
                <th className="px-3 py-3 text-right font-medium">ทำรายการ</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr
                  key={p.periodKey}
                  className={`border-b last:border-0 ${p.periodKey === selected ? "bg-[color:var(--color-surface-2)]" : ""}`}
                  style={{ borderColor: "var(--color-line)" }}
                  data-testid={`period-row-${p.periodKey}`}
                >
                  <td className="px-3 py-2.5">
                    <Link href={`${path}?p=${p.periodKey}`} className="hover:underline">
                      {p.label}
                    </Link>
                    <span className="ml-1 text-xs text-[color:var(--color-muted)]">({p.periodKey})</span>
                    {p.isCurrent && (
                      <span className="ml-1.5 rounded-md border px-1.5 py-0.5 text-[11px] text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                        งวดปัจจุบัน
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusChip
                      value={p.status}
                      map={{ CLOSED: "ปิดแล้ว", OPEN: "เปิดอยู่" }}
                      toneOf={(v) => (v === "CLOSED" ? "strong" : "muted")}
                    />
                    {p.reopenCount > 0 && (
                      <span className="ml-1.5 text-[11px] text-[color:var(--color-muted)]">
                        เปิดใหม่ {p.reopenCount} ครั้ง
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.entryCount.toLocaleString("th-TH")}</td>
                  <td className="px-3 py-2.5">{p.closedByName ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{p.closedAt ? formatDateTh(p.closedAt) : "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {p.status === "CLOSED" ? (
                      canReopen ? (
                        <ConfirmDialog
                          action={reopenAction}
                          fields={{ periodKey: p.periodKey }}
                          reasonField={{ name: "reason", label: "เหตุผลที่ต้องเปิดงวดใหม่", required: true }}
                          triggerLabel="เปิดงวดใหม่"
                          triggerClassName="text-sm text-[color:var(--color-accent)] hover:underline"
                          title={`เปิดงวด ${p.periodKey} ใหม่?`}
                          detail="งวดจะถูกปลดล็อกให้ลงบัญชีได้อีกครั้ง · เหตุผลและผู้ทำจะถูกบันทึกไว้ถาวร"
                          confirmLabel="ยืนยันเปิดงวด"
                          danger
                        />
                      ) : (
                        <span className="text-xs text-[color:var(--color-muted)]">ต้องมีสิทธิ์เปิดงวด</span>
                      )
                    ) : (
                      <Link href={`${path}?p=${p.periodKey}`} className="text-sm text-[color:var(--color-accent)] hover:underline">
                        ตรวจเช็กลิสต์
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <p className="text-xs text-[color:var(--color-muted)]">
        ระบบปิดงวดเดือนก่อนหน้าให้อัตโนมัติทุกต้นเดือน เมื่อผ่านข้อบังคับทั้งหมด (ตั้งค่าที่ นโยบายบัญชี §9.3)
      </p>
    </div>
  );
}
