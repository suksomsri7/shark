"use client";

// bubble.tsx — ฟองข้อความ + ตัวคั่นวันที่ ของกล่องแชท (WO-CW4 · §6.2 · มติ W1)
//
// เลย์เอาต์อ้าง WhatsApp: ขาเข้าชิดซ้าย · ขาออกชิดขวา · **ฟองมีหาง** · ติ๊กสถานะมุมขวาล่าง
// 🔴 สีอยู่ในโทน SHARK ทั้งหมด (ตัวแปรใน globals.css) — ไม่มีเขียว WhatsApp ที่ไหน
//    จอนี้ต้องดูเป็นระบบเดียวกับอีก 27 ระบบของร้าน ไม่ใช่แอปคนละตัว
//
// 🔴 มติ D-1 — สถานะการส่งอ่านจาก `ChatMessage.deliveryStatus` เท่านั้น
//    `sendReplyAction` ไม่เคยอ่านค่า `ok` ที่ `sendReply` คืนเลย และ `ok` มีความหมาย 2 แบบ
//    ⇒ ห้ามใช้ผลลัพธ์ของ action มาตัดสินว่า "ส่งสำเร็จไหม"
//    PENDING = 🕐 · SENT = ✓ · SENT + ลูกค้าอ่านแล้ว = ✓✓ · FAILED = ✗ + ปุ่มลองส่งอีกครั้ง

import { useState, useTransition } from "react";
import { translateMessageAction } from "./actions";
import { saveAnswerExampleAction } from "./actions";
import { retrySendAction } from "./inbox-actions";
import type { ThreadMessage } from "./inbox-actions";

const TZ = "Asia/Bangkok";

/**
 * คีย์ "วันไหน" ตามเวลาไทย — 🔴 ห้ามใช้ `getDay()`/`toDateString()` ของเครื่อง
 * เซิร์ฟเวอร์รันบน UTC ⇒ ข้อความตอน 04:00 น. ของไทยจะถูกนับเป็นเมื่อวาน (คลาดไป 1 วันทั้งวัน)
 */
export function dayKey(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

/** ป้ายตัวคั่นวันที่ — วันนี้ / เมื่อวาน / วันที่แบบไทย */
export function dayLabel(ts: number, now: number = Date.now()): string {
  const k = dayKey(ts);
  if (k === dayKey(now)) return "วันนี้";
  if (k === dayKey(now - 86_400_000)) return "เมื่อวาน";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ts));
}

export const timeLabel = (ts: number) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));

export function DateDivider({ ts }: { ts: number }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-0.5 text-[11px] text-[color:var(--color-muted)]">
        {dayLabel(ts)}
      </span>
    </div>
  );
}

