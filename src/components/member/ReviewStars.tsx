// ReviewStars.tsx — ดาวคะแนนรีวิว (M3.4 · ภาพ 23 · 08 · LIFF)
//
// 🔴 ไม่ใช้อักขระดาว (U+2605/2606 อยู่ในช่วงสัญลักษณ์ที่ห้ามใช้ในหน้าสมาชิก) — วาดเป็น SVG เอง
//    ดาวเต็ม = สีตัวอักษรหลัก · ดาวว่าง = สีเส้น hairline (โทเคนล้วน ไม่มีสีตายตัว)
// 🔴 ไม่มี hook — ใช้ได้ทั้ง server component และ client component

const STAR_PATH = "M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z";

export function ReviewStar({ filled, size = 12, tone = "ink" }: { filled: boolean; size?: number; tone?: "ink" | "danger" }) {
  const color = filled ? (tone === "danger" ? "var(--color-danger)" : "var(--color-ink)") : "var(--color-line)";
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className="shrink-0" style={{ color }}>
      <path d={STAR_PATH} fill="currentColor" />
    </svg>
  );
}

/** ดาว 5 ดวงตามคะแนน (อ่านอย่างเดียว) */
export function ReviewStars({ rating, size = 12, label = true }: { rating: number; size?: number; label?: boolean }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="inline-flex items-center gap-0.5" {...(label ? { "aria-label": `${r} ดาว`, role: "img" } : {})}>
      {[1, 2, 3, 4, 5].map((i) => (
        <ReviewStar key={i} filled={i <= r} size={size} />
      ))}
    </span>
  );
}

export default ReviewStars;
