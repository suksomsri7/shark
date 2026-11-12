// SVC H.4 ▸ ขั้น "เงินประกันห้อง" ของการ์ดเช็กอิน (มติ 6 · ภาพ 09) — ขั้นแยกหลัง CHECKED_IN: เงินล้มไม่ย้อนเช็กอิน
//   รับเงินผ่านแท็บเงิน (takeSecurityDeposit ของ H.5 · บิล POS) · ที่นี่แสดงสถานะ + เตือน "ยังไม่รับประกัน"
//   ข้อความบัญชี: เงินประกัน = เงินรับฝาก ไม่ใช่รายได้ · คืนตอนเช็กเอาต์
import { CHECKIN_STEPS, moneyTh } from "./checkin-shared";

type Props = { required: boolean; amountSatang: number; heldSatang: number; moneyHref: string; checkedIn: boolean };

export default function SecurityDepositStep({ required, amountSatang, heldSatang, moneyHref, checkedIn }: Props) {
  if (!required && heldSatang <= 0) return null;
  const held = !(heldSatang <= 0);
  return (
    <div data-security-deposit={held ? "held" : "due"} className="flex min-w-0 items-start gap-3">
      <span aria-hidden className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${held ? "bg-[color:var(--color-ink)] text-white" : "border border-amber-400 text-amber-700"}`}>
        {held ? "✓" : "!"}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-bold">
          {CHECKIN_STEPS.deposit} {moneyTh(held ? heldSatang : amountSatang)}
        </span>
        <span className="text-xs text-[color:var(--color-muted)]">
          {held ? "รับแล้ว · " : checkedIn ? "ยังไม่รับประกัน · " : "รับหลังเช็กอิน · "}
          คืนตอนเช็กเอาต์ (บันทึกเป็นเงินรับฝาก ไม่ใช่รายได้)
        </span>
        {!held && checkedIn ? (
          <a href={moneyHref} className="text-xs font-bold text-[color:var(--color-accent)]">
            รับเงินประกันที่แท็บเงิน →
          </a>
        ) : null}
      </div>
    </div>
  );
}