/** เหตุผลที่ส่งไม่สำเร็จ เป็นภาษาคน — 🔴 ห้ามโทษผู้ใช้ ต้องบอกว่าทำอะไรต่อได้ */
export function failReasonLabel(reason: string | null): string {
  switch (reason) {
    case "TOKEN_EXPIRED":
      return "การเชื่อมต่อช่องทางหลุด — เชื่อมใหม่ที่หน้า “เชื่อมช่องทาง” แล้วกดส่งอีกครั้ง";
    case "RATE_LIMITED":
      return "ช่องทางจำกัดจำนวนข้อความชั่วคราว — รอสักครู่แล้วกดส่งอีกครั้ง";
    case "CHANNEL_DISCONNECTED":
      return "ช่องทางนี้ถูกถอดออกจากร้าน — เชื่อมกลับก่อนจึงจะส่งได้";
    case "NETWORK_ERROR":
      return "เครือข่ายขัดข้องระหว่างส่ง — กดส่งอีกครั้งได้เลย";
    default:
      return "ส่งไม่ถึงปลายทาง — กดส่งอีกครั้งได้เลย";
  }
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * ติ๊กสถานะการส่ง — คำนวณจากแถวข้อความล้วน ๆ (D-1)
 * แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้อ่าน/ทดสอบตรรกะได้โดยไม่ต้องเรนเดอร์
 */
export function deliveryMark(
  msg: Pick<ThreadMessage, "deliveryStatus" | "createdAt">,
  customerLastReadAt: number | null,
): { mark: string; title: string; failed: boolean } {
  if (msg.deliveryStatus === "FAILED") return { mark: "✗", title: "ส่งไม่สำเร็จ", failed: true };
  if (msg.deliveryStatus === "PENDING") return { mark: "🕐", title: "กำลังส่ง", failed: false };
  if (customerLastReadAt !== null && customerLastReadAt >= msg.createdAt) {
    return { mark: "✓✓", title: "ลูกค้าอ่านแล้ว", failed: false };
  }
  return { mark: "✓", title: "ส่งแล้ว", failed: false };
}

export function MessageBubble({
  systemId,
  conversationId,
  msg,
  senderLabel,
  customerLastReadAt,
  canTranslate,
  canSaveExample,
}: {
  systemId: string;
  conversationId: string;
  msg: ThreadMessage;
  senderLabel: string;
  /** ลูกค้าอ่านถึงเวลาไหน — null = ยังไม่เคยอ่าน (ติ๊กเดียว) */
  customerLastReadAt: number | null;
  canTranslate: boolean;
  canSaveExample: boolean;
}) {
  const [translated, setTranslated] = useState<string | null>(msg.translatedBody);
  const [translateErr, setTranslateErr] = useState<string | null>(null);
  const [retryErr, setRetryErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (msg.type === "SYSTEM") {
    return (
      <div className="my-1 text-center text-xs text-[color:var(--color-muted)]">{msg.body}</div>
    );
  }

  const out = msg.direction === "OUT";
  const status = out && !msg.isInternal ? deliveryMark(msg, customerLastReadAt) : null;

  const translate = () => {
    setTranslateErr(null);
    startTransition(async () => {
      const res = await translateMessageAction(systemId, msg.id);
      if (res.ok) setTranslated(res.text);
      else setTranslateErr(res.reason);
    });
  };

  const retry = () => {
    setRetryErr(null);
    startTransition(async () => {
      const res = await retrySendAction(systemId, conversationId, msg.id);
      if (!res.ok) setRetryErr(res.reason ?? "ส่งอีกครั้งไม่สำเร็จ");
    });
  };

  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`relative max-w-[85%] sm:max-w-[70%] ${out ? "mr-2" : "ml-2"}`}>
        {/* หางฟองแบบ WhatsApp — สามเหลี่ยมเล็กที่มุมบนของฝั่งตัวเอง */}
        <span
          aria-hidden
          className={`absolute top-0 size-0 border-[7px] border-transparent ${
            out
              ? "-right-3 border-l-[color:var(--color-surface-2)] border-t-[color:var(--color-surface-2)]"
              : "-left-3 border-r-[color:var(--color-surface)] border-t-[color:var(--color-surface)]"
          }`}
        />
        <div
          className={[
            "rounded-lg border px-3 py-1.5 text-sm shadow-[0_1px_0_rgba(0,0,0,0.04)]",
            out
              ? "rounded-tr-none bg-[color:var(--color-surface-2)]"
              : "rounded-tl-none bg-[color:var(--color-surface)]",
            msg.isInternal ? "border-dashed" : "border-[color:var(--color-line)]",
            status?.failed ? "border-[color:var(--color-danger)]" : "",
          ].join(" ")}
        >
          {msg.isInternal && (
            <div className="text-[10px] font-medium text-[color:var(--color-muted)]">
              โน้ตภายใน (ลูกค้าไม่เห็น)
            </div>
          )}

          {msg.attachments.length > 0 && (
            <div className="mb-1 flex flex-col gap-1">
              {msg.attachments.map((a) =>
                a.mimeType.startsWith("image/") ? (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt={a.fileName}
                      className="max-h-56 rounded border border-[color:var(--color-line)] object-cover"
                    />
                  </a>
                ) : (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded border border-[color:var(--color-line)] px-2 py-1 text-xs underline"
                  >
                    <span aria-hidden>📄</span>
                    <span className="min-w-0 truncate">{a.fileName}</span>
                    <span className="shrink-0 text-[color:var(--color-muted)]">{kb(a.sizeBytes)}</span>
                  </a>
                ),
              )}
            </div>
          )}

          {msg.body && <div className="whitespace-pre-wrap break-words">{msg.body}</div>}

          {/* 🔴 คำแปลอยู่ **ใต้** ต้นฉบับเสมอ ไม่ทับ — ต้นฉบับคือหลักฐาน คำแปลผิดได้ */}
          {translated && (
            <div className="mt-1 border-t border-dashed border-[color:var(--color-line)] pt-1 text-[13px] text-[color:var(--color-ink-soft)]">
              <span className="text-[10px] text-[color:var(--color-muted)]">คำแปล</span>
              <div className="whitespace-pre-wrap break-words">{translated}</div>
            </div>
          )}

          <div className="mt-0.5 flex items-center justify-end gap-2 text-[10px] text-[color:var(--color-muted)]">
            <span>{out ? senderLabel : "ลูกค้า"}</span>
            <span>{timeLabel(msg.createdAt)}</span>
            {status && (
              <span
                title={status.title}
                className={status.failed ? "text-[color:var(--color-danger)]" : ""}
              >
                {status.mark}
              </span>
            )}
          </div>
        </div>

        {/* แถบเครื่องมือใต้ฟอง — โผล่เฉพาะเมื่อมีของให้กดจริง */}
        <div className={`mt-0.5 flex flex-wrap items-center gap-2 text-[11px] ${out ? "justify-end" : ""}`}>
          {canTranslate && !translated && (msg.body ?? "").trim() !== "" && (
            <button type="button" onClick={translate} disabled={pending} className="underline text-[color:var(--color-muted)]">
              {pending ? "กำลังแปล…" : "แปลข้อความ"}
            </button>
          )}
          {status?.failed && (
            <button type="button" onClick={retry} disabled={pending} className="underline text-[color:var(--color-danger)]">
              {pending ? "กำลังส่ง…" : "ลองส่งอีกครั้ง"}
            </button>
          )}
          {canSaveExample && out && !msg.isInternal && (msg.body ?? "").trim() !== "" && (
            <form action={saveAnswerExampleAction}>
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="conversationId" value={conversationId} />
              <input type="hidden" name="messageId" value={msg.id} />
              <button type="submit" className="underline text-[color:var(--color-muted)]">
                บันทึกเป็นตัวอย่างคำตอบ
              </button>
            </form>
          )}
        </div>

        {status?.failed && (
          <p className="mt-0.5 text-right text-[11px] text-[color:var(--color-danger)]" role="alert">
            {failReasonLabel(msg.deliveryError)}
          </p>
        )}
        {translateErr && (
          <p className="mt-0.5 text-[11px] text-[color:var(--color-danger)]" role="alert">
            {translateErr}
          </p>
        )}
        {retryErr && (
          <p className="mt-0.5 text-[11px] text-[color:var(--color-danger)]" role="alert">
            {retryErr}
          </p>
        )}
      </div>
    </div>
  );
}
