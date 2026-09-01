"use client";

// context-panel.tsx — คอลัมน์บริบทลูกค้า (เดสก์ท็อป · WO-CV7 · แบบร่าง `ref-desktop.png` คอลัมน์ขวา `.dcol3`)
//
// 🔴 สัญญากับสาย E (ห้ามเปลี่ยน): ชื่อ export `ContextPanel` + props `systemId/conversationId/onInsertText`
//    สาย E วางช่องนี้ไว้ในคอลัมน์ที่ 3 ของ `inbox-client.tsx` แล้ว — เปลี่ยนชื่อ = หน้าจอพัง
//
// 🔴 กติกาของคอลัมน์นี้ (มติ D1 + V2 + V3)
//    1. **ไม่มีค่า = ซ่อนบรรทัดทิ้ง** ห้ามโชว์ป้ายเปล่า/ขีดกลาง/undefined
//       (ป้ายเปล่าทำให้ทีมเข้าใจว่า "ระบบพัง" ทั้งที่ความจริงคือ "ลูกค้าไม่ได้ส่งข้อมูลนั้นมา")
//    2. `meta.pageUrl` เป็น **path** ⇒ แปลงผ่านทะเบียนเดียว `pageLabelFromPath` เท่านั้น
//       ห้ามมีทะเบียนเส้นทางชุดที่ 2 ในไฟล์นี้ · ห้ามพึ่ง `pageTitle` (ฝั่งลูกค้าไม่ได้ส่งมา)
//    3. ไอคอนมาจากทะเบียน `<Icon>` เท่านั้น — ห้าม emoji ห้ามวาด `<svg>` สดในไฟล์นี้
//    4. เวลาเป็นเขตเวลาไทยเสมอ (Vercel รันบน UTC — `getDay()`/`toDateString()` จะเพี้ยน 1 วัน)
//    5. ของที่ "มีอยู่แล้ว" ต้องใช้ซ้ำ ไม่เขียนใหม่: ผูกสมาชิก = `linkCustomerAction` ·
//       ป้ายกำกับ = `setConversationTagAction` (สาย D) · คลังคำตอบ = `searchAnswerExamples`
//
// ⚠️ โทเคนสีในไฟล์นี้เขียนเป็นค่าฮาร์ดจากแบบร่าง (§2 ของแผน: `--muted #71767f` · `--line #e8e9ed`
//    · พื้นคอลัมน์ `#fbfbfc`) ซึ่ง **ไม่ตรงกับตัวแปรใน `globals.css` เป๊ะ** (#737373 / #e5e5e5)
//    ⇒ รายงานให้ Fable ตัดสินแล้ว: ถ้าเลือกยึด globals.css ให้เปลี่ยนทั้งชุดพร้อมกัน ไม่ใช่ทีละไฟล์

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { ChannelBadge, channelLabel } from "./channel-icon";
import { Icon } from "./icons";
import { getConversationContextAction, type ConversationContext } from "./inbox-actions";
import { linkCustomerAction } from "./actions";
import { pageLabelFromPath } from "./page-label";
import { setConversationTagAction } from "./quick-reply-actions";

export type ContextPanelProps = {
  systemId: string;
  conversationId: string;
  /** วางข้อความลงกล่องพิมพ์ของห้องนี้ (สาย E ต่อให้) */
  onInsertText?: (text: string) => void;
};

// ───────────────────────── เวลา (เขตเวลาไทยเสมอ) ─────────────────────────

const TZ = "Asia/Bangkok";
const DAY_MS = 24 * 60 * 60 * 1000;

/** คีย์วันแบบ `YYYY-MM-DD` **ตามเวลาไทย** — ใช้เทียบ "วันเดียวกันไหม" (ห้ามใช้ getDay/toDateString) */
const dayKey = (ts: number) => new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ });

