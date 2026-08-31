"use client";

// chat-notify-client.tsx — แจ้งเตือน "ตอนเปิดหน้าอยู่" ของกล่องแชทลูกค้า (WO-CW5 · PLAN-CHAT-WHATSAPP §7 ข้อ 2-3)
//
// ทำ 4 อย่างเมื่อมีข้อความใหม่เข้ามาในรายการที่ **สาย F ส่งเข้ามา**:
//   1. เสียงเตือนสั้น (ปิดได้ + จำค่าไว้ใน localStorage)
//   2. เลขข้อความค้างบน `document.title` — เห็นได้แม้สลับแท็บไปทำอย่างอื่น
//   3. Web Notification (ถ้าผู้ใช้กดเปิดเอง) เมื่อแท็บถูกซ่อนอยู่
//   4. บอกกลับว่า "ห้องไหนมีของใหม่" ผ่าน `onNewConversations` → สาย F เอาไปทำสัญญาณบนแถว
//
// 🔴 กติกาที่ห้ามผิด
//   • **ห้าม poll เอง** — สาย F มี polling ของตัวเองอยู่แล้ว (§6.4 ทุก 5 วิ) ซ้อนกัน = 2 ชั้น
//     คอมโพเนนต์นี้เป็น "ตัวรับข้อมูล" ล้วน ๆ · ทุกอย่างขับด้วย prop `rows` ที่เปลี่ยนจากภายนอก
//   • **ห้ามขอสิทธิ์แจ้งเตือนตอนเข้าหน้า** — `Notification.requestPermission()` อยู่ใน onClick เท่านั้น
//     (เด้งขอทันทีที่เข้าหน้า = ผู้ใช้กด "บล็อก" แล้วปิดประตูถาวร)
//   • **เล่นเสียงต้อง .catch()** — เบราว์เซอร์บล็อก autoplay ก่อนผู้ใช้มีปฏิสัมพันธ์กับหน้า
//     ปล่อย promise ลอย = error แดงขึ้นคอนโซลทุกข้อความใหม่ ทั้งที่เป็นพฤติกรรมปกติ
//   • ห้องที่ **กำลังเปิดดูอยู่** (`activeConversationId`) ไม่นับเป็นของใหม่ ไม่มีเสียง ไม่ขึ้นเลข

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** เสียงเตือนสั้น 0.1 วิ ฝังเป็น data URI — ไม่ต้องโหลดไฟล์นอก (ไม่พึ่ง CDN · ทำงานตอนเน็ตอืดได้) */
const BEEP_WAV =
  "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgYOEgn54dXd/iZGRiXptZ2x8kJ6fkXljWGB4lautmnpaSlNymbe8pXxVQUpsl7i+qIBYQkhplLa/q4RbQkdlkLO/roheREVhjLHAsYxhRUReiK6/s5BlR0JbhKu/tpRpSEJYgKi+uJdsSkFVfKW+uZtwTUFSeKK8u590T0FPdJ+7vKJ4UkFNcJu5vqV8VUFKbJe4vqiAWEJIaZS2v6uEW0JHZZCzv66IXkRFYYyxwLGMYUVEXoiuv7OQZUdCW4Srv7aUaUhCWICovriXbEpBVXylvrmbcE1BUniivLufdE9BT3Sfu7yieFJBTXCbub6lfFVBSmyXuL6ogFhCSGmUtr+rhFtCR2WQs7+uiF5ERWGMscCxjGFFRF6Irr+zkGVHQluEq7+2lGlIQliAqL64l2xKQVV8pb65m3BNQVJ4ory7n3RPQU90n7u8onhSQU1wm7m+pXxVQUpsl7i+qIBYQkhplLa/q4RbQkdlkLO/roheREVhjLHAsYxhRUReiK6/s5BlR0JbhKu/tpRpSEJYgKi+uJdsSkFVfKW+uZtwTUFSeKK8u590T0FPdJ+7vKJ4UkFNcJu5vqV8VUFKbJe4vqiAWEJIaZS2v6uEW0JHZZCzv66IXkRFYYyxwLGMYUVEXoiuv7OQZUdCW4Srv7aUaUhCWICovriXbEpBVXylvrmbcE1BUniivLufdE9BT3Sfu7yieFJBTXCbub6lfFVCTG2WtbumgFpGTWuSsLinhF9LTmmNq7Wmh2RPUGiJp7KmiWlTU2eGoq6li21YVWaDnaqkjXFcWGaAmaainnRhW2d+laKgj3hlX2h8kZ6dj3ppYml7jpqaj31tZmt6i5aXjn9wam15iJKUjYB0bXB5ho+Ri4F3cXJ6hIuNioJ5dXV7goiKh4J8eHh8gYWGhYF+fHx+gIKDgoF/f3+A";

