// MCard.tsx — หน้า "บัตรสมาชิกของฉัน" (M2.9 · ภาพ 09 ก)
//
// การ์ดดำใบเดียวที่ลูกค้าเปิดให้พนักงานสแกน: ชื่อร้าน · ชื่อ+ระดับ · รหัส+อายุสมาชิก · QR ใหญ่ ·
// แต้มคงเหลือ + แถบความคืบหน้า + "อีก ฿x → เลื่อนเป็น <ระดับถัดไป>" · ปุ่มลัด 4 · สิทธิ์ที่ใช้ได้ตอนนี้ 2 รายการ
// 🔴 QR = token อายุ 24 ชม. (ไม่ใช่รหัสสมาชิก) — ภาพถูกสร้างฝั่งเซิร์ฟเวอร์แล้วส่งมาเป็น data URL
import Link from "next/link";
import type { WalletDto } from "@/lib/modules/member";
import type { MeCardDto, MeDto } from "@/lib/modules/member/me";
import { MemberIcon } from "./MemberIcon";
import { MCardBox, MMuted, MSectionTitle, MTopBar, baht, memberSinceText, thaiDate } from "./MShell";

type BenefitRow = { icon: string; title: string; sub: string };

/** 2 สิทธิ์แรกที่ใช้ได้ตอนนี้ — voucher ก่อน แล้วของรางวัลรอรับ แล้วสิทธิ์ของระดับ */
function benefitsNow(wallet: WalletDto): BenefitRow[] {
  const rows: BenefitRow[] = [];
  for (const v of wallet.vouchers) {
    rows.push({ icon: "tag", title: v.name, sub: `ใช้ได้ถึง ${thaiDate(v.expiresAt)}` });
  }
  for (const r of wallet.rewardsPending) {
    rows.push({ icon: "box", title: r.rewardName, sub: `รับของภายใน ${thaiDate(r.expiresAt)}` });
  }
  for (const f of wallet.tierBenefits.freeServices) {
    rows.push({ icon: "gift", title: f, sub: `สิทธิ์ระดับ ${wallet.tierBenefits.tier?.name ?? "สมาชิก"}` });
  }
  if (wallet.tierBenefits.discountPct > 0) {
    rows.push({
      icon: "star",
      title: `ส่วนลดสมาชิก ${wallet.tierBenefits.discountPct}%`,
      sub: `สิทธิ์ระดับ ${wallet.tierBenefits.tier?.name ?? "สมาชิก"}`,
    });
  }
  return rows.slice(0, 2);
}

export function MCard({
  slug,
  shopName,
  card,
  me,
  wallet,
}: {
  slug: string;
  shopName: string;
  card: MeCardDto;
  me: MeDto;
  wallet: WalletDto;
}) {
  const next = me.member.nextTier;
  const rows = benefitsNow(wallet);
  const actions = [
    { href: `/m/${slug}/wallet`, label: "สิทธิ์", icon: "wallet" },
    { href: `/m/${slug}/wallet#stamps`, label: "สแตมป์", icon: "stamp" },
    { href: `/m/${slug}/history`, label: "ประวัติ", icon: "clock" },
    // M3.5 — ปุ่มลัดนี้ชี้หน้าโปรไฟล์ไว้ก่อน (ยังไม่มีหน้าแนะนำเพื่อน) · ตอนนี้มีหน้า `/m/<slug>/referral` แล้ว
    { href: `/m/${slug}/referral`, label: "แนะนำเพื่อน", icon: "users" },
  ];

  return (
    <div data-testid="m-card" className="flex flex-col gap-3.5 pb-4">
      <MTopBar title="บัตรสมาชิกของฉัน" left="menu" right="bell" />

      <div className="px-4">
        <div
          className="flex flex-col gap-2.5 rounded-2xl p-4"
          style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
        >
          <div className="truncate" style={{ fontSize: 10.5, letterSpacing: 0.8, opacity: 0.75 }}>
            {shopName.toUpperCase()}
          </div>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-semibold" style={{ fontSize: 15 }}>
              {card.displayName}
            </span>
            {card.tierName ? (
              <span
                className="shrink-0 rounded-md px-2 py-0.5"
                style={{ fontSize: 10.5, fontWeight: 600, background: "var(--color-surface)", color: "var(--color-ink)" }}
              >
                {card.tierName}
              </span>
            ) : null}
          </div>
          <div className="truncate" style={{ fontSize: 11, opacity: 0.8 }}>
            {card.memberCode} · {memberSinceText(me.member.memberSince)}
          </div>

          <div className="flex justify-center py-1">
            <div className="rounded-xl p-2" style={{ background: "var(--color-surface)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img data-testid="m-card-qr" src={card.qr.dataUrl} alt="QR บัตรสมาชิก" width={150} height={150} />
            </div>
          </div>

          <div data-testid="m-card-points" className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-1.5">
              <span style={{ fontSize: 20, fontWeight: 700 }}>{card.points.toLocaleString("th-TH")}</span>
              <span style={{ fontSize: 11, opacity: 0.75 }}>แต้มคงเหลือ</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-ink-soft)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${next ? next.progressPct : 100}%`, background: "var(--color-surface)" }}
              />
            </div>
            <div className="truncate" style={{ fontSize: 11, opacity: 0.8 }}>
              {next
                ? `อีก ฿${baht(next.shortfallSatang)} → เลื่อนเป็น ${next.name}`
                : "คุณอยู่ระดับสูงสุดของร้านแล้ว"}
            </div>
          </div>
        </div>
      </div>

      <div data-testid="m-card-actions" className="grid grid-cols-4 gap-2 px-4">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="flex flex-col items-center gap-1.5 rounded-xl border py-3"
            style={{ borderColor: "var(--color-line)", fontSize: 11 }}
          >
            <MemberIcon name={a.icon} />
            <span className="truncate">{a.label}</span>
          </Link>
        ))}
      </div>

      <MSectionTitle icon="bolt">สิทธิ์ที่ใช้ได้ตอนนี้</MSectionTitle>
      <div data-testid="m-card-benefits" className="flex flex-col gap-2 px-4">
        {rows.length === 0 ? (
          <MCardBox className="px-3 py-3">
            <MMuted size={12}>ยังไม่มีสิทธิ์ที่ใช้ได้ตอนนี้ — สะสมแต้มหรือรอโปรโมชันรอบถัดไป</MMuted>
          </MCardBox>
        ) : (
          rows.map((r, i) => (
            <Link key={`${r.title}-${i}`} href={`/m/${slug}/wallet`}>
              <MCardBox className="flex items-center gap-2.5 px-3 py-2.5">
                <MemberIcon name={r.icon} size="sm" className="opacity-70" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {r.title}
                  </span>
                  <MMuted>{r.sub}</MMuted>
                </span>
                <MemberIcon name="chevronDown" size="xs" className="-rotate-90 opacity-60" />
              </MCardBox>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export default MCard;
