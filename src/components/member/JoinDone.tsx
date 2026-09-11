// JoinDone.tsx — ขั้น (ค) "สมัครสำเร็จ" ของหน้าสมัครสมาชิก `/m/<slug>/join/done` (M3.11 · ภาพ 29 ค)
//
// บัตรสมาชิกสีเข้ม + QR (แบบเดียวกับบัตรในภาพ 09 — QR = token อายุ 24 ชม. ไม่ใช่รหัสสมาชิก) ·
// กล่อง "ได้รับทันที" = แต้มต้อนรับที่ **เข้ากระเป๋าจริง** (อ่านจากสมุดแต้ม ไม่ใช่ตัวเลขที่ร้านโฆษณา) ·
// ปุ่ม "เปิดบัตรสมาชิก" (หลัก) + "ไปกระเป๋าสิทธิ์" (รอง)
// 🔴 ร้านไม่ได้ตั้งแต้มต้อนรับ = บอกตามจริง (ไม่แต่งตัวเลข) · ไม่มีอีโมจิ/สีตายตัว · ไอคอนผ่าน MemberIcon
// 🔴 ปุ่ม "เพิ่มเพื่อน LINE" ของสัญญายังไม่มีที่มา (ระบบยังไม่เก็บลิงก์เพิ่มเพื่อนของ LINE OA ร้าน) ⇒ ไม่วาดปุ่มที่ชี้ไปไหนไม่ได้
import Link from "next/link";
import type { MeCardDto } from "@/lib/modules/member/me";
import { MemberIcon } from "./MemberIcon";
import { memberSinceText } from "./MShell";

/** สมัครวันนี้ไหม (วันไทย) — ห้ามใช้ getDate() ดิบ (เครื่อง server เป็น UTC) */
function joinedTodayBkk(since: Date | string, now: Date = new Date()): boolean {
  const day = (d: Date) => Math.floor((d.getTime() + 7 * 3_600_000) / 86_400_000);
  return day(new Date(since)) === day(now);
}

export function JoinDone({
  slug,
  shopName,
  card,
  memberSince,
  welcomePoints,
  pointsBalance,
}: {
  slug: string;
  shopName: string;
  card: MeCardDto;
  memberSince: Date | string;
  /** แต้มต้อนรับที่ได้จริง (ผลรวมรายการ "แต้มต้อนรับสมาชิกใหม่" ในสมุดแต้ม) */
  welcomePoints: number;
  pointsBalance: number;
}) {
  const base = `/m/${encodeURIComponent(slug)}`;
  const sinceText = joinedTodayBkk(memberSince) ? "สมาชิกใหม่วันนี้" : memberSinceText(memberSince);

  return (
    <div data-testid="m-join-done" className="flex min-h-dvh flex-col gap-3.5 pb-8">
      <header className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
        <Link href={`${base}/card`} aria-label="ปิดแล้วไปบัตรสมาชิก" className="-ml-1 rounded-md p-1">
          <MemberIcon name="x" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-semibold" style={{ fontSize: 13.5 }}>
          สมัครสำเร็จ
        </h1>
      </header>

      <div className="px-4">
        <div
          data-testid="m-join-done-card"
          className="flex flex-col gap-2 rounded-2xl p-4"
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
            {card.memberCode} · {sinceText}
          </div>
          <div className="flex justify-center py-1.5">
            <div className="rounded-xl p-2" style={{ background: "var(--color-surface)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img data-testid="m-join-done-qr" src={card.qr.dataUrl} alt="QR บัตรสมาชิก" width={132} height={132} />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4">
        <div
          data-testid="m-join-done-points"
          className="rounded-xl border px-3.5 py-3"
          style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}
        >
          {welcomePoints > 0 ? (
            <>
              <p className="font-semibold" style={{ fontSize: 12.5, color: "var(--color-accent)" }}>
                ได้รับทันที
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.5 }}>+{welcomePoints.toLocaleString("th-TH")} แต้มต้อนรับ</p>
            </>
          ) : (
            <>
              <p className="font-semibold" style={{ fontSize: 12.5, color: "var(--color-accent)" }}>
                แต้มคงเหลือ {pointsBalance.toLocaleString("th-TH")} แต้ม
              </p>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-muted)" }}>
                ร้านนี้ยังไม่มีแต้มต้อนรับ — สะสมแต้มได้ทุกครั้งที่ใช้บริการ
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4">
        <Link href={`${base}/card`} data-testid="m-join-done-open-card" className="btn btn-primary w-full" style={{ minHeight: 46 }}>
          <MemberIcon name="card" size="sm" />
          เปิดบัตรสมาชิก
        </Link>
        <Link href={`${base}/wallet`} className="btn btn-ghost w-full" style={{ minHeight: 46 }}>
          ไปกระเป๋าสิทธิ์
        </Link>
      </div>
    </div>
  );
}

export default JoinDone;