const timeOf = (ts: number) =>
  new Date(ts).toLocaleTimeString("th-TH", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** "วันนี้ 09:10" · "เมื่อวาน 21:40" · "5 ก.ย. 69 08:20" — null เมื่อไม่มีค่า (ซ่อนบรรทัด) */
function whenLabel(ts: number | null): string | null {
  if (ts === null) return null;
  const now = Date.now();
  const k = dayKey(ts);
  if (k === dayKey(now)) return `วันนี้ ${timeOf(ts)}`;
  if (k === dayKey(now - DAY_MS)) return `เมื่อวาน ${timeOf(ts)}`;
  const d = new Date(ts).toLocaleDateString("th-TH", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
  return `${d} ${timeOf(ts)}`;
}

/** "วันนี้" · "เมื่อวาน" · "5 ก.ย. 69" — ใช้ต่อท้ายประโยค "ทักครั้งแรก…" ในการ์ดประวัติ */
function dayWord(ts: number | null): string | null {
  const full = whenLabel(ts);
  if (full === null) return null;
  return full.replace(/ \d{2}:\d{2}$/, "");
}

/**
 * เกณฑ์ "ตอบเร็ว" = ขึ้นสีเขียว `#15803d`
 *
 * 🔴 ที่มาของตัวเลข (ไม่ใช่ความรู้สึก): แบบร่างวาด **"4 นาที" เป็นสีเขียว** ⇒ เกณฑ์ต้องกว้างกว่า 4
 *    เลือก 5 นาทีเพราะเป็นเลขกลมที่ทีมจำได้ และเป็นช่วงที่ลูกค้าส่วนใหญ่ยังค้างอยู่หน้าจอเดิม
 *    (หน้าแชทฝั่งลูกค้ายัง poll อยู่) ⇒ ตอบภายในนี้ = ลูกค้าได้คำตอบขณะยังสนใจอยู่
 *    ช้ากว่านี้ไม่ได้แปลว่า "แย่" จึงแค่ไม่ย้อมเขียว ไม่ย้อมแดง (ตัวเลขนี้เป็นกำลังใจ ไม่ใช่ใบสั่ง)
 */
const FAST_REPLY_MS = 5 * 60_000;

/** ระยะเวลาที่คนอ่านออก — "ไม่ถึง 1 นาที" · "4 นาที" · "2 ชม. 5 นาที" · "3 วัน" */
function durationLabel(msDiff: number): string {
  if (msDiff < 60_000) return "ไม่ถึง 1 นาที";
  const mins = Math.round(msDiff / 60_000);
  if (mins < 60) return `${mins} นาที`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rest = mins % 60;
    return rest === 0 ? `${hours} ชม.` : `${hours} ชม. ${rest} นาที`;
  }
  return `${Math.floor(hours / 24)} วัน`;
}

// ───────────────────────── "เข้ามาจาก" ─────────────────────────

/**
 * ทำค่า referrer/utm ให้อ่านง่ายขึ้นโดย **ไม่แต่งข้อมูล**
 * URL → ชื่อโดเมน (ตัด `www.`) · ไม่ใช่ URL → คืนค่าที่เก็บไว้ตรง ๆ
 * 🔴 ไม่แปลงเป็นชื่อแบรนด์ (`google.com` → "Google") เพราะนั่นคือการเดาแทนข้อมูลจริง
 */
function sourceLabel(raw: string | null): string | null {
  if (raw === null) return null;
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    return new URL(raw).hostname.replace(/^www\./i, "");
  } catch {
    return raw;
  }
}

// ───────────────────────── ชิ้นส่วนหน้าตา (ตามแบบร่าง `.dsec` / `.dcard` / `.kv` / `.tag` / `.qr`) ─────────────────────────

/** หัวหมวด — แบบร่าง `.dsec` (11px หนา 700 สีรอง) */
function Sec({ children }: { children: ReactNode }) {
  return (
    <div className="mb-[7px] mt-[15px] text-[11px] font-bold tracking-[0.03em] text-[#71767f]">
      {children}
    </div>
  );
}

/** การ์ด — แบบร่าง `.dcard` (มุม 11px เส้น 1px พื้นขาว) */
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[11px] border border-[#e8e9ed] bg-white px-3 py-[10px] text-[13px] ${className}`}
    >
      {children}
    </div>
  );
}

