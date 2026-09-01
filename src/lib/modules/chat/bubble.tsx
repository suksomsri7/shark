"use client";

// bubble.tsx — ฟองข้อความ · ตัวคั่นวันที่ · ตัวบอก "กำลังพิมพ์" ของห้องแชท
//               (WO-CV4 · แบบร่าง `docs/design/chat-v2/mockup.html` จอ 2 + `.dcol2`)
//
// 🔴 แบบร่างคือสัญญา (มติ V3) — โทเคนทุกตัวยกมาตรง ๆ:
//    ฟองมุม 14px · **มุมที่ติดหางของก้อน 4px** · ขาออก `--out` · โน้ต `--note` + เส้น `--note-line`
//    ชื่อผู้ส่ง (`.who`) อยู่ **นอกฟอง** เหนือก้อนแรกของกลุ่ม ไม่ใช่ในแถวเวลาใต้ฟองแบบของเดิม
//
// 🔴 มติ V2 "ห้ามมี emoji" — ของเดิมใช้ ✓ ✓✓ ✗ 🕐 📄 เป็นไอคอนสถานะ
//    emoji เปลี่ยนรูปตามเครื่องลูกค้า ปรับสีไม่ได้ และโปรแกรมอ่านหน้าจออ่านเป็นชื่อยาว ๆ กลางประโยค
//    ⇒ ทุกไอคอนมาจากทะเบียน `<Icon name="…"/>` เท่านั้น
//
// 🔴 มติ D-1 — สถานะการส่งอ่านจาก `ChatMessage.deliveryStatus` เท่านั้น
//    PENDING = นาฬิกา · SENT = ติ๊กเดี่ยว · ลูกค้าอ่านแล้ว = ติ๊กคู่ · FAILED = กากบาท + ปุ่มลองใหม่

import { useRef, useState, useTransition } from "react";
import { translateMessageAction } from "./actions";
import { saveAnswerExampleAction } from "./actions";
import { retrySendAction } from "./inbox-actions";
import type { ThreadMessage } from "./inbox-actions";
import { Icon, type IconName } from "./icons";
import { formatDuration } from "./list-filters";

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

/** ตัวคั่นวันที่แบบ "เม็ดยา" ลอยกลางจอ (แบบร่าง `.day span`) */
export function DateDivider({ ts }: { ts: number }) {
  return (
    <div className="mb-3 mt-1 flex justify-center">
      <span className="rounded-lg bg-white/90 px-3 py-[3px] text-[11px] text-[#5b616b] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        {dayLabel(ts)}
      </span>
    </div>
  );
}

/**
 * "กำลังพิมพ์" = ฟองเปล่ามี 3 จุดเต้น (แบบร่าง `.typing`)
 * 🔴 ตั้งใจไม่ใส่ตัวหนังสือ — แบบร่างวาดเป็นจุดล้วน และข้อความยาว ๆ จะดันฟองจริงกระโดดทุกครั้ง
 */
/**
 * สามจุด "กำลังพิมพ์" — ต้องบอกว่า **ใคร** พิมพ์ (มติ D20)
 * 🔴 สัญญาณวันนี้มาจาก**ทีมงาน**เท่านั้น (ลูกค้าต้องต่อข้ามรีโป) — ถ้าวาดชิดซ้ายเป็นฟองขาเข้าเสมอ
 *    เพื่อนร่วมทีมพิมพ์ จอจะบอกว่าลูกค้าพิมพ์ ⇒ ทีมงาน = ชิดขวา + ชื่อ · ลูกค้า = ชิดซ้ายแบบเดิม
 */