/** คีย์ที่จำค่าสวิตช์เสียงไว้ (ต่อเบราว์เซอร์ ไม่ใช่ต่อบัญชี — เป็นความชอบของ "เครื่องนี้") */
export const CHAT_NOTIFY_SOUND_KEY = "shark.chat.notify.sound";

/** 1 แถวของรายการแชทเท่าที่การแจ้งเตือนต้องรู้ — ตรงกับที่หน้า inbox มีอยู่แล้ว */
export type ChatNotifyRow = {
  conversationId: string;
  /** จำนวนข้อความที่ทีมยังไม่ได้อ่านของห้องนั้น (`staffUnreadCount`) */
  unread: number;
  /** เวลาข้อความล่าสุด — ISO string หรือ epoch ms (ใช้จับ "ข้อความใหม่" ตอน unread ไม่ขยับ) */
  lastMessageAt?: string | number | null;
  /** ชื่อลูกค้า/ห้อง — ใช้เป็นหัวข้อของ Web Notification */
  title?: string | null;
  /** ตัวอย่างข้อความ — ใช้เป็นเนื้อของ Web Notification */
  preview?: string | null;
};

/** ลายเซ็นของแถว — เปลี่ยนเมื่อมี "ของใหม่" เท่านั้น (ไม่ใช่ทุกครั้งที่ poll) */
function rowSig(r: ChatNotifyRow): string {
  const at = r.lastMessageAt == null ? "" : String(r.lastMessageAt);
  return `${r.unread}|${at}`;
}

/**
 * ห้องไหนมีของใหม่เมื่อเทียบกับรอบก่อน — แยกเป็นฟังก์ชันบริสุทธิ์ให้ข้อสอบเรียกตรงได้
 *
 * 🔴 รอบแรกของหน้าจอ (`prev` ว่าง) ต้อง **ไม่นับเป็นของใหม่** ไม่งั้นเปิดหน้ามาก็มีเสียงเตือน
 *    ทั้งที่ไม่มีอะไรเข้ามาใหม่เลย (ของค้างเก่ากับของใหม่คนละเรื่องกัน)
 */
export function diffNewConversations(
  prev: Map<string, string> | null,
  rows: readonly ChatNotifyRow[],
  activeConversationId?: string | null,
): string[] {
  if (!prev) return [];
  const out: string[] = [];
  for (const r of rows) {
    if (r.conversationId === activeConversationId) continue;
    if (r.unread <= 0) continue;
    const before = prev.get(r.conversationId);
    if (before === undefined || before !== rowSig(r)) out.push(r.conversationId);
  }
  return out;
}

/** เลขที่ต้องขึ้นหน้า title = ผลรวมของค้างทุกห้อง ยกเว้นห้องที่กำลังเปิดดูอยู่ */
export function totalUnread(
  rows: readonly ChatNotifyRow[],
  activeConversationId?: string | null,
): number {
  return rows.reduce(
    (n, r) => n + (r.conversationId === activeConversationId ? 0 : Math.max(0, r.unread)),
    0,
  );
}

export type ChatNotifyClientProps = {
  /** รายการห้องปัจจุบัน — มาจาก polling ของหน้า inbox (สาย F) · คอมโพเนนต์นี้ไม่ poll เอง */
  rows: readonly ChatNotifyRow[];
  /** ห้องที่ผู้ใช้กำลังเปิดดูอยู่ (ถ้ามี) — ไม่นับ ไม่เตือน */
  activeConversationId?: string | null;
  /** ชื่อหน้าเดิม (ไม่ส่ง = ใช้ค่าที่อยู่บน document ตอน mount) */
  baseTitle?: string;
  /** ปิดการแจ้งเตือนทั้งก้อนชั่วคราว (เช่นหน้ากำลังโหลดครั้งแรก) */
  enabled?: boolean;
  /** ซ่อนแถบสวิตช์ (ถ้าหน้าอยากวาง UI เอง แล้วใช้แค่เสียง/title) */
  hideControls?: boolean;
  /** เรียกทุกครั้งที่มีห้องได้ของใหม่ — สาย F เอาไปทำสัญญาณบนแถว (ใช้ได้เมื่อพ่อแม่เป็น client component) */
  onNewConversations?: (conversationIds: string[]) => void;
};

