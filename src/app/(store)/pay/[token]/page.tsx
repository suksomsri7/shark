import { notFound } from "next/navigation";
import { getPublicPaymentPage } from "@/lib/modules/account";
import { PromptPayQr } from "@/components/PromptPayQr";
import { formatThaiDateLong } from "@/lib/ui/date";

export const dynamic = "force-dynamic";

// WO 5.5 · BLUEPRINT §0.3 ข้อ 5 — หน้าจ่ายเงินสาธารณะ `/pay/<token>`
//
// 🔴 ไม่มีการล็อกอิน — `token` (128 บิต) คือ capability · ไม่รู้จัก = หน้า "ลิงก์ไม่ถูกต้อง" หน้าเดียวกันหมด
//    (ห้ามบอกต่างกันระหว่าง "ไม่มี" กับ "หมดอายุ" ตอน token ผิด — กันไล่เดา)
// 🔴 หน้านี้ **ไม่แสดงข้อมูลลูกค้า** เลย: มีแค่ชื่อกิจการผู้รับเงิน · เลขที่เอกสาร · ยอด · QR · วันหมดอายุ
// มือถือมาก่อน (390) — กล่องเดียวกลางจอ ขยายเป็นกล่องลอยบนจอกว้าง

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default async function PublicPayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await getPublicPaymentPage(token);
  if (!page) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[color:var(--color-surface-2)] p-6 text-center">
        <div className="text-xl font-semibold">ลิงก์ไม่ถูกต้อง</div>
        <div className="text-sm text-[color:var(--color-muted)]">
          ลิงก์ชำระเงินนี้ใช้ไม่ได้แล้ว — ติดต่อร้านค้าเพื่อขอลิงก์ใหม่
        </div>
      </main>
    );
  }
  if (!page.docNo) notFound();

  const paid = page.status === "PAID";
  const closed = page.status === "EXPIRED" || page.status === "CANCELLED";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-[color:var(--color-surface-2)] p-5">
      <header className="text-center">
        <div className="text-sm text-[color:var(--color-muted)]">ชำระเงินให้</div>
        <h1 className="text-lg font-semibold" data-testid="pay-org">
          {page.orgName}
        </h1>
      </header>

      <section className="flex flex-col items-center gap-4 rounded-2xl bg-[color:var(--color-surface)] p-5 shadow-[0_8px_24px_rgba(10,10,10,.06)]">
        <div className="text-center">
          <div className="text-xs text-[color:var(--color-muted)]" data-testid="pay-docno">
            {page.docLabel} {page.docNo}
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums" data-testid="pay-amount">
            ฿{baht(page.amountSatang)}
          </div>
        </div>

        {paid ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center" data-testid="pay-paid">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
              style={{ background: "var(--color-surface-2)" }}
              aria-hidden
            >
              ✓
            </div>
            <div className="text-lg font-semibold">จ่ายแล้ว</div>
            <div className="text-sm text-[color:var(--color-muted)]">
              ได้รับเงินเรียบร้อยแล้ว
              {page.paidAt ? ` เมื่อ ${formatThaiDateLong(page.paidAt)}` : ""} — ขอบคุณค่ะ
            </div>
          </div>
        ) : closed ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" data-testid="pay-closed">
            <div className="text-lg font-semibold">{page.status === "EXPIRED" ? "ลิงก์หมดอายุแล้ว" : "ลิงก์ถูกยกเลิก"}</div>
            <div className="text-sm text-[color:var(--color-muted)]">ติดต่อร้านค้าเพื่อขอลิงก์ใหม่</div>
          </div>
        ) : page.qrPayload ? (
          <>
            <div data-testid="pay-qr">
              <PromptPayQr payload={page.qrPayload} size={220} caption="สแกนด้วยแอปธนาคาร" />
            </div>
            <ol className="w-full list-decimal space-y-1 pl-5 text-sm text-[color:var(--color-muted)]">
              <li>บันทึกภาพ QR หรือเปิดหน้านี้บนมือถือ</li>
              <li>เปิดแอปธนาคาร → สแกน/เลือกรูปจากคลัง</li>
              <li>ยอดเงินถูกล็อกไว้แล้ว กดยืนยันได้เลย</li>
            </ol>
          </>
        ) : page.providerUrl ? (
          <a href={page.providerUrl} className="btn btn-primary w-full text-center" data-testid="pay-provider">
            ไปหน้าชำระเงิน
          </a>
        ) : (
          <p className="py-6 text-sm text-[color:var(--color-muted)]">ยังไม่มีช่องทางชำระเงินสำหรับลิงก์นี้</p>
        )}
      </section>

      {!paid && !closed && (
        <p className="text-center text-xs text-[color:var(--color-muted)]" data-testid="pay-expires">
          ลิงก์นี้ใช้ได้ถึง {formatThaiDateLong(page.expiresAt)}
        </p>
      )}
      <p className="text-center text-xs text-[color:var(--color-muted)]">
        หากจ่ายแล้วสถานะยังไม่เปลี่ยน กรุณารอสักครู่แล้วรีเฟรชหน้านี้
      </p>
    </main>
  );
}
