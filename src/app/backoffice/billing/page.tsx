import { revalidatePath } from "next/cache";
import type { PlatformInvoiceStatus } from "@prisma/client";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import { createInvoice, markInvoicePaid, voidInvoice, listInvoices } from "@/lib/platform/billing";
import { listTenantsOverview } from "@/lib/platform/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { EmptyState } from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatThaiDate, formatThaiDateTime } from "@/lib/ui/date";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "รอชำระ",
  PAID: "ชำระแล้ว",
  VOID: "ยกเลิกแล้ว",
};
const toneOf = (v: string): "muted" | "strong" => (v === "VOID" ? "muted" : "strong");

const FILTERS: { value: PlatformInvoiceStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "ทั้งหมด" },
  { value: "PENDING", label: "รอชำระ" },
  { value: "PAID", label: "ชำระแล้ว" },
  { value: "VOID", label: "ยกเลิก" },
];
const VALID = new Set<PlatformInvoiceStatus>(["PENDING", "PAID", "VOID"]);

// จัดการบิลแพลตฟอร์มทุกร้าน — สร้าง/รับชำระ/ยกเลิก (SUPER_ADMIN / FINANCE)
export default async function BackofficeBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireBackoffice(["SUPER_ADMIN", "FINANCE"]);
  const sp = await searchParams;
  const status = VALID.has(sp.status as PlatformInvoiceStatus)
    ? (sp.status as PlatformInvoiceStatus)
    : undefined;
  const [invoices, tenants] = await Promise.all([
    listInvoices(status ? { status } : undefined),
    listTenantsOverview(),
  ]);
  const active = status ?? "ALL";

  // สร้างบิลใหม่ (แปลงบาท → สตางค์)
  async function createAction(formData: FormData) {
    "use server";
    const pu = await requireBackoffice(["SUPER_ADMIN", "FINANCE"]);
    const tenantId = String(formData.get("tenantId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const baht = Number(String(formData.get("amountBaht") ?? "").trim());
    const note = String(formData.get("note") ?? "").trim();
    const dueRaw = String(formData.get("dueAt") ?? "").trim();
    if (!tenantId || !title || !Number.isFinite(baht) || baht <= 0) return;
    await createInvoice(pu, {
      tenantId,
      title,
      amountSatang: Math.round(baht * 100),
      note: note || null,
      dueAt: dueRaw ? new Date(dueRaw) : null,
    });
    revalidatePath("/backoffice/billing");
  }

  // รับชำระ
  async function payAction(formData: FormData) {
    "use server";
    const pu = await requireBackoffice(["SUPER_ADMIN", "FINANCE"]);
    await markInvoicePaid(pu, String(formData.get("id") ?? ""));
    revalidatePath("/backoffice/billing");
  }

  // ยกเลิกบิล
  async function voidAction(formData: FormData) {
    "use server";
    const pu = await requireBackoffice(["SUPER_ADMIN", "FINANCE"]);
    await voidInvoice(pu, String(formData.get("id") ?? ""));
    revalidatePath("/backoffice/billing");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="บิลเรียกเก็บร้านค้า"
        back={{ href: "/backoffice", label: "ภาพรวมแพลตฟอร์ม" }}
        desc={`ทั้งหมด ${invoices.length.toLocaleString("th-TH")} บิล`}
        actions={
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost text-sm">
              ออกจากระบบ
            </button>
          </form>
        }
      />

      <Section title="สร้างบิลใหม่" card>
        <form action={createAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ร้านค้า *
            <select
              name="tenantId"
              required
              defaultValue=""
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
            >
              <option value="" disabled>
                เลือกร้าน…
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            รายการ *
            <input
              name="title"
              required
              placeholder="เช่น ค่าบริการ custom domain ปี 2026"
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              จำนวนเงิน (บาท) *
              <input
                name="amountBaht"
                required
                inputMode="decimal"
                placeholder="1500"
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              ครบกำหนด (ไม่บังคับ)
              <input
                name="dueAt"
                type="date"
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            หมายเหตุ (ไม่บังคับ)
            <input
              name="note"
              className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
            />
          </label>
          <button type="submit" className="btn btn-primary text-sm">
            สร้างบิล
          </button>
        </form>
      </Section>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = active === f.value;
          const href = f.value === "ALL" ? "/backoffice/billing" : `/backoffice/billing?status=${f.value}`;
          return (
            <a
              key={f.value}
              href={href}
              className="rounded-full border px-3 py-1 text-sm"
              style={
                isActive
                  ? { borderColor: "var(--color-ink)", color: "var(--color-ink)", fontWeight: 600 }
                  : { color: "var(--color-muted)" }
              }
            >
              {f.label}
            </a>
          );
        })}
      </div>

      <Section title="รายการบิล">
        {invoices.length === 0 ? (
          <EmptyState text="ยังไม่มีบิลในตัวกรองนี้" />
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate">{inv.title}</div>
                  <div className="truncate text-xs text-[color:var(--color-muted)]">
                    {inv.tenantName} ·{" "}
                    {inv.status === "PAID" && inv.paidAt
                      ? `ชำระเมื่อ ${formatThaiDateTime(inv.paidAt)}`
                      : inv.dueAt
                        ? `ครบกำหนด ${formatThaiDate(inv.dueAt)}`
                        : `ออกบิล ${formatThaiDate(inv.createdAt)}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <MoneyText satang={inv.amountSatang} />
                  <StatusChip value={inv.status} map={STATUS_LABEL} toneOf={toneOf} />
                  {inv.status === "PENDING" && (
                    <>
                      <ConfirmDialog
                        triggerLabel="รับชำระ"
                        triggerClassName="btn-sm"
                        title="ยืนยันรับชำระบิลนี้?"
                        detail={`${inv.tenantName} · ${inv.title}`}
                        confirmLabel="ยืนยันรับชำระ"
                        action={payAction}
                        fields={{ id: inv.id }}
                      />
                      <ConfirmDialog
                        triggerLabel="ยกเลิก"
                        triggerClassName="btn-sm"
                        title="ยกเลิกบิลนี้?"
                        detail="บิลจะถูกทำเป็นโมฆะ ยกเลิกแล้วแก้กลับไม่ได้"
                        confirmLabel="ยืนยันยกเลิก"
                        danger
                        action={voidAction}
                        fields={{ id: inv.id }}
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
