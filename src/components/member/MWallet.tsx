// MWallet.tsx — หน้า "กระเป๋าสิทธิ์" ของลูกค้า (M2.9 · ภาพ 09 ข)
//
// เรียงตามภาพ: แถบเตือนแต้มใกล้หมดอายุ → Voucher n → สแตมป์การ์ด (วงกลมจริง) → Gift Card → ของรางวัลรอรับ
// 🔴 อ่านอย่างเดียว — การ "ใช้สิทธิ์" เกิดที่หน้าขายของร้าน (พนักงานสแกนบัตร) ปุ่มที่นี่จึงพาไปหน้าบัตร
import Link from "next/link";
import type { WalletDto } from "@/lib/modules/member";
import { MemberIcon } from "./MemberIcon";
import { MCardBox, MMuted, MSectionTitle, MTopBar, baht, thaiDate } from "./MShell";

function StampDots({ stamps, slots }: { stamps: number; slots: number }) {
  const dots = Array.from({ length: Math.max(0, Math.min(slots, 20)) }, (_, i) => i < stamps);
  return (
    <div className="flex flex-wrap gap-2">
      {dots.map((on, i) => (
        <span
          key={i}
          className="flex h-7 w-7 items-center justify-center rounded-full border"
          style={{
            borderColor: "var(--color-line)",
            background: on ? "var(--color-ink)" : "var(--color-surface)",
            color: on ? "var(--color-surface)" : "var(--color-muted)",
            fontSize: 10.5,
          }}
        >
          {on ? <MemberIcon name="check" size="xs" /> : i + 1}
        </span>
      ))}
    </div>
  );
}

export function MWallet({ slug, wallet }: { slug: string; wallet: WalletDto }) {
  const expiring = wallet.points.expiringSoon[0] ?? null;

  return (
    <div data-testid="m-wallet" className="flex flex-col gap-3 pb-4">
      <MTopBar title="กระเป๋าสิทธิ์" left="back" right="more" />

      {expiring ? (
        <div
          className="mx-4 flex items-center gap-2 rounded-xl border px-3 py-2.5"
          style={{ borderColor: "var(--color-note-line)", background: "var(--color-note)", color: "var(--color-note-ink)" }}
        >
          <MemberIcon name="clock" size="sm" />
          <span style={{ fontSize: 11.5 }}>
            แต้ม {expiring.points.toLocaleString("th-TH")} กำลังจะหมดอายุ ({thaiDate(expiring.expiresAt)})
          </span>
        </div>
      ) : null}

      <MSectionTitle
        icon="tag"
        right={
          <span className="rounded-md px-1.5" style={{ fontSize: 11, background: "var(--color-surface-2)" }}>
            {wallet.vouchers.length}
          </span>
        }
      >
        Voucher
      </MSectionTitle>
      <div data-testid="m-wallet-vouchers" className="flex flex-col gap-2 px-4">
        {wallet.vouchers.length === 0 ? (
          <MCardBox className="px-3 py-3">
            <MMuted size={12}>ยังไม่มี Voucher ในกระเป๋า</MMuted>
          </MCardBox>
        ) : (
          wallet.vouchers.map((v) => (
            <MCardBox key={v.id} className="flex items-center gap-2 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {v.name}
                </span>
                <MMuted>ใช้ได้ถึง {thaiDate(v.expiresAt)}</MMuted>
              </span>
              <Link href={`/m/${slug}/card`} className="shrink-0 text-right">
                <span className="block" style={{ fontSize: 13, fontWeight: 700 }}>
                  {v.kind === "PERCENT" ? `ลด ${v.value}%` : `฿${(v.value / 100).toLocaleString("th-TH")}`}
                </span>
                <MMuted size={10.5}>แตะใช้</MMuted>
              </Link>
            </MCardBox>
          ))
        )}
      </div>

      <MSectionTitle icon="stamp">สแตมป์</MSectionTitle>
      <div data-testid="m-wallet-stamps" id="stamps" className="flex flex-col gap-2 px-4">
        {wallet.stamps.length === 0 ? (
          <MCardBox className="px-3 py-3">
            <MMuted size={12}>ร้านนี้ยังไม่มีสแตมป์การ์ดที่คุณเก็บอยู่</MMuted>
          </MCardBox>
        ) : (
          wallet.stamps.map((s) => (
            <MCardBox key={s.cardId} className="flex flex-col gap-2.5 px-3 py-3">
              <div className="flex items-center gap-2">
                <MemberIcon name="stamp" size="sm" />
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {s.name}
                </span>
                <MMuted size={11.5}>
                  {s.stamps}/{s.slots}
                </MMuted>
              </div>
              <StampDots stamps={s.stamps} slots={s.slots} />
              <MMuted>ครบ {s.slots} ดวง รับของรางวัลของการ์ดใบนี้ · รอบที่ {s.cycle}</MMuted>
            </MCardBox>
          ))
        )}
      </div>

      <MSectionTitle icon="wallet">Gift Card</MSectionTitle>
      <div data-testid="m-wallet-giftcards" className="flex flex-col gap-2 px-4">
        {wallet.giftCards.length === 0 ? (
          <MCardBox className="px-3 py-3">
            <MMuted size={12}>ยังไม่มีบัตรกำนัลในกระเป๋า</MMuted>
          </MCardBox>
        ) : (
          wallet.giftCards.map((g) => (
            <MCardBox key={g.id} className="flex items-center gap-2.5 px-3 py-2.5">
              <MemberIcon name="card" size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  Gift Card {g.numberMasked}
                </span>
                <MMuted>คงเหลือ ฿{baht(g.balanceSatang)}</MMuted>
              </span>
              <Link href={`/m/${slug}/card`} className="btn-sm shrink-0" style={{ fontSize: 12 }}>
                ใช้
              </Link>
            </MCardBox>
          ))
        )}
      </div>

      <MSectionTitle icon="box">ของรางวัลรอรับ</MSectionTitle>
      <div data-testid="m-wallet-rewards" className="flex flex-col gap-2 px-4">
        {wallet.rewardsPending.length === 0 ? (
          <MCardBox className="px-3 py-3">
            <MMuted size={12}>ยังไม่มีของรางวัลรอรับ</MMuted>
          </MCardBox>
        ) : (
          wallet.rewardsPending.map((r) => (
            <MCardBox key={r.redemptionId} className="flex items-center gap-2.5 px-3 py-2.5">
              <MemberIcon name="gift" size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {r.rewardName}
                </span>
                <MMuted>รหัสรับของ {r.qrCode} · ภายใน {thaiDate(r.expiresAt)}</MMuted>
              </span>
            </MCardBox>
          ))
        )}
      </div>
    </div>
  );
}

export default MWallet;
