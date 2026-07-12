import { getPublicTaxContext } from "@/lib/modules/account/service";
import { requestTaxInvoiceAction } from "./actions";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const labelCls = "flex flex-col gap-1 text-xs text-neutral-500";
const inputCls = "rounded-lg border px-3 py-2 text-sm text-black";

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
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-neutral-50 p-6 text-center">
        <div className="text-xl font-semibold">ลิงก์ไม่ถูกต้องหรือหมดอายุ</div>
        <div className="text-sm text-neutral-500">กรุณาติดต่อร้านค้าที่ออกใบเสร็จ</div>
      </main>
    );
  }

  const alreadyNo = issued || ctx.existingTaxInvoiceNo;
  const isPending = !alreadyNo && (requested === "1" || ctx.pendingRequest);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-neutral-50 p-6">
      <header className="text-center">
        <div className="text-lg font-bold">{ctx.orgName || "ขอใบกำกับภาษี"}</div>
        <div className="mt-1 text-sm text-neutral-500">ขอใบกำกับภาษีเต็มรูป</div>
      </header>

      <div className="rounded-xl border bg-white p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">เอกสารอ้างอิง</span>
          <span className="font-medium">{ctx.docNo ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">วันที่</span>
          <span>{fmtDate(ctx.issueDate)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">ยอดรวม</span>
          <span className="font-semibold">฿{baht(ctx.grandTotal)}</span>
        </div>
      </div>

      {!ctx.vatRegistered && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          กิจการนี้ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม จึงออกใบกำกับภาษีไม่ได้
        </div>
      )}

      {alreadyNo ? (
        <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-center text-sm">
          <div className="text-base font-semibold text-green-800">ออกใบกำกับภาษีเรียบร้อย ✓</div>
          <div className="mt-1 text-green-700">เลขที่ใบกำกับภาษี {alreadyNo}</div>
          <div className="mt-2 text-neutral-500">ร้านค้าจะจัดส่งใบกำกับภาษีให้ตามข้อมูลที่ให้ไว้</div>
        </div>
      ) : isPending ? (
        <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-center text-sm">
          <div className="text-base font-semibold text-blue-800">รับคำขอแล้ว ✓</div>
          <div className="mt-2 text-neutral-600">ร้านค้ากำลังตรวจสอบและจะออกใบกำกับภาษีให้ตามข้อมูลที่ให้ไว้</div>
        </div>
      ) : (
        ctx.vatRegistered && (
          <form action={requestTaxInvoiceAction} className="flex flex-col gap-3 rounded-xl border bg-white p-4">
            <input type="hidden" name="token" value={token} />
            {err && <p className="text-sm text-red-600">{err}</p>}
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
            <button className="mt-1 rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white">
              ขอใบกำกับภาษี
            </button>
          </form>
        )
      )}

      <p className="text-center text-[11px] text-neutral-400">
        ข้อมูลของท่านจะใช้สำหรับออกใบกำกับภาษีเท่านั้น
      </p>
    </main>
  );
}
