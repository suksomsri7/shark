"use client";

// ReviewLiff.tsx — หน้าเขียนรีวิวของลูกค้า `/m/<slug>/review/<token>` (M3.4 · LIFF · มือถือ 390px)
// ดาว 5 ดวง (แตะเลือก) · ข้อความ · รูป ≤ 3 · ส่ง → หน้าขอบคุณ + แต้มที่ได้
//
// 🔴 ไม่ต้องล็อกอิน — token ในลิงก์คือสิทธิ์ (ใช้ครั้งเดียว) · ข้อความผิดพลาดขึ้นในหน้า ไม่ใช่กล่องเด้ง
// 🔴 'use client' — import ได้เฉพาะไฟล์บริสุทธิ์ + server action (ไม่ลาก prisma)
// 🔴 ไม่มีอักขระดาว/อีโมจิ/สีตายตัว — ดาวเป็น SVG (ReviewStar) · ไอคอนผ่าน MemberIcon
import { useRef, useState, useTransition } from "react";
import { submitReviewAction } from "@/lib/modules/member/reviews-actions";
import type { ReviewSubmitResult } from "@/lib/modules/member/reviews-shared";
import { MemberIcon } from "./MemberIcon";
import { MCardBox, MMuted, MTopBar } from "./MShell";
import { ReviewStar, ReviewStars } from "./ReviewStars";

const RATING_WORD = ["", "ควรปรับปรุง", "พอใช้", "ดี", "ดีมาก", "ประทับใจมาก"];

export function ReviewLiffForm({
  slug,
  token,
  shopName,
  serviceName,
  firstName,
  rewardPoints,
  maxPhotos,
}: {
  slug: string;
  token: string;
  shopName: string;
  serviceName: string | null;
  firstName: string;
  rewardPoints: number;
  maxPhotos: number;
}) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<ReviewSubmitResult | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (list: FileList | null) => {
    if (!list) return;
    const next = [...photos, ...Array.from(list).filter((f) => f.type.startsWith("image/"))];
    if (next.length > maxPhotos) setErr(`แนบรูปได้สูงสุด ${maxPhotos} รูป — เลือกไว้ ${maxPhotos} รูปแรก`);
    else setErr(null);
    setPhotos(next.slice(0, maxPhotos));
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () =>
    start(async () => {
      setErr(null);
      if (rating < 1) {
        setErr("แตะดาวเพื่อให้คะแนนก่อนกดส่งนะคะ");
        return;
      }
      const fd = new FormData();
      fd.set("rating", String(rating));
      fd.set("body", body);
      for (const p of photos) fd.append("photos", p);
      const r = await submitReviewAction(slug, token, fd);
      if (r.ok) setDone(r.data);
      else setErr(r.reason);
    });

  if (done) {
    return (
      <div data-testid="m-review-thanks" className="flex flex-col gap-3 pb-4">
        <MTopBar title={`รีวิว ${shopName}`} left="star" />
        <MCardBox className="mx-4 flex flex-col items-center gap-2 p-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: "var(--color-surface-2)" }}>
            <MemberIcon name="check" size="lg" />
          </span>
          <span className="text-base font-semibold">ขอบคุณสำหรับรีวิวค่ะ</span>
          <ReviewStars rating={rating} size={16} />
          {done.pointsEarned > 0 ? (
            <span className="text-sm">
              ได้รับ <b>{done.pointsEarned.toLocaleString("th-TH")} แต้ม</b> เข้ากระเป๋าสมาชิกแล้ว
            </span>
          ) : (
            <MMuted size={12.5}>ร้านได้รับรีวิวของคุณแล้ว</MMuted>
          )}
          {done.escalated && <MMuted size={12}>ทางร้านส่งเรื่องให้ผู้จัดการดูแลต่อแล้วค่ะ</MMuted>}
        </MCardBox>
      </div>
    );
  }

  return (
    <div data-testid="m-review" className="flex flex-col gap-3 pb-4">
      <MTopBar title={`รีวิว ${shopName}`} left="star" />
      <div className="flex flex-col gap-1 px-4 pt-1">
        <span className="text-base font-semibold">{firstName ? `คุณ${firstName} ` : ""}ประทับใจแค่ไหนคะ</span>
        <MMuted size={12}>{serviceName ? `บริการ: ${serviceName}` : `ใช้บริการที่ ${shopName}`}</MMuted>
      </div>

      <MCardBox className="mx-4 flex flex-col items-center gap-2 p-4">
        <div data-testid="m-review-stars" className="flex items-center gap-2" role="radiogroup" aria-label="ให้คะแนน">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={rating === i}
              aria-label={`${i} ดาว`}
              className="grid h-11 w-11 place-items-center rounded-lg"
              onClick={() => setRating(i)}
            >
              <ReviewStar filled={i <= rating} size={30} />
            </button>
          ))}
        </div>
        <MMuted size={12}>{rating > 0 ? RATING_WORD[rating] : "แตะดาวเพื่อให้คะแนน"}</MMuted>
      </MCardBox>

      <MCardBox className="mx-4 flex flex-col gap-2 p-4">
        <label htmlFor="m-review-body" className="text-sm font-semibold">
          เล่าให้ร้านฟังหน่อย (ไม่บังคับ)
        </label>
        <textarea
          id="m-review-body"
          data-testid="m-review-body"
          className="input min-h-[96px]"
          maxLength={2000}
          placeholder="ชอบอะไร หรืออยากให้ร้านปรับตรงไหน"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          {photos.map((p, i) => (
            <span key={`${p.name}-${i}`} className="flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs" style={{ borderColor: "var(--color-line)" }}>
              <MemberIcon name="cam" size="xs" />
              <span className="max-w-[120px] truncate">{p.name}</span>
              <button type="button" aria-label="เอารูปนี้ออก" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                <MemberIcon name="x" size="xs" />
              </button>
            </span>
          ))}
          {photos.length < maxPhotos && (
            <button type="button" data-testid="m-review-photo" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => fileRef.current?.click()}>
              <MemberIcon name="cam" size="sm" /> แนบรูป ({photos.length}/{maxPhotos})
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
        </div>
      </MCardBox>

      {err && (
        <p className="px-4 text-sm" style={{ color: "var(--color-danger)" }}>
          {err}
        </p>
      )}

      <div className="flex flex-col gap-1.5 px-4">
        <button type="button" data-testid="m-review-submit" className="btn btn-primary w-full" disabled={pending} onClick={submit}>
          {pending ? "กำลังส่ง…" : "ส่งรีวิว"}
        </button>
        {rewardPoints > 0 && (
          <span className="text-center text-xs" style={{ color: "var(--color-muted)" }}>
            รีวิวแล้วรับ {rewardPoints.toLocaleString("th-TH")} แต้ม
          </span>
        )}
      </div>
    </div>
  );
}

