// MemberWallet.tsx — แท็บ "กระเป๋าสิทธิ์" ของโปรไฟล์สมาชิก 360 (M2.7 · ภาพ ledger/design-member/02-member-360.png)
//
// การ์ด 7 ใบเรียงตามลำดับที่คนหน้าร้านถามถึงจริง ๆ: แต้ม → voucher → คูปอง → Gift Card → รางวัลรอรับ → สแตมป์ → สิทธิ์ระดับ
// (ลำดับเดียวกับลำดับใช้สิทธิ์ที่หน้าขาย §9.1 เพื่อไม่ให้พนักงานต้องจำสองชุด)
// 🔴 ไม่มีอีโมจิ/สัญลักษณ์พิเศษ · ไม่มีสีตายตัว (โทเคนล้วน) · ไอคอนผ่าน MemberIcon เท่านั้น
// 🔴 กริดยุบเหลือคอลัมน์เดียวบนมือถือ — การ์ดทุกใบอ่านจบได้โดยไม่ต้องเลื่อนแนวนอน
import type { WalletDto } from "@/lib/modules/member";
import { StatusChip } from "@/components/ui/StatusChip";
import { MemberIcon } from "./MemberIcon";

const VOUCHER_STATUS: Record<string, string> = {
  ACTIVE: "ใช้ได้",
  USED: "ใช้แล้ว",
  EXPIRED: "หมดอายุ",
  CANCELLED: "ยกเลิก",
};

const GIFTCARD_STATUS: Record<string, string> = {
  ACTIVE: "ใช้ได้",
  DEPLETED: "ใช้ยอดหมดแล้ว",
  EXPIRED: "หมดอายุ",
  SUSPENDED: "ระงับชั่วคราว",
};

function baht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function thaiDate(d: Date | string | null): string {
  if (!d) return "ไม่มีวันหมดอายุ";
  return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" });
}

function voucherValue(v: WalletDto["vouchers"][number]): string {
  if (v.kind === "PERCENT") return `ลด ${v.value}%`;
  if (v.kind === "FREE_ITEM" || v.kind === "FREE_SERVICE") return "รับฟรี 1 รายการ";
  return `มูลค่า ฿${baht(v.value)}`;
}

function Card({ testid, icon, title, count, children }: { testid: string; icon: string; title: string; count?: string; children: React.ReactNode }) {
  return (
    <section data-testid={testid} className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <MemberIcon name={icon} />
          {title}
        </span>
        {count ? (
          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{count}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>{children}</span>;
}

function Row({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: "var(--color-line)" }}>
      <div className="flex min-w-0 flex-col">
        <span className="truncate" style={{ fontSize: 13.5 }}>
          {title}
        </span>
        {sub ? (
          <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{sub}</span>
        ) : null}
      </div>
      {right ? <div className="shrink-0 text-right">{right}</div> : null}
    </div>
  );
}

/** วงกลมสแตมป์ n/slots — ดวงที่ได้แล้วทึบ ดวงที่ยังว่างเป็นเส้นขอบ (ไม่ใช้เครื่องหมายถูก) */
function StampDots({ stamps, slots }: { stamps: number; slots: number }) {
  const dots = Array.from({ length: Math.max(0, Math.min(slots, 30)) }, (_, i) => i < stamps);
  return (
    <div className="flex flex-wrap gap-1">
      {dots.map((filled, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            border: "1.5px solid var(--color-line)",
            background: filled ? "var(--color-ink)" : "transparent",
          }}
        />
      ))}
    </div>
  );
}

