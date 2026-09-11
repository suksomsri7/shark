// ReviewMember360.tsx — แท็บ "รีวิว" ในหน้าสมาชิก 360 (M3.4 · ภาพ ledger/design-member/08-history-review-referral.png ขวา)
//   `MemberReviewsTab`   = รีวิวทั้งหมดของลูกค้าคนนี้ (testid member-reviews-tab)
//   `ShopReviewSummary`  = กล่อง "รีวิวร้าน" (เฉลี่ย · แจกแจงดาว · 2 รีวิวล่าสุด · ป้ายเปิดการ์ด) (testid member-reviews-summary)
//
// 🔴 server component ล้วน (ไม่มี hook) — รับ DTO ที่หน้าโหลดมาแล้ว · ไม่ import โมดูลที่ลากถึง prisma
// 🔴 ไม่มีอักขระดาว/อีโมจิ/สีตายตัว — ดาวผ่าน ReviewStars (SVG) · สีโทเคนล้วน
// 🔴 D5: "เชิญรีวิว Google" ปิดอยู่ (เจ้าของเลือกเก็บรีวิวในระบบ) — ปุ่มแสดงตามภาพแต่กดไม่ได้
import Link from "next/link";
import { MemberIcon } from "./MemberIcon";
import { ReviewStar, ReviewStars } from "./ReviewStars";
import { REVIEW_STATUS_LABELS, thaiShortDate, type ReviewRow, type ShopReviewSummary as ShopSummaryDto } from "@/lib/modules/member/reviews-shared";

const MUTED = { color: "var(--color-muted)" } as const;

function CardBadge({ row, auto }: { row: ReviewRow; auto?: boolean }) {
  if (!row.kanbanCardId && row.status !== "ESCALATED") return null;
  const text = row.kanbanCardNo !== null ? (auto ? `เปิดการ์ดอัตโนมัติ #${row.kanbanCardNo}` : `เปิดการ์ด #${row.kanbanCardNo}${row.kanbanBoardName ? ` ในบอร์ด "${row.kanbanBoardName}"` : ""}`) : "ส่งต่อผู้จัดการแล้ว";
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-xs font-semibold" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}>
      {text}
    </span>
  );
}

/** กล่อง "รีวิวร้าน" (ภาพ 08 ขวาบน) */
export function ShopReviewSummary({ summary, recent, reviewsHref }: { summary: ShopSummaryDto; recent: ReviewRow[]; reviewsHref: string }) {
  const max = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((k) => summary.distribution[k]));
  return (
    <div data-testid="member-reviews-summary" className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <MemberIcon name="star" size="sm" />
        <span className="flex-1 font-semibold">รีวิวร้าน</span>
        <span className="text-xs" style={MUTED}>
          {summary.count.toLocaleString("th-TH")} รีวิว
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-3xl font-semibold">{summary.avg === null ? "—" : summary.avg.toFixed(1)}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {([5, 4, 3, 2, 1] as const).map((k) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="inline-flex w-7 shrink-0 items-center gap-0.5" style={MUTED}>
                {k}
                <ReviewStar filled size={9} />
              </span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}>
                <div className="h-full rounded-full" style={{ width: `${(summary.distribution[k] / max) * 100}%`, background: k <= 2 ? "var(--color-danger)" : "var(--color-ink)" }} />
              </div>
              <span className="w-5 shrink-0 text-right font-semibold">{summary.distribution[k]}</span>
            </div>
          ))}
        </div>
      </div>
      {recent.length > 0 && (
        <div className="flex flex-col">
          {recent.map((r) => (
            <div key={r.id} className="flex min-w-0 flex-col gap-1 border-t py-2.5" style={{ borderColor: "var(--color-line)" }}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                <ReviewStars rating={r.rating} size={11} />
                <span className="truncate text-sm font-semibold">{r.customer.name}</span>
                <span className="text-xs" style={MUTED}>
                  {thaiShortDate(r.submittedAt ?? r.createdAt)}
                </span>
              </div>
              {r.body && (
                <p className="text-sm" style={{ overflowWrap: "anywhere" }}>
                  &quot;{r.body}&quot;
                </p>
              )}
              <div>
                <CardBadge row={r} auto />
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-ghost w-full text-sm" disabled title="ปิดอยู่ — เจ้าของเลือกเก็บรีวิวในระบบ (D5)">
        เชิญรีวิว Google
      </button>
      <Link href={reviewsHref} className="text-center text-xs underline-offset-2 hover:underline" style={MUTED}>
        ไปที่กล่องรีวิวลูกค้า
      </Link>
    </div>
  );
}

/** รีวิวของลูกค้าคนนี้ (คอลัมน์หลักของแท็บ) */
export function MemberReviewsTab({ rows, reviewsHref }: { rows: ReviewRow[]; reviewsHref: string }) {
  return (
    <div data-testid="member-reviews-tab" className="card flex min-w-0 flex-col p-4">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">รีวิวของลูกค้าคนนี้</span>
        <span className="text-xs" style={MUTED}>
          {rows.length.toLocaleString("th-TH")} รายการ
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm" style={MUTED}>
          ลูกค้าคนนี้ยังไม่เคยรีวิว — ร้านขอรีวิวได้อัตโนมัติหลังใช้บริการ (Journey &quot;ขอรีวิว&quot;)
        </p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="flex min-w-0 flex-col gap-1 border-b py-3 last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <ReviewStars rating={r.rating} />
              {r.service && <span className="truncate text-sm font-semibold">{r.service.name}</span>}
              <span className="truncate text-xs" style={MUTED}>
                {[r.staff?.name, r.unit ? (r.unit.name.startsWith("สาขา") ? r.unit.name : `สาขา${r.unit.name}`) : null].filter(Boolean).join(" · ")}
              </span>
              <span className="text-xs" style={MUTED}>
                {thaiShortDate(r.submittedAt ?? r.createdAt)}
              </span>
              <span className="ml-auto rounded-md border px-1.5 py-0.5 text-[11px]" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
                {REVIEW_STATUS_LABELS[r.status]}
              </span>
            </div>
            {r.body ? (
              <p className="text-sm" style={{ overflowWrap: "anywhere" }}>
                &quot;{r.body}&quot;
              </p>
            ) : (
              <p className="text-sm" style={MUTED}>
                (ให้คะแนนโดยไม่เขียนข้อความ)
              </p>
            )}
            <div>
              <CardBadge row={r} />
            </div>
            {r.replyBody && (
              <p className="text-xs" style={{ ...MUTED, overflowWrap: "anywhere" }}>
                ร้านตอบกลับ — &quot;{r.replyBody}&quot;
              </p>
            )}
          </div>
        ))
      )}
      <Link href={reviewsHref} className="btn btn-ghost mt-2 self-start px-3 py-1.5 text-sm">
        ตอบ/จัดการรีวิวในกล่องรีวิวลูกค้า
      </Link>
    </div>
  );
}