export function TypingBubble({ who }: { who?: { name: string } | null } = {}) {
  const staff = !!who;
  return (
    <div className={`mb-2.5 flex ${staff ? "justify-end" : "justify-start"}`}>
      <div
        data-qc="typing"
        className={`flex w-fit items-center gap-1.5 rounded-[14px] px-3.5 py-[11px] shadow-[0_1px_1.5px_rgba(15,23,42,0.08)] ${
          staff ? "rounded-tr-[4px] bg-[color:var(--color-out)]" : "rounded-tl-[4px] bg-[color:var(--color-surface)]"
        }`}
        role="status"
        aria-label={staff ? `${who.name} กำลังพิมพ์` : "ลูกค้ากำลังพิมพ์"}
      >
        {staff && <span className="mr-0.5 text-[11px] text-[color:var(--color-muted)]">{who.name} กำลังพิมพ์</span>}
        <span className="size-1.5 animate-bounce rounded-full bg-[#c6cad1] [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[#b2b7bf] [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[#9ea4ad] [animation-delay:300ms]" />
      </div>
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

const kb = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * ติ๊กสถานะการส่ง — คำนวณจากแถวข้อความล้วน ๆ (D-1)
 * แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้อ่าน/ทดสอบตรรกะได้โดยไม่ต้องเรนเดอร์
 * คืน **ชื่อไอคอนในทะเบียน** ไม่ใช่ตัวอักษร (มติ V2)
 */
export function deliveryMark(
  msg: Pick<ThreadMessage, "deliveryStatus" | "createdAt">,
  customerLastReadAt: number | null,
): { icon: IconName; title: string; failed: boolean; read: boolean } {
  if (msg.deliveryStatus === "FAILED") {
    return { icon: "xcircle", title: "ส่งไม่สำเร็จ", failed: true, read: false };
  }
  if (msg.deliveryStatus === "PENDING") {
    return { icon: "clock", title: "กำลังส่ง", failed: false, read: false };
  }
  if (customerLastReadAt !== null && customerLastReadAt >= msg.createdAt) {
    return { icon: "check2", title: "ลูกค้าอ่านแล้ว", failed: false, read: true };
  }
  return { icon: "check", title: "ส่งแล้ว", failed: false, read: false };
}

/**
 * ความสูงแท่งคลื่นเสียง — ยกจากแบบร่างตรง ๆ
 * 🔴 ตายตัวโดยตั้งใจ ห้ามสุ่ม: ค่าสุ่มฝั่ง client ทำให้ HTML ที่เซิร์ฟเวอร์ส่งมาไม่ตรงกับที่จอวาด
 *    (hydration mismatch) และคลื่นจะกระตุกใหม่ทุกรอบ poll
 */
const WAVE = [6, 12, 18, 22, 14, 9, 16, 20, 11, 7, 13, 17, 8, 15, 21, 10];

/** ฟองข้อความเสียง (แบบร่าง `.voice`) — ปุ่มเล่น + คลื่น + ความยาว */
function VoiceBody({ url, durationMs }: { url: string | null; durationMs: number | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div data-qc="bubble-voice" className="flex min-w-[180px] items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? "หยุดเล่นข้อความเสียง" : "เล่นข้อความเสียง"}
        // ⚠️ ทะเบียนไอคอนยังไม่มี `pause` — ระหว่างเล่นจึงบอกสถานะด้วยวงแหวนรอบปุ่มแทน
        //    (ห้ามวาด svg เองในไฟล์นี้ · แจ้ง Fable ให้เพิ่มไอคอนไว้ในรายงานแล้ว)
        className={`grid size-7 shrink-0 place-items-center rounded-full bg-[color:var(--color-accent)] text-white disabled:opacity-50 ${
          playing ? "ring-2 ring-[color:var(--color-accent)]/35" : ""
        }`}
      >
        <Icon name="play" size="sm" className="ml-[1px]" />
      </button>
      <span aria-hidden className="flex h-[22px] flex-1 items-center gap-[2px]">
        {WAVE.map((h, i) => (
          <span key={i} className="w-[2.5px] rounded-sm bg-[#9fb0dd]" style={{ height: `${h}px` }} />
        ))}
      </span>
      <span className="shrink-0 text-[11px] text-[color:var(--color-muted)]">
        {durationMs !== null ? formatDuration(durationMs) : "เสียง"}
      </span>
      {url && (
        <audio
          ref={ref}
          src={url}
          preload="none"
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
}

export function MessageBubble({
  systemId,
  conversationId,
  msg,
  senderName,
  customerLastReadAt,
  canTranslate,
  canSaveExample,
  isGroupStart = true,
  audioMs = null,
}: {
  systemId: string;
  conversationId: string;
  msg: ThreadMessage;
  /**
   * ชื่อคนที่ส่ง (ฝั่งทีม) — ขึ้น **ครั้งเดียวต่อก้อน** เหนือฟองแรก ตามแบบร่าง `.who` ("มุก · ทีมงาน")
   * ผู้เรียกเป็นคนประกอบข้อความเอง เพราะข้อความอัตโนมัติไม่มีเจ้าของ (ต้องขึ้นแค่ "ทีมงาน")
   */
  senderName: string;
  /** ลูกค้าอ่านถึงเวลาไหน — null = ยังไม่เคยอ่าน (ติ๊กเดียว) */
  customerLastReadAt: number | null;
  canTranslate: boolean;
  canSaveExample: boolean;
  /** ฟองแรกของก้อน = มุมติดหาง 4px + ขึ้นชื่อผู้ส่ง · ฟองถัด ๆ ไปมุมมน 14px ทุกมุม */
  isGroupStart?: boolean;
  /** ความยาวคลิปเสียง (ms) จาก `ChatAttachment.durationMs` — ไม่ต้องโหลดไฟล์มาวัดเอง */
  audioMs?: number | null;
}) {
  const [translated, setTranslated] = useState<string | null>(msg.translatedBody);
  const [translateErr, setTranslateErr] = useState<string | null>(null);
  const [retryErr, setRetryErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (msg.type === "SYSTEM") {
    return <div className="my-1 text-center text-xs text-[color:var(--color-muted)]">{msg.body}</div>;
  }

  const out = msg.direction === "OUT";
  const note = msg.isInternal;
  const status = out && !note ? deliveryMark(msg, customerLastReadAt) : null;
  const images = msg.attachments.filter((a) => a.mimeType.startsWith("image/"));
  const audio =
    msg.type === "AUDIO" ? (msg.attachments.find((a) => a.mimeType.startsWith("audio/")) ?? null) : null;
  const others = msg.attachments.filter(
    (a) => !a.mimeType.startsWith("image/") && a.id !== audio?.id,
  );

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

  // มุมของฟอง: มุมที่ "ติดหาง" ของก้อนเท่านั้นที่เป็น 4px (แบบร่าง `.them .bub`/`.me .bub`)
  const corner = !isGroupStart ? "" : out ? "rounded-tr-[4px]" : "rounded-tl-[4px]";
  const skin = note
    ? "bg-[color:var(--color-note)] border border-[color:var(--color-note-line)]"
    : out
      ? "bg-[color:var(--color-out)]"
      : "bg-[color:var(--color-surface)]";

  return (
    <div className={`flex flex-col ${out ? "items-end" : "items-start"}`}>
      {/* ชื่อผู้ส่งอยู่นอกฟอง เหนือก้อน — ขึ้นครั้งเดียวต่อก้อนตามแบบร่าง */}
      {isGroupStart && out && !note && (
        <span className="mx-2 mb-[3px] text-[11.5px] font-semibold text-[color:var(--color-muted)]">
          {senderName}
        </span>
      )}

      {/* `group` = ตัวจุดชนวนให้ปุ่ม "เก็บคำตอบ" โผล่ตอนชี้เมาส์ที่ก้อนข้อความ (ดูแถบเครื่องมือใต้ฟอง) */}
      <div className={`group relative ${note ? "max-w-[86%]" : "max-w-[76%]"} min-w-0`}>
        <div
          data-qc={note ? "bubble-note" : out ? "bubble-out" : "bubble-in"}
          className={[
            "rounded-[14px] px-[11px] pb-[5px] pt-[7px] text-[14.5px] leading-[1.44] shadow-[0_1px_1.5px_rgba(15,23,42,0.08)]",
            corner,
            skin,
            status?.failed ? "ring-1 ring-[color:var(--color-danger)]" : "",
          ].join(" ")}
        >
          {/* ป้ายโน้ตภายใน — กุญแจ + คำเตือนว่าลูกค้าไม่เห็น (แบบร่าง `.notetag`) */}
          {note && (
            <span className="mb-[3px] flex items-center gap-1 text-[10.5px] font-bold text-[color:var(--color-note-ink)]">
              <Icon name="lock" size="sm" strokeWidth={2.1} className="size-3" />
              โน้ตภายใน · ลูกค้าไม่เห็น
            </span>
          )}

          {/* 🔴 ความยาวมากับตัวไฟล์แนบเอง (มติ D16) — prop `audioMs` เหลือไว้เป็นทางถอย
              สำหรับผู้เรียกเดิมที่ยังส่งค่ามาจาก `loadRoomContextAction` เท่านั้น */}
          {audio && <VoiceBody url={audio.url} durationMs={audio.durationMs ?? audioMs} />}

          {images.length > 0 && (
            <div className="-mx-1 mb-1 flex flex-col gap-1">
              {images.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.fileName}
                    className="max-h-56 rounded-[11px] object-cover"
                  />
                </a>
              ))}
            </div>
          )}

          {others.length > 0 && (
            <div className="mb-1 flex flex-col gap-1">
              {others.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-[color:var(--color-line)] bg-white/60 px-2 py-1 text-xs underline"
                >
                  <Icon name="clip" size="sm" className="shrink-0" />
                  <span className="min-w-0 truncate">{a.fileName}</span>
                  <span className="shrink-0 text-[color:var(--color-muted)]">{kb(a.sizeBytes)}</span>
                </a>
              ))}
            </div>
          )}

          {msg.body && <span className="whitespace-pre-wrap break-words">{msg.body}</span>}

          {/* 🔴 คำแปลอยู่ **ใต้** ต้นฉบับเสมอ ไม่ทับ — ต้นฉบับคือหลักฐาน คำแปลผิดได้ */}
          {translated && (
            <span className="mt-1 block border-t border-dashed border-[color:var(--color-line)] pt-1 text-[13px] text-[color:var(--color-ink-soft)]">
              <span className="text-[10px] text-[color:var(--color-muted)]">คำแปล</span>
              <span className="block whitespace-pre-wrap break-words">{translated}</span>
            </span>
          )}

          {/* เวลา + ติ๊ก ลอยชิดขวาล่างในฟอง (แบบร่าง `.stamp` ใช้ float ให้ข้อความไหลรอบ) */}
          <span className="float-right ml-2.5 mt-1.5 inline-flex items-center gap-[3px] text-[10.5px] text-[#8b919b]">
            {timeLabel(msg.createdAt)}
            {status && (
              <Icon
                name={status.icon}
                size="sm"
                strokeWidth={2.2}
                label={status.title}
                className={`size-3.5 ${
                  status.failed
                    ? "text-[color:var(--color-danger)]"
                    : status.read
                      ? "text-[color:var(--color-accent)]"
                      : "text-[#a3a8b1]"
                }`}
              />
            )}
          </span>
          <span className="clear-both block" />
        </div>

        {/* แถบเครื่องมือใต้ฟอง — โผล่เฉพาะเมื่อมีของให้กดจริง */}
        <div className={`mt-0.5 flex flex-wrap items-center gap-2 text-[11px] ${out ? "justify-end" : ""}`}>
          {canTranslate && !translated && (msg.body ?? "").trim() !== "" && (
            <button
              type="button"
              onClick={translate}
              disabled={pending}
              className="underline text-[color:var(--color-muted)]"
            >
              {pending ? "กำลังแปล…" : "แปลข้อความ"}
            </button>
          )}
          {status?.failed && (
            <button
              type="button"
              onClick={retry}
              disabled={pending}
              className="underline text-[color:var(--color-danger)]"
            >
              {pending ? "กำลังส่ง…" : "ลองส่งอีกครั้ง"}
            </button>
          )}
          {/* "เก็บคำตอบ" = บันทึกเป็นตัวอย่างคำตอบ (WO-CW3)
              🔴 ของเดิมเป็นประโยคเต็มขีดเส้นใต้ใต้ฟอง **ทุกฟองขาออก** ⇒ ห้องรกจนอ่านบทสนทนาไม่รู้เรื่อง
                 และแบบร่างไม่มีบรรทัดนี้ · ห้ามตัดฟีเจอร์ทิ้ง จึงลดเสียงรบกวนแทน:
                 · เมาส์ (`pointer: fine`) — ซ่อนไว้ โผล่ตอนชี้ที่ก้อน หรือตอนโฟกัสด้วยคีย์บอร์ด
                   (`focus-within` สำคัญ: ไม่มีมันแล้วคนที่ใช้ Tab จะกดปุ่มที่มองไม่เห็นไม่ได้เลย)
                 · นิ้ว — ไม่มี hover ⇒ ต้องเห็นตลอด แต่ย่อเหลือไอคอน + ป้ายสั้น
              ป้ายเต็มยังอยู่ที่ `title`/`aria-label` เพื่อให้รู้ว่าปุ่มนี้ทำอะไรจริง ๆ */}
          {canSaveExample && out && !note && (msg.body ?? "").trim() !== "" && (
            <form
              action={saveAnswerExampleAction}
              className="transition-opacity [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:focus-within:opacity-100 [@media(pointer:fine)]:group-hover:opacity-100"
            >
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="conversationId" value={conversationId} />
              <input type="hidden" name="messageId" value={msg.id} />
              <button
                type="submit"
                title="บันทึกเป็นตัวอย่างคำตอบ"
                aria-label="บันทึกเป็นตัวอย่างคำตอบ"
                className="flex items-center gap-1 text-[color:var(--color-muted)]"
              >
                <Icon name="bookmark" size="sm" className="size-3.5" />
                เก็บคำตอบ
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