/** แถวชื่อ-ค่า — แบบร่าง `.kv` · `value` เป็น null = **ไม่เรนเดอร์แถวนี้เลย** (กติกาข้อ 1) */
function Kv({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string | null;
  valueClassName?: string;
}) {
  if (value === null) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-[3.5px] text-[12.5px] text-[#4b5563]">
      <span className="shrink-0">{label}</span>
      {/* 🔴 เลือกคลาสสีทั้งก้อน ไม่ต่อท้าย — คลาสสี 2 ตัวในแอตทริบิวต์เดียว ตัวที่ชนะคือ
          ตัวที่อยู่หลังใน "ไฟล์ CSS" ไม่ใช่ตัวที่อยู่หลังในสตริง ⇒ ต่อท้ายแล้วสีอาจไม่เปลี่ยน */}
      <b
        className={`min-w-0 truncate text-right font-semibold ${
          valueClassName === "" ? "text-[#0f172a]" : valueClassName
        }`}
      >
        {value}
      </b>
    </div>
  );
}

const initialOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

// ───────────────────────── ตัวคอลัมน์ ─────────────────────────

export function ContextPanel({ systemId, conversationId, onInsertText }: ContextPanelProps) {
  const [ctx, setCtx] = useState<ConversationContext | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [showLink, setShowLink] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    if (!systemId || !conversationId) {
      setCtx(null);
      setState("ready");
      return;
    }
    try {
      const data = await getConversationContextAction(systemId, conversationId);
      setCtx(data);
      setState("ready");
    } catch {
      // 🔴 ข้อความนี้ห้ามโทษผู้ใช้ — เขาไม่ได้ทำอะไรผิด ระบบต่างหากที่อ่านข้อมูลไม่ได้รอบนี้
      setState("error");
    }
  }, [systemId, conversationId]);

  useEffect(() => {
    // เปลี่ยนห้อง = ล้างของเก่าก่อนเสมอ ไม่งั้นจะเห็นบริบทของลูกค้าคนก่อนค้างอยู่ 1 จังหวะ
    setCtx(null);
    setState("loading");
    setShowLink(false);
    setShowAddTag(false);
    setTagDraft("");
    setTagError(null);
    void load();
  }, [load]);

  const toggleTag = (tag: string, on: boolean) => {
    setTagError(null);
    startTransition(async () => {
      const res = await setConversationTagAction(systemId, conversationId, tag, on);
      if (!res.ok) {
        setTagError(res.reason ?? "บันทึกป้ายกำกับไม่สำเร็จ ลองอีกครั้งในอีกสักครู่");
        return;
      }
      setTagDraft("");
      setShowAddTag(false);
      setCtx((prev) => (prev ? { ...prev, tags: res.tags ?? prev.tags } : prev));
    });
  };

  const shell = "w-full shrink-0 border-l border-[#e8e9ed] bg-[#fbfbfc] p-[15px] lg:w-[280px]";

  if (state === "loading") {
    return (
      <aside className={shell} aria-busy="true">
        <div className="text-[12px] text-[#71767f]">กำลังโหลดข้อมูลลูกค้า…</div>
      </aside>
    );
  }

  if (state === "error") {
    return (
      <aside className={shell}>
        <div className="text-[12px] text-[#71767f]">
          ยังโหลดข้อมูลลูกค้าไม่ได้ในตอนนี้
          <button type="button" onClick={() => void load()} className="ml-2 underline">
            ลองอีกครั้ง
          </button>
        </div>
      </aside>
    );
  }

  if (!ctx) {
    return (
      <aside className={shell}>
        <div className="text-[12px] text-[#71767f]">เลือกห้องแชทเพื่อดูข้อมูลลูกค้า</div>
      </aside>
    );
  }

  const pageLabel = pageLabelFromPath(ctx.pageUrl);
  const from = sourceLabel(ctx.referrer);
  const firstAsk = whenLabel(ctx.firstCustomerMessageAt);

  // "ตอบครั้งแรกใน" — 3 สถานะ: ยังไม่มีคำถาม (ซ่อน) · ตอบแล้ว (ตัวเลข) · ยังไม่ตอบ (บอกตรง ๆ)
  let replyText: string | null = null;
  let replyFast = false;
  if (ctx.firstCustomerMessageAt !== null) {
    if (ctx.firstResponseAt === null) {
      replyText = "ยังไม่ได้ตอบ";
    } else {
      const diff = Math.max(0, ctx.firstResponseAt - ctx.firstCustomerMessageAt);
      replyText = durationLabel(diff);
      replyFast = diff <= FAST_REPLY_MS;
    }
  }

  const hasContextCard =
    pageLabel !== null || from !== null || firstAsk !== null || replyText !== null;
  // สถานะสมาชิกในบรรทัดสรุป — ร้านที่ยังไม่ได้เชื่อมระบบสมาชิกเลย ไม่ต้องบอกว่า "ยังไม่ผูก"
  // (มันไม่ใช่สิ่งที่เขาลืมทำ แต่เป็นของที่เขายังไม่ได้เปิดใช้ ⇒ ขึ้นไปก็ไม่มีอะไรให้กด)
  const memberLine =
    ctx.memberName ??
    (ctx.customerId !== null
      ? "ผูกสมาชิกแล้ว"
      : ctx.memberSystemLinked
        ? "ยังไม่ผูกสมาชิก"
        : null);
  const summary = [channelLabel(ctx.channel), ctx.lang, memberLine]
    .filter((x): x is string => x !== null && x !== "")
    .join(" · ");

  return (
    <aside className={shell}>
      {/* ── โปรไฟล์ + ผูกสมาชิก (แบบร่าง: avatar 60px มุม 18px + แบดจ์ช่องทาง) ── */}
      <div className="flex flex-col items-center gap-2 px-0 pb-[2px] pt-[6px]">
        <span className="relative shrink-0">
          <span className="grid size-[60px] place-items-center rounded-[18px] bg-[#f4f5f7] text-[22px] font-bold text-[#71767f]">
            {initialOf(ctx.title)}
          </span>
          <ChannelBadge type={ctx.channel} title={`ทักมาจาก ${channelLabel(ctx.channel)}`} />
        </span>
        <div className="max-w-full truncate text-[15.5px] font-bold text-[#0f172a]">{ctx.title}</div>
        <div className="max-w-full truncate text-[12px] text-[#71767f]">{summary}</div>

        {ctx.canLinkMember && ctx.memberSystemLinked && ctx.customerId === null ? (
          showLink ? (
            // ผูกสมาชิกใช้ **action ตัวเดิม** (`linkCustomerAction`) — ไม่มีเส้นทางผูกสมาชิกชุดที่ 2
            <form
              action={linkCustomerAction}
              className="flex w-full flex-col items-stretch gap-1.5 pt-1"
            >
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="conversationId" value={conversationId} />
              <input type="hidden" name="contactId" value={ctx.contactId} />
              <input
                name="phone"
                required
                inputMode="tel"
                aria-label="เบอร์โทรลูกค้า"
                placeholder="เบอร์โทรลูกค้า"
                defaultValue={ctx.phone ?? ""}
                className="input h-8 py-0 text-[12px]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-[#eaf0fe] px-[9px] py-1 text-[11.5px] font-semibold text-[#1d4ed8]"
                >
                  <Icon name="userplus" size="sm" />
                  ผูกกับสมาชิก
                </button>
                <button
                  type="button"
                  onClick={() => setShowLink(false)}
                  className="text-[11.5px] text-[#71767f] underline"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowLink(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#eaf0fe] px-[9px] py-1 text-[11.5px] font-semibold text-[#1d4ed8]"
            >
              <Icon name="userplus" size="sm" />
              ผูกกับสมาชิก
            </button>
          )
        ) : null}
      </div>

      {/* ── บริบทตอนนี้ ── */}
      {hasContextCard ? (
        <>
          <Sec>บริบทตอนนี้</Sec>
          <Card>
            <Kv label="กำลังดูหน้า" value={pageLabel} />
            <Kv label="เข้ามาจาก" value={from} />
            <Kv label="ทักครั้งแรก" value={firstAsk} />
            <Kv
              label="ตอบครั้งแรกใน"
              value={replyText}
              valueClassName={replyFast ? "text-[#15803d]" : ""}
            />
          </Card>
        </>
      ) : null}

      {/* ── ป้ายกำกับ (ใช้ action ของสาย D — ไม่มีตรรกะติดป้ายชุดที่ 2) ── */}
      <Sec>ป้ายกำกับ</Sec>
      <div className="flex flex-wrap items-center">
        {ctx.tags.map((t) => (
          <button
            key={t}
            type="button"
            disabled={!ctx.canTag || pending}
            onClick={() => toggleTag(t, false)}
            title={ctx.canTag ? `ถอดป้าย ${t}` : undefined}
            className="mb-[5px] mr-1 inline-flex items-center gap-1 rounded-lg bg-[#f4f5f7] px-[9px] py-1 text-[11.5px] text-[#4b5563] disabled:opacity-70"
          >
            <Icon name="tag" size="sm" />
            {t}
          </button>
        ))}
        {ctx.canTag && !showAddTag ? (
          <button
            type="button"
            onClick={() => setShowAddTag(true)}
            className="mb-[5px] mr-1 inline-flex items-center gap-1 rounded-lg bg-[#f4f5f7] px-[9px] py-1 text-[11.5px] text-[#9ca2ac]"
          >
            <Icon name="plus" size="sm" />
            เพิ่ม
          </button>
        ) : null}
        {ctx.tags.length === 0 && !ctx.canTag ? (
          <span className="text-[11.5px] text-[#71767f]">ยังไม่มีป้ายกำกับ</span>
        ) : null}
      </div>

      {ctx.canTag && showAddTag ? (
        <div className="mt-1 flex items-center gap-1.5">
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tagDraft.trim() !== "") toggleTag(tagDraft.trim(), true);
              if (e.key === "Escape") setShowAddTag(false);
            }}
            list={`ctx-tags-${conversationId}`}
            placeholder="เช่น รอโอนมัดจำ"
            aria-label="ป้ายกำกับใหม่"
            className="input h-8 flex-1 py-0 text-[12px]"
          />
          <datalist id={`ctx-tags-${conversationId}`}>
            {ctx.tagSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button
            type="button"
            disabled={pending || tagDraft.trim() === ""}
            onClick={() => toggleTag(tagDraft.trim(), true)}
            className="rounded-lg bg-[#f4f5f7] px-[9px] py-1 text-[11.5px] text-[#4b5563] disabled:opacity-60"
          >
            ติดป้าย
          </button>
        </div>
      ) : null}
      {tagError === null ? null : (
        // แจ้งตรงจุดที่เกิดเรื่อง (inline) ไม่ใช่กล่องเด้ง — และไม่โทษคนกด
        <div className="mt-1 text-[11.5px] text-[#b91c1c]">{tagError}</div>
      )}

      {/* ── คำตอบที่ทีมใช้บ่อยกับคำถามนี้ · ไม่มีรายการ = ซ่อนทั้งหมวด ── */}
      {ctx.answers.length > 0 && (
        <>
          <Sec>คำตอบที่ทีมใช้บ่อยกับคำถามนี้</Sec>
          {ctx.answers.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onInsertText?.(a.answer)}
              title={a.question}
              className="mb-[6px] flex w-full items-center gap-2 rounded-[9px] border border-[#e8e9ed] bg-white px-[10px] py-2 text-left text-[12.5px] text-[#374151]"
            >
              <span className="shrink-0 text-[#71767f]">
                <Icon name="quick" size="sm" />
              </span>
              <span className="min-w-0 truncate">{a.answer}</span>
            </button>
          ))}
        </>
      )}

      {/* ── ประวัติการจอง ── */}
      <Sec>ประวัติ</Sec>
      {ctx.bookings.length > 0 ? (
        <div className="flex flex-col gap-[6px]">
          {ctx.bookings.map((b) => (
            <Card key={b.id} className="flex items-center gap-2">
              <span className="shrink-0 text-[#71767f]">
                <Icon name="history" size="sm" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#374151]">
                {b.kindLabel} · {b.title}
              </span>
              <span className="shrink-0 text-[11.5px] text-[#71767f]">
                {dayWord(b.at) ?? ""}
              </span>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="flex items-center gap-2 text-[#71767f]">
          <span className="shrink-0">
            <Icon name="history" size="sm" />
          </span>
          <span className="min-w-0">
            ยังไม่เคยจอง
            {dayWord(ctx.firstCustomerMessageAt) === null
              ? ""
              : ` — ทักครั้งแรก${dayWord(ctx.firstCustomerMessageAt)}`}
          </span>
        </Card>
      )}
    </aside>
  );
}