export function ChatNotifyClient({
  rows,
  activeConversationId = null,
  baseTitle,
  enabled = true,
  hideControls = false,
  onNewConversations,
}: ChatNotifyClientProps) {
  const [soundOn, setSoundOn] = useState(true);
  const [permission, setPermission] = useState<"default" | "granted" | "denied" | "unsupported">(
    "default",
  );
  const prevSigRef = useRef<Map<string, string> | null>(null);
  const baseTitleRef = useRef<string>(baseTitle ?? "");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const soundOnRef = useRef(true);
  const onNewRef = useRef(onNewConversations);
  onNewRef.current = onNewConversations;

  const unread = useMemo(() => totalUnread(rows, activeConversationId), [rows, activeConversationId]);

  // ── ค่าที่จำไว้ในเครื่อง: สวิตช์เสียง + สถานะสิทธิ์ปัจจุบัน (อ่านอย่างเดียว ไม่ขอสิทธิ์) ──
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CHAT_NOTIFY_SOUND_KEY);
      if (saved === "off") setSoundOn(false);
    } catch {
      // โหมดส่วนตัว/บล็อก storage → ใช้ค่าเริ่มต้น (เปิดเสียง) ไปเงียบ ๆ
    }
    if (typeof Notification === "undefined") setPermission("unsupported");
    else setPermission(Notification.permission);
    if (!baseTitleRef.current) baseTitleRef.current = document.title;
  }, []);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(CHAT_NOTIFY_SOUND_KEY, next ? "on" : "off");
      } catch {
        // จำไม่ได้ก็ยังใช้งานรอบนี้ได้ — ไม่ต้องแจ้งผู้ใช้
      }
      return next;
    });
  }, []);

  // 🔴 ขอสิทธิ์แจ้งเตือน **เฉพาะตอนผู้ใช้กดปุ่มนี้เอง** — ห้ามย้ายไปอยู่ใน effect ตอน mount
  const askNotificationPermission = useCallback(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    try {
      void Notification.requestPermission()
        .then((p) => setPermission(p))
        .catch(() => {});
    } catch {
      // Safari รุ่นเก่าใช้แบบ callback แล้ว throw — ถือว่าไม่รองรับ
      setPermission("unsupported");
    }
  }, []);

  // ── เลขข้อความค้างบนหัวแท็บ ──
  useEffect(() => {
    const base = baseTitleRef.current || document.title;
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [unread]);

  // ── ของใหม่เข้ามา → เสียง + Web Notification + บอกสาย F ──
  useEffect(() => {
    if (!enabled) return;
    const next = new Map(rows.map((r) => [r.conversationId, rowSig(r)] as const));
    const fresh = diffNewConversations(prevSigRef.current, rows, activeConversationId);
    prevSigRef.current = next;
    if (fresh.length === 0) return;

    if (soundOnRef.current) {
      try {
        const el = (audioRef.current ??= new Audio(BEEP_WAV));
        el.currentTime = 0;
        void el.play().catch(() => {});
      } catch {
        // สร้าง Audio ไม่ได้ (SSR/เบราว์เซอร์เก่า) → เงียบ ห้ามพาหน้าจอพัง
      }
    }

    // เด้ง Web Notification เฉพาะตอนแท็บถูกซ่อน — เปิดหน้าอยู่ก็เห็นรายการอยู่แล้ว
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      const first = rows.find((r) => r.conversationId === fresh[0]);
      try {
        new Notification(`ลูกค้าทักเข้ามา${first?.title ? ` · ${first.title}` : ""}`, {
          body: first?.preview ? String(first.preview).slice(0, 140) : "มีข้อความใหม่ในกล่องแชท",
          tag: `chat-${fresh[0]}`,
        });
      } catch {
        // บางเบราว์เซอร์ต้องใช้ผ่าน service worker → ข้ามไป (เสียง+title ยังทำงาน)
      }
    }

    onNewRef.current?.(fresh);
  }, [rows, activeConversationId, enabled]);

  if (hideControls) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-[color:var(--color-muted)]">
      <button
        type="button"
        onClick={toggleSound}
        className="btn-sm"
        aria-pressed={soundOn}
        title={soundOn ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"}
      >
        {soundOn ? "🔔 เสียงเตือน: เปิด" : "🔕 เสียงเตือน: ปิด"}
      </button>
      {permission === "default" && (
        <button type="button" onClick={askNotificationPermission} className="btn-sm">
          เปิดแจ้งเตือนบนเบราว์เซอร์
        </button>
      )}
      {permission === "denied" && <span>เบราว์เซอร์บล็อกแจ้งเตือนไว้ — เปิดได้ที่ตั้งค่าเว็บไซต์</span>}
      {unread > 0 && <span>ค้าง {unread} ข้อความ</span>}
    </div>
  );
}

export default ChatNotifyClient;