/** ลิงก์ใช้ไปแล้ว / ลิงก์ใช้ไม่ได้ (ไม่มี state — วาดจากฝั่งเซิร์ฟเวอร์ได้) */
export function ReviewLiffMessage({ kind, shopName, rating }: { kind: "done" | "invalid"; shopName?: string; rating?: number }) {
  return (
    <div data-testid={kind === "done" ? "m-review-done" : "m-review-invalid"} className="flex flex-col gap-3 pb-4">
      <MTopBar title={shopName ? `รีวิว ${shopName}` : "รีวิว"} left="star" />
      <MCardBox className="mx-4 flex flex-col items-center gap-2 p-6 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: "var(--color-surface-2)" }}>
          <MemberIcon name={kind === "done" ? "check" : "warn"} size="lg" />
        </span>
        {kind === "done" ? (
          <>
            <span className="text-base font-semibold">รีวิวไปแล้ว — ขอบคุณค่ะ</span>
            {rating ? <ReviewStars rating={rating} size={16} /> : null}
            <MMuted size={12.5}>ลิงก์นี้ใช้ส่งรีวิวได้ครั้งเดียว ร้านได้รับรีวิวของคุณแล้ว</MMuted>
          </>
        ) : (
          <>
            <span className="text-base font-semibold">ลิงก์รีวิวนี้ใช้ไม่ได้แล้ว</span>
            <MMuted size={12.5}>ลิงก์อาจหมดอายุหรือไม่ครบ — ขอลิงก์ใหม่จากร้านได้เลยค่ะ</MMuted>
          </>
        )}
      </MCardBox>
    </div>
  );
}
