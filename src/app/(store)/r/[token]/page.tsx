import { getPublicTaxContext } from "@/lib/modules/account/service";
import { requestTaxInvoiceAction } from "./actions";
import { formatThaiDateLong as fmtDate } from "@/lib/ui/date";

export const dynamic = "force-dynamic";


const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const labelCls = "flex flex-col gap-1 text-xs text-[color:var(--color-muted)]";
const inputCls = "rounded-lg border px-3 py-2 text-sm text-[color:var(--color-ink)]";

// §5.6 ลิงก์สาธารณะขอใบกำกับภาษี — ลูกค้าเปิดจาก QR/ลิงก์บนใบเสร็จ (ไม่ต้องล็อกอิน)
export default async function PublicTaxInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ err?: string; issued?: string; requested?: string }>;
}) {
  const { token } = await params;
  const { err, issued, requested } = await searchParams;
  const ctx = await getPublicTaxContext(token);

  if (!ctx) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[color:var(--color-surface-2)] p-6 text-center">
        <div className="text-xl font-semibold">ลิงก์ไม่ถูกต้องหรือหมดอายุ</div>
        <div className="text-sm text-[color:var(--color-muted)]">กรุณาติดต่อร้านค้าที่ออกใบเสร็จ</div>
      </main>
    );
  }

  const alreadyNo = issued || ctx.existingTaxInvoiceNo;
  const isPending = !alreadyNo && (requested === "1" || ctx.pendingRequest);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-[color:var(--color-surface-2)] p-6">
      <header className="text-center">
        <div className="text-lg font-bold">{ctx.orgName || "ขอใบกำกับภาษี"}</div>
        <div className="mt-1 text-sm text-[color:var(--color-muted)]">ขอใบกำกับภาษีเต็มรูป</div>
      </header>

      <div className="rounded-xl border bg-[color:var(--color-surface)] p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-[color:var(--color-muted)]">เอกสารอ้างอิง</span>
          <span className="font-medium">{ctx.docNo ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[color:var(--color-muted)]">วันที่</span>
          <span>{fmtDate(ctx.issueDate)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[color:var(--color-muted)]">ยอดรวม</span>
          <span className="font-semibold">฿{baht(ctx.grandTotal)}</span>
        </div>
      </div>

      {!ctx.vatRegistered && (
        <div className="rounded-lg border bg-[color:var(--color-surface-2)] p-3 text-sm text-[color:var(--color-danger)]">
          กิจการนี้ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม จึงออกใบกำกับภาษีไม่ได้
        </div>
      )}

      {alreadyNo ? (
        <div className="rounded-xl border bg-[color:var(--color-surface-2)] p-4 text-center text-sm">
          <div className="text-base font-semibold text-[color:var(--color-ink)]">ออกใบกำกับภาษีเรียบร้อย ✓</div>
          <div className="mt-1 text-[color:var(--color-ink-soft)]">เลขที่ใบกำกับภาษี {alreadyNo}</div>
          <div className="mt-2 text-[color:var(--color-muted)]">ร้านค้าจะจัดส่งใบกำกับภาษีให้ตามข้อมูลที่ให้ไว้</div>
        </div>
      ) : isPending ? (
        <div className="rounded-xl border bg-[color:var(--color-surface-2)] p-4 text-center text-sm">
          <div className="text-base font-semibold text-[color:var(--color-ink)]">รับคำขอแล้ว ✓</div>
          <div className="mt-2 text-[color:var(--color-muted)]">ร้านค้ากำลังตรวจสอบและจะออกใบกำกับภาษีให้ตามข้อมูลที่ให้ไว้</div>
        </div>
      ) : (
        ctx.vatRegistered && (
          <form action={requestTaxInvoiceAction} className="flex flex-col gap-3 rounded-xl border bg-[color:var(--color-surface)] p-4">
            <input type="hidden" name="token" value={token} />
            {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
            <label className={labelCls}>
              ชื่อผู้ซื้อ / ชื่อบริษัท *
              <input name="name" required className={inputCls} />
            </label>
            <label className={labelCls}>
              เลขประจำตัวผู้เสียภาษี (13 หลัก) *
              <input
                name="taxId"
                required
                inputMode="numeric"
                pattern="[0-9]{13}"
                maxLength={13}
                placeholder="0000000000000"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              รหัสสาขา
              <input name="branchCode" defaultValue="00000" className={inputCls} />
            </label>
            <label className={labelCls}>
              ที่อยู่สำหรับออกใบกำกับ
              <textarea name="address" rows={3} className={inputCls} />
            </label>
            <label className={labelCls}>
              เบอร์โทร
              <input name="phone" className={inputCls} />
            </label>
            <label className={labelCls}>
              อีเมล (สำหรับรับใบกำกับ)
              <input name="email" type="email" className={inputCls} />
            </label>
            <button className="mt-1 rounded-lg bg-[color:var(--color-ink)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-surface)]">
              ขอใบกำกับภาษี
            </button>
          </form>
        )
      )}

      <p className="text-center text-[11px] text-[color:var(--color-muted)]">
        ข้อมูลของท่านจะใช้สำหรับออกใบกำกับภาษีเท่านั้น
      </p>
    </main>
  );
}