export function MemberWallet({ wallet }: { wallet: WalletDto }) {
  const b = wallet.tierBenefits;
  const benefits: string[] = [];
  if (b.discountPct > 0) benefits.push(`ส่วนลดทุกบิล ${b.discountPct}%${b.discountMaxSatang > 0 ? ` (สูงสุด ฿${baht(b.discountMaxSatang)})` : ""}`);
  if (b.discountFixedSatang > 0) benefits.push(`ส่วนลดคงที่ ฿${baht(b.discountFixedSatang)} ต่อบิล`);
  if (b.pointMultiplier > 1) benefits.push(`ได้แต้มคูณ ${b.pointMultiplier} เท่า`);
  if (b.priorityBookingDays > 0) benefits.push(`จองล่วงหน้าก่อนใคร ${b.priorityBookingDays} วัน`);
  if (b.cancelFeeDiscountPct > 0) benefits.push(`ลดค่าธรรมเนียมยกเลิก ${b.cancelFeeDiscountPct}%`);
  if (b.noPointExpiry) benefits.push("แต้มไม่หมดอายุ");
  if (b.freeServices.length > 0) benefits.push(`บริการฟรีตามสิทธิ์ ${b.freeServices.length} รายการ`);

  return (
    <div data-testid="member-wallet" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      <Card testid="member-wallet-points" icon="star" title="แต้มสะสม">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{wallet.points.balance.toLocaleString("th-TH")}</span>
          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>แต้มคงเหลือ</span>
        </div>
        {wallet.points.expiringSoon.length === 0 ? (
          <Empty>ยังไม่มีแต้มที่ใกล้หมดอายุ</Empty>
        ) : (
          <div className="flex flex-col gap-1">
            <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ใกล้หมดอายุ</span>
            {wallet.points.expiringSoon.slice(0, 4).map((e, i) => (
              <Row key={i} title={`${e.points.toLocaleString("th-TH")} แต้ม`} sub={`ถึง ${thaiDate(e.expiresAt)}`} />
            ))}
          </div>
        )}
      </Card>

      <Card testid="member-wallet-vouchers" icon="tag" title="Voucher" count={`${wallet.vouchers.length.toLocaleString("th-TH")} ใบ`}>
        {wallet.vouchers.length === 0 ? (
          <Empty>ยังไม่มี voucher ในมือ — ออกใบให้ลูกค้าได้จากปุ่มด้านบน</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {wallet.vouchers.slice(0, 8).map((v) => (
              <Row
                key={v.id}
                title={v.name}
                sub={`${voucherValue(v)} · ใช้ได้ถึง ${thaiDate(v.expiresAt)}`}
                right={<StatusChip value={v.status} map={VOUCHER_STATUS} tone={v.status === "ACTIVE" ? "strong" : "muted"} />}
              />
            ))}
          </div>
        )}
      </Card>

      <Card testid="member-wallet-coupons" icon="megaphone" title="คูปองที่ใช้ได้" count={`${wallet.coupons.length.toLocaleString("th-TH")} ใบ`}>
        {wallet.coupons.length === 0 ? (
          <Empty>ยังไม่มีคูปองที่เปิดใช้อยู่</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {wallet.coupons.slice(0, 6).map((c) => (
              <Row
                key={c.id}
                title={c.name}
                sub={`รหัส ${c.code}${c.minSpendSatang ? ` · ยอดขั้นต่ำ ฿${baht(c.minSpendSatang)}` : ""} · ถึง ${thaiDate(c.endAt)}`}
                right={
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {c.type === "PERCENT" ? `${c.percent ?? 0}%` : `฿${baht(c.valueSatang ?? 0)}`}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Card>

      <Card testid="member-wallet-giftcards" icon="card" title="Gift Card" count={`${wallet.giftCards.length.toLocaleString("th-TH")} ใบ`}>
        {wallet.giftCards.length === 0 ? (
          <Empty>ยังไม่มีบัตรกำนัลในชื่อสมาชิกคนนี้</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {wallet.giftCards.map((g) => (
              <Row
                key={g.id}
                title={g.numberMasked}
                sub={`ใช้ได้ถึง ${thaiDate(g.expiresAt)}`}
                right={
                  <div className="flex flex-col items-end gap-1">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>฿{baht(g.balanceSatang)}</span>
                    <StatusChip value={g.status} map={GIFTCARD_STATUS} tone={g.status === "ACTIVE" ? "strong" : "muted"} />
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Card>

      <Card testid="member-wallet-rewards" icon="gift" title="รางวัลรอรับ" count={`${wallet.rewardsPending.length.toLocaleString("th-TH")} รายการ`}>
        {wallet.rewardsPending.length === 0 ? (
          <Empty>ยังไม่มีของรางวัลที่รอรับ</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {wallet.rewardsPending.map((r) => (
              <Row
                key={r.redemptionId}
                title={r.rewardName}
                sub={`รหัสรับของ ${r.qrCode} · รับได้ถึง ${thaiDate(r.expiresAt)}`}
              />
            ))}
          </div>
        )}
      </Card>

      <Card testid="member-wallet-stamps" icon="stamp" title="สแตมป์" count={`${wallet.stamps.length.toLocaleString("th-TH")} ใบ`}>
        {wallet.stamps.length === 0 ? (
          <Empty>ร้านยังไม่มีสแตมป์การ์ดที่สมาชิกคนนี้สะสมได้</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {wallet.stamps.map((s) => (
              <div key={s.cardId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate" style={{ fontSize: 13.5 }}>
                    {s.name}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {s.stamps}/{s.slots}
                  </span>
                </div>
                <StampDots stamps={s.stamps} slots={s.slots} />
                <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ใบที่ {s.cycle}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card testid="member-wallet-benefits" icon="crown" title="สิทธิ์ระดับ" count={b.tier?.name ?? "ยังไม่มีระดับ"}>
        {benefits.length === 0 ? (
          <Empty>ระดับนี้ยังไม่ได้ตั้งสิทธิประโยชน์ไว้</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {benefits.map((t) => (
              <Row key={t} title={t} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default MemberWallet;
