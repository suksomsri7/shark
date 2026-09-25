// ContactScoreBadge.tsx — ป้ายคะแนน + เหตุผล 3 ข้อล่าสุดบนการ์ดผู้ติดต่อ (ใบ C2.8 · ภาพ 05 "🔥 ร้อน 72" + "ทำไมถึงร้อน 72" + ชิปเหตุผล)
// 🔴 คอมโพเนนต์ฝั่งเซิร์ฟเวอร์ **แสดงผลล้วน ๆ**: รับ props ที่หน้า 360 เตรียมไว้ (ผ่าน `scoring.explain` ตามการมองเห็นของผู้ดู)
//    ⇒ ไม่แตะ prisma ไม่แตะโมดูล CRM (ด่าน F2.3) และไม่มี 'use client' ที่ไหนในสายนี้
// 🔴 รายการเต็มเปิดด้วย <details>/<summary> (ไม่ต้องมี JS) — ปุ่ม `contact-score-explain-btn` คือ <summary> นั้นเอง

export type ContactScoreReason = { logId: string; points: number; reason: string; ago: string; expiresLabel: string | null };

export type ContactScoreBand = "HOT" | "WARM" | "COLD";

/**
 * 🔴 ภาพ 05 เขียนป้ายไว้ว่า "🔥 ร้อน 72" — อีโมจิต่อระดับอยู่ **ที่ป้ายนี้ที่เดียว** (ไม่ยัดเข้า `SCORE_BAND_LABELS`
 *    เพราะที่อื่นใช้ป้ายเดียวกันเป็นข้อความล้วน: หน้าตั้งค่าคะแนน · ป้ายกฎอัตโนมัติ · ช่องกรองในรายชื่อ)
 */
const BAND_EMOJI: Readonly<Record<ContactScoreBand, string>> = { HOT: "🔥", WARM: "🌤", COLD: "❄️" };

export function ContactScoreBadge({ score, band, bandLabel, tone }: { score: number; band: ContactScoreBand; bandLabel: string; tone: string }) {
  return (
    <span
      data-testid="contact-score-badge"
      className="rounded-md border px-1.5 py-0.5 text-xs font-semibold"
      style={{ color: tone, borderColor: tone }}
      title={`คะแนนผู้ติดต่อ ${score.toLocaleString("th-TH")} แต้ม (${bandLabel})`}
    >
      {BAND_EMOJI[band]} {bandLabel} {score.toLocaleString("th-TH")}
    </span>
  );
}

export function ContactScoreReasons({ items, chips = 3, bandLabel, score }: { items: ContactScoreReason[]; chips?: number; bandLabel: string; score: number }) {
  if (items.length === 0) return null;
  const rest = items.slice(chips);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {/* ภาพ 05: บรรทัดนำหน้าชิปเหตุผล — "ทำไมถึงร้อน 72" */}
      <span className="text-xs font-semibold">
        ทำไมถึง{bandLabel} {score.toLocaleString("th-TH")}
      </span>
      {items.slice(0, chips).map((r, i) => (
        <span key={r.logId} data-testid={`contact-score-reason-${i}`} className="rounded-full border px-2 text-xs text-[color:var(--color-muted)]">
          {r.points > 0 ? `+${r.points.toLocaleString("th-TH")}` : r.points.toLocaleString("th-TH")} {r.reason} · {r.ago}
        </span>
      ))}
      <details className="min-w-0">
        <summary data-testid="contact-score-explain-btn" className="cursor-pointer text-xs text-[color:var(--color-muted)] underline">
          ดูเหตุผลคะแนนทั้งหมด
        </summary>
        <span className="mt-1 flex min-w-0 flex-col gap-0.5 text-xs text-[color:var(--color-muted)]">
          {[...items.slice(0, chips), ...rest].map((r) => (
            <span key={`all-${r.logId}`}>
              {r.points > 0 ? `+${r.points.toLocaleString("th-TH")}` : r.points.toLocaleString("th-TH")} {r.reason} · {r.ago}
              {r.expiresLabel ? ` · หมดอายุ ${r.expiresLabel}` : " · ไม่หมดอายุ"}
            </span>
          ))}
        </span>
      </details>
    </span>
  );
}
